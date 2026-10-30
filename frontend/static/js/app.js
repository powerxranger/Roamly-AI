/* ============================================================
   Roamly AI — frontend
   Talks to:  POST   /api/travel  { message, thread_id }
              GET    /api/config          credential status
              POST   /api/config          set session keys
              DELETE /api/config          fall back to server .env
              GET    /health
   ============================================================ */
(function () {
  "use strict";

  /* ---------------- dom ---------------- */

  var $ = function (id) { return document.getElementById(id); };

  var conversation = $("conversation");
  var messages     = $("messages");
  var hero         = $("hero");
  var input        = $("input");
  var composer     = $("composer");
  var sendBtn      = $("sendBtn");
  var builder      = $("builder");
  var toastEl      = $("toast");

  var composerWrap = document.querySelector(".composer-wrap");

  var statusBtn    = $("apiStatus");
  var statusText   = statusBtn.querySelector(".status-text");

  var setupGate    = $("setupGate");
  var gateCreds    = $("gateCreds");
  var gateSub      = $("gateSub");
  var gateSave     = $("gateSave");

  var settingsModal = $("settingsModal");
  var settingsScrim = $("settingsScrim");
  var credList      = $("credList");
  var settingsSave  = $("settingsSave");

  /* ---------------- state ---------------- */

  var THEME_KEY = "travelbrain.theme";

  var threadId = null;   // LangGraph conversation thread for the current trip
  var activeDestination = null; // Active itinerary destination for subsequent follow-ups
  var busy = false;
  var config = null;     // last /api/config payload
  var savingConfig = false;

  /* Agent stepper to visually show the LangGraph pipeline in action */
  var AGENT_STEPS = [
    { id: "flight",     label: "Flight Agent",     sub: "Finding airports & routes",     icon: "M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2a.8.8 0 0 0-.8 1.3L8 11l-2 2-2.2-.5a.6.6 0 0 0-.6 1L5 16l2.5 1.8a.6.6 0 0 0 1-.6L8 15l2-2 3.5 4a.8.8 0 0 0 1.3-.8Z" },
    { id: "hotel",      label: "Hotel Agent",      sub: "Searching stays for your destination", icon: "M3 7v13M21 20V11a2 2 0 0 0-2-2h-6V4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v16M7 11h4M7 15h4" },
    { id: "weather",    label: "Weather Agent",    sub: "Checking forecast & conditions",      icon: "M3 15a4 4 0 0 0 4 4h9a5 5 0 1 0-.1-9.999 5.002 5.002 0 1 0-9.78 2.096A4.001 4.001 0 0 0 3 15Z" },
    { id: "itinerary",  label: "Itinerary Agent",  sub: "Building a realistic day-by-day plan", icon: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" },
    { id: "final",      label: "Final Agent",      sub: "Polishing everything into one clean plan", icon: "M9 12l2 2 4-4M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Z" }
  ];

  var ESTIMATED_MS = 65000;

  /* ---------------- utils ---------------- */

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function icon(paths, cls) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    if (cls) svg.setAttribute("class", cls);
    var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", paths);
    svg.appendChild(p);
    return svg;
  }

  var toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    requestAnimationFrame(function () { toastEl.classList.add("show"); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
      setTimeout(function () { toastEl.hidden = true; }, 250);
    }, 2800);
  }

  function scrollToEnd(smooth) {
    requestAnimationFrame(function () {
      conversation.scrollTo({ top: conversation.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    });
  }

  /* ---------------- theme ---------------- */

  function initTheme() {
    var stored = null;
    try { stored = localStorage.getItem(THEME_KEY); } catch (e) {}
    var prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
    document.documentElement.setAttribute("data-theme", stored || (prefersLight ? "light" : "dark"));
  }

  $("themeToggle").addEventListener("click", function () {
    var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  });

  /* ============================================================
     credentials / settings
     ============================================================ */

  function isReady() {
    return !!(config && config.ready);
  }

  /* The hero, the setup gate and the composer lock are all driven by one
     question: does the server have live credentials yet? */
  function updateEmptyState() {
    var hasMessages = messages.children.length > 0;
    var ready = isReady();

    setupGate.hidden = ready || hasMessages;
    hero.classList.toggle("is-hidden", !ready || hasMessages);

    composerWrap.classList.toggle("is-locked", !ready);
    input.disabled = !ready || busy;
    sendBtn.disabled = !ready || busy;
  }

  function applyConfig(data) {
    config = data;

    var missing = (data && data.missing) || [];

    if (data && data.ready) {
      statusBtn.setAttribute("data-state", "ok");
      statusText.textContent = "API connected";
      statusBtn.title = "All keys configured — open settings";
    } else {
      statusBtn.setAttribute("data-state", "setup");
      statusText.textContent = "No Live API";
      statusBtn.title = "No API keys configured — open settings";

      var labels = missing.map(function (name) {
        return (data.credentials[name] && data.credentials[name].label) || name;
      });

      gateSub.textContent = labels.length
        ? "The server has no " + joinAnd(labels) + " configured, so the agents cannot run. Add " +
          (labels.length === 1 ? "it" : "them") + " below to start planning."
        : "The server has no API keys configured, so the agents cannot run.";

      renderCreds(gateCreds);
    }

    if (!settingsModal.hidden) renderCreds(credList);

    updateEmptyState();
  }

  function joinAnd(list) {
    if (list.length <= 1) return list[0] || "";
    return list.slice(0, -1).join(", ") + " and " + list[list.length - 1];
  }

  function markUnreachable() {
    config = null;
    statusBtn.setAttribute("data-state", "down");
    statusText.textContent = "API unreachable";
    statusBtn.title = "Could not reach the server";
    updateEmptyState();
  }

  function refreshConfig() {
    return fetch("/api/config", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)); })
      .then(applyConfig)
      .catch(markUnreachable);
  }

  /* Renders one row per credential into the given container, showing where
     the value comes from and letting the user override it for this session.
     Used by both the centred gate and the settings modal, so lookups are
     scoped to the container rather than done by global id. */
  function renderCreds(container) {
    container.innerHTML = "";

    if (!config || !config.credentials) {
      container.appendChild(el("p", "cred-loading", "Loading…"));
      return;
    }

    Object.keys(config.credentials).forEach(function (name) {
      var info = config.credentials[name];

      var row = el("div", "cred");

      var head = el("div", "cred-head");
      head.appendChild(el("label", "cred-label", info.label));

      var badgeText = info.source === "env" ? "From server .env"
                    : info.source === "session" ? "Set for this session"
                    : "Not configured";

      head.appendChild(el("span", "badge badge-" + (info.source || "missing"), badgeText));
      row.appendChild(head);

      row.appendChild(el("p", "cred-hint", info.hint));

      var field = el("div", "cred-field");
      var box = el("input", "cred-input");
      box.type = "password";
      box.placeholder = info.configured ? "•••••••• (leave blank to keep)" : info.placeholder;
      box.autocomplete = "off";
      box.spellcheck = false;
      box.setAttribute("data-cred", name);
      field.appendChild(box);

      var reveal = el("button", "icon-btn sm");
      reveal.type = "button";
      reveal.title = "Show / hide";
      reveal.setAttribute("aria-label", "Show or hide value");
      reveal.appendChild(icon("M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"));
      reveal.addEventListener("click", function () {
        box.type = box.type === "password" ? "text" : "password";
      });
      field.appendChild(reveal);

      row.appendChild(field);

      var err = el("p", "cred-error");
      err.setAttribute("data-error-for", name);
      err.hidden = true;
      row.appendChild(err);

      container.appendChild(row);
    });
  }

  var FIELD_BY_NAME = {
    GROQ_API_KEY: "groq_api_key",
    DATABASE_URL: "database_url"
  };

  var NAME_BY_FIELD = {
    groq_api_key: "GROQ_API_KEY",
    database_url: "DATABASE_URL"
  };

  function openSettings() {
    settingsModal.hidden = false;
    settingsScrim.hidden = false;
    renderCreds(credList);
    refreshConfig();

    var first = credList.querySelector(".cred-input");
    if (first) first.focus();
  }

  function closeSettings() {
    settingsModal.hidden = true;
    settingsScrim.hidden = true;
  }

  function setSavingConfig(state, button) {
    savingConfig = state;
    [settingsSave, gateSave].forEach(function (b) { b.disabled = state; });
    if (button) button.classList.toggle("is-busy", state);
  }

  function saveCredentials(container, button) {
    if (savingConfig) return;

    var payload = {};
    var anything = false;

    container.querySelectorAll(".cred-input").forEach(function (box) {
      var value = box.value.trim();
      if (!value) return;
      anything = true;
      payload[FIELD_BY_NAME[box.getAttribute("data-cred")]] = value;
    });

    container.querySelectorAll(".cred-error").forEach(function (n) { n.hidden = true; });

    if (!anything) {
      toast("Enter a key first.");
      var empty = container.querySelector(".cred-input");
      if (empty) empty.focus();
      return;
    }

    setSavingConfig(true, button);

    fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (response) {
        return response.json().then(function (data) { return { ok: response.ok, data: data }; });
      })
      .then(function (out) {
        if (!out.ok || out.data.success === false) {
          var errors = out.data.errors || {};
          var shown = 0;

          Object.keys(errors).forEach(function (field) {
            var node = container.querySelector('[data-error-for="' + NAME_BY_FIELD[field] + '"]');
            if (node) {
              node.textContent = errors[field];
              node.hidden = false;
              shown++;
            }
          });

          toast(shown ? "Check the highlighted field." : (out.data.error || "Could not save."));
          return;
        }

        applyConfig(out.data);
        toast(out.data.ready ? "Connected." : "Saved — one key still missing.");
      })
      .catch(function () {
        toast("Could not reach the server.");
      })
      .then(function () {
        setSavingConfig(false, button);
      });
  }

  function resetSettings() {
    if (savingConfig) return;
    setSavingConfig(true, settingsSave);

    fetch("/api/config", { method: "DELETE" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        applyConfig(data);
        renderCreds(credList);
        toast("Session keys cleared.");
      })
      .catch(function () { toast("Could not reach the server."); })
      .then(function () { setSavingConfig(false, settingsSave); });
  }

  $("settingsBtn").addEventListener("click", openSettings);
  statusBtn.addEventListener("click", openSettings);
  $("settingsClose").addEventListener("click", closeSettings);
  settingsScrim.addEventListener("click", closeSettings);
  settingsSave.addEventListener("click", function () { saveCredentials(credList, settingsSave); });
  gateSave.addEventListener("click", function () { saveCredentials(gateCreds, gateSave); });
  $("settingsReset").addEventListener("click", resetSettings);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !settingsModal.hidden) closeSettings();
  });

  /* ============================================================
     message rendering
     ============================================================ */

  function renderUser(text) {
    var wrap = el("div", "msg msg-user");
    wrap.appendChild(el("div", "bubble-user", text));
    messages.appendChild(wrap);
    return wrap;
  }

  /* Agent fields are not always strings: MCP tools return content blocks
     (arrays of {type,text}) and raw tool payloads (objects). Coerce anything
     into renderable text rather than assuming .trim() exists. */
  function toText(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);

    if (Array.isArray(value)) {
      return value.map(toText).filter(Boolean).join("\n\n");
    }

    if (typeof value === "object") {
      // LangChain / MCP content block shapes
      if (typeof value.text === "string") return value.text;
      if (typeof value.content === "string") return value.content;
      if (Array.isArray(value.content)) return toText(value.content);

      try {
        return "```json\n" + JSON.stringify(value, null, 2) + "\n```";
      } catch (e) {
        return String(value);
      }
    }

    return String(value);
  }

  function mdBlock(source, emptyText) {
    var box = el("div", "md");
    var text = toText(source).trim();

    if (!text) {
      var empty = el("div", "md-empty");
      empty.appendChild(icon("M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"));
      empty.appendChild(el("span", null, emptyText || "No data returned for this section."));
      box.appendChild(empty);
      return box;
    }

    box.innerHTML = window.MD.render(text);
    return box;
  }

  function toolButton(label, pathD, handler) {
    var b = el("button", "icon-btn sm");
    b.type = "button";
    b.title = label;
    b.setAttribute("aria-label", label);
    b.appendChild(icon(pathD));
    b.addEventListener("click", handler);
    return b;
  }

  function plainTextOf(result) {
    var parts = ["# " + (result.__query || "Trip plan"), "", toText(result.answer)];
    if (result.budget_breakdown) parts.push("", toText(result.budget_breakdown));
    if (result.packing_list) parts.push("", toText(result.packing_list));
    if (result.must_visit) parts.push("", toText(result.must_visit));
    if (result.travel_essentials) parts.push("", toText(result.travel_essentials));
    return parts.join("\n");
  }

  function renderItineraryTimeline(text) {
    if (!text) return null;
    var source = toText(text);
    if (!source) return null;

    var dayRegex = /(?:^|\n)\s*(?:#{1,6}\s*)?(day\s*\d+|day\s*[ivxlcdm]+)/gi;
    var matches = [];
    var match;
    while ((match = dayRegex.exec(source)) !== null) {
      matches.push({ index: match.index, value: match[0] });
    }

    if (matches.length < 2) return null;

    var wrap = el("div", "itinerary-timeline-wrap");

    var head = el("div", "itinerary-timeline-head");
    var title = el("div", "itinerary-timeline-title");
    title.appendChild(el("strong", null, "Day by Day Timeline"));
    title.appendChild(el("small", null, "Clean view of your itinerary at a glance • Click days to filter"));
    head.appendChild(title);
    wrap.appendChild(head);

    // Interactive Day Filter Strip
    var filterStrip = el("div", "itinerary-day-filter-strip");
    var btnAll = el("button", "day-filter-btn active", "🌟 All Days (" + matches.length + ")");
    btnAll.type = "button";
    filterStrip.appendChild(btnAll);

    var dayBtns = [];
    var timelineItems = [];

    btnAll.addEventListener("click", function () {
      dayBtns.forEach(function (b) { b.classList.remove("active"); });
      btnAll.classList.add("active");
      timelineItems.forEach(function (it) { it.style.display = ""; });
    });

    wrap.appendChild(filterStrip);

    var list = el("div", "itinerary-timeline-list");

    for (var i = 0; i < matches.length; i++) {
      var start = matches[i].index;
      var end = i + 1 < matches.length ? matches[i + 1].index : source.length;
      var chunk = source.slice(start, end).trim();
      if (!chunk) continue;

      var lines = chunk.split(/\r?\n/);
      var dayLabel = lines[0].replace(/^#+\s*/i, "").trim().replace(/:$/, "");
      var bodyText = lines.slice(1).join("\n").trim();

      var sections = [
        { key: "morning", title: "Morning" },
        { key: "afternoon", title: "Afternoon" },
        { key: "evening", title: "Evening" },
        { key: "night", title: "Night" }
      ];

      var blocks = [];
      sections.forEach(function (sec) {
        var re = new RegExp("(?:^|\\n)\\s*(?:#{0,6}\\s*)?(" + sec.key + ")\\s*:?-?\\s*([\\s\\S]*?)(?=\\n\\s*(?:#{0,6}\\s*)?(?:morning|afternoon|evening|night)\\s*:|\\n\\s*(?:#{1,6}\\s*)?(?:day\\s*\\d+|day\\s*[ivxlcdm]+)|$)", "i");
        var m = re.exec(bodyText);
        if (m && m[2]) {
          var t = m[2].replace(/\n{3,}/g, "\n\n").trim();
          if (t) blocks.push({ title: sec.title, text: t });
        }
      });

      if (blocks.length === 0 && bodyText) {
        blocks.push({ title: "Plan for the day", text: bodyText.replace(/^\s*[-*]\s*/gm, "- ").trim() });
      }

      var item = el("div", "itinerary-timeline-item");
      timelineItems.push(item);

      // Create filter button for this day
      var mDayNum = dayLabel.match(/Day\s*\d+/i);
      var shortDay = mDayNum ? mDayNum[0] : ("Day " + (i + 1));
      var btnDay = el("button", "day-filter-btn", shortDay);
      btnDay.type = "button";
      (function (targetIdx, buttonEl) {
        buttonEl.addEventListener("click", function () {
          btnAll.classList.remove("active");
          dayBtns.forEach(function (b) { b.classList.remove("active"); });
          buttonEl.classList.add("active");
          timelineItems.forEach(function (it, idx) {
            it.style.display = idx === targetIdx ? "" : "none";
          });
        });
      })(i, btnDay);
      dayBtns.push(btnDay);
      filterStrip.appendChild(btnDay);

      var railDot = el("div", "itinerary-timeline-dot");
      railDot.appendChild(icon("M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"));
      item.appendChild(railDot);

      var card = el("article", "itinerary-timeline-card");
      var cHead = el("div", "itinerary-timeline-card-head");
      var cTitle = el("div", "itinerary-timeline-day");
      var lblSpan = el("span", "itinerary-timeline-day-label");
      lblSpan.innerHTML = window.MD && window.MD.inline ? window.MD.inline(dayLabel) : dayLabel;
      cTitle.appendChild(lblSpan);
      cTitle.appendChild(el("span", "itinerary-timeline-day-title", "Itinerary"));
      cTitle.appendChild(el("span", "itinerary-timeline-day-sub", "Suggested plan for this day"));
      cHead.appendChild(cTitle);

      var bookmarkBtn = el("button", "day-bookmark-btn", "⭐");
      bookmarkBtn.type = "button";
      bookmarkBtn.title = "Save or highlight this day";
      bookmarkBtn.addEventListener("click", function () {
        bookmarkBtn.classList.toggle("bookmarked");
        card.classList.toggle("saved-day");
      });
      cHead.appendChild(bookmarkBtn);

      card.appendChild(cHead);

      var cBody = el("div", "itinerary-timeline-card-body");
      blocks.forEach(function (b) {
        var blk = el("div", "itinerary-timeline-block");
        var bHead = el("div", "itinerary-timeline-block-head");
        bHead.appendChild(el("span", "itinerary-timeline-block-dot"));
        bHead.appendChild(el("span", "itinerary-timeline-block-title", b.title));
        blk.appendChild(bHead);
        var bText = el("div", "itinerary-timeline-block-text");
        bText.innerHTML = window.MD && window.MD.render ? window.MD.render(b.text) : b.text;
        blk.appendChild(bText);
        cBody.appendChild(blk);
      });
      card.appendChild(cBody);

      item.appendChild(card);
      list.appendChild(item);
    }

    wrap.appendChild(list);
    return wrap;
  }

  function isGreetingOrBanter(text) {
    if (!text) return false;
    var s = String(text).toLowerCase().replace(/[?!.,;]+$/, '').trim();
    return /^(?:hey+|heya|heyo|hello+|hi+|hiya+|yo+|sup|howdy|aloha|hola|bonjour|greetings?)\b/i.test(s) ||
      /\b(?:how(?:'s| is|s)?\s*(?:it|things?|you|u|life)|what(?:'s|s)?\s*up|how\s+are\s+you|how\s+its\s+going|how\s+it\s+going)\b/i.test(s) ||
      /\b(?:how\s+are\s+things|how\s+are\s+you\s+doing)\b/i.test(s) ||
      /^(?:bro|mate|dude|buddy|friend)\b/i.test(s);
  }

  function isOutOfTheBoxOrMeta(text) {
    if (!text) return false;
    var s = String(text).toLowerCase().trim();
    return /\bintroduce\s+(?:your|ur)self\b/i.test(s) ||
      /\bwho\s+(?:are|r)\s+(?:you|u)\b/i.test(s) ||
      /\bwhat\s+(?:are|r)\s+(?:you|u)\b/i.test(s) ||
      /\bwhat\s+is\s+roamly\b/i.test(s) ||
      /\btell\s+me\s+about\s+(?:your|ur)self\b/i.test(s) ||
      /\bwhat\s+can\s+(?:you|u)\s+do\b/i.test(s) ||
      /\bwhat\s+do\s+(?:you|u)\s+do\b/i.test(s) ||
      /\b(?:your|ur)\s+capabilities\b/i.test(s) ||
      /\bhow\s+do\s+(?:you|u)\s+work\b/i.test(s) ||
      /\bwho\s+(?:made|created)\s+(?:you|u)\b/i.test(s) ||
      /\btell\s+me\s+a\s+joke\b/i.test(s) ||
      /\bwhy\s+do\s+people\s+travel\b/i.test(s);
  }

  function isIncomprehensibleOrIrrelevant(text) {
    if (!text) return true;
    var s = String(text).toLowerCase().replace(/[?!.,;:@#$%^&*()_+=/\-\[\]{}|~`'"]+/g, '').trim();
    if (!s) return true;
    if (/\b(?:asdf|asdfgh|asdfghjkl|qwerty|qwertyuiop|zxcv|zxcvbnm|kjsd|lkjh|poiuy)\b/i.test(s)) return true;
    var letters = s.replace(/[^a-z]/g, '');
    if (letters.length >= 5) {
      if (!/[aeiouy]/.test(letters)) return true;
      if (/(.)\1{4,}/.test(letters)) return true;
    }
    return false;
  }

  function extractOrigin(text) {
    if (!text) return null;
    var t = String(text);
    var m = t.match(/\b(?:from|departing\s+from|departing|leaving\s+from|leaving|out\s+of|origin[:\s]+)\s+([A-Za-z\s,-]{2,30}?)(?=[.,;!?]|\s+(?:to\b|in\b|for\b|with\b|on\b|during\b|departing\b|under\b|budget\b|find\b|flights?\b|hotels?\b|weather\b|and\b|$)|$)/i);
    if (!m) return null;
    var res = m[1].replace(/^[,\s.-]+|[,\s.-]+$/g, "").replace(/\s+/g, " ").trim();
    if (/^(?:chaos|scratch|home|now|here|me|there|airport|centre|center)$/i.test(res)) return null;
    return res.length >= 2 ? res : null;
  }

  function extractDestination(text) {
    if (!text) return null;
    var t = String(text);
    if (isGreetingOrBanter(t) || isOutOfTheBoxOrMeta(t) || isIncomprehensibleOrIrrelevant(t)) {
      return null;
    }
          return majors[i];
        }
      }
      return null;
    }

    // Extract Origin first so it is NEVER mistaken for Destination
    var origin = extractOrigin(t);
    var origLower = origin ? origin.toLowerCase() : null;

    // 1. "from [origin] to [destination]"
    var mFromTo = t.match(/\bfrom\s+[A-Za-z\s,-]{2,25}?\s+to\s+([A-Za-z\s,-]{2,25})/i);
    if (mFromTo && mFromTo[1]) {
      var cFromTo = mFromTo[1].replace(/\b(?:like|maybe|please|just)\b/gi, "").trim();
      if (cFromTo && (!origLower || cFromTo.toLowerCase() !== origLower)) return cFromTo;
    }

    // 2. "[destination] (?:trip|vacation|getaway|tour|holiday|itinerary)" e.g. "5 day Paris trip" -> "Paris"
    var mTrip = t.match(/\b([A-Za-z\s]{2,25}?)\s+(?:trip|getaway|vacation|tour|holiday|itinerary)\b/i);
    if (mTrip && mTrip[1]) {
      var rawC = mTrip[1].replace(/\b(?:want|wanna|plan|create|build|need|book|a|an|the|\d+|day|days|night|nights|beach|scenic|rail|short|long|budget|luxury|solo|family|custom)\b/gi, "").trim();
      if (rawC && rawC.length >= 2 && (!origLower || rawC.toLowerCase() !== origLower)) {
        return rawC;
      }
    }

    // 3. Dedicated check for calm places in [destination]
    var mCalm = t.match(/\b(?:calm|peaceful|quiet|scenic|relaxing|hidden)\s+(?:place|places|spot|spots|retreat)\s+(?:in|around|at|of)\s+([A-Za-z\s,-]{2,30})/i);
    if (mCalm && mCalm[1]) {
      var c = mCalm[1].replace(/\b(?:like|maybe|please|just|chaos|free time|locate me)\b/gi, "").trim();
      if (c && c.length <= 30 && (!origLower || c.toLowerCase() !== origLower)) return c;
    }

    // 4. Known Major destinations, strictly excluding origin
    var majors = ["Saudi Arabia", "AlUla", "Riyadh", "Jeddah", "Abha", "Dubai", "UAE", "Abu Dhabi", "Japan", "Tokyo", "Kyoto", "Osaka", "Bali", "Paris", "Rome", "Italy", "Switzerland", "London"];
    for (var i = 0; i < majors.length; i++) {
      if (origLower && (majors[i].toLowerCase() === origLower || origLower.includes(majors[i].toLowerCase()) || majors[i].toLowerCase().includes(origLower))) {
        continue;
      }
      if (new RegExp("\\b" + majors[i] + "\\b", "i").test(t)) {
        return majors[i];
      }
    }

    var m = t.match(/(?:to|visit|explore|travel to)\s+([A-Za-z][A-Za-z\s,&-]{2,35}?)(?=[.,;!?]|\s+(?:from|for|in\s+\d|with|on|departing|under|budget|\.|\,|$)|$)/i);
    if (!m) m = t.match(/trip\s+to\s+([A-Za-z][A-Za-z\s,&-]{2,35})/i);
    if (!m) return null;
    var res = m[1].replace(/\b(?:like|maybe|please|just|chaos|wanna|free time|locate me|some calm)\b/gi, "").replace(/\s+/g, " ").trim();
    if (origLower && res.toLowerCase() === origLower) return null;
    return (res.length > 30 || /\b(?:chaos|free time)\b/i.test(res)) ? null : res;
  }

  function extractTravellers(text) {
    if (!text) return 2;
    var t = String(text);
    var m = t.match(/(\d+)\s*(?:traveller|travelers|people|person)/i);
    if (m) return parseInt(m[1], 10) || 2;
    if (/for\s+two\b|couple|with\s+bae/i.test(t)) return 2;
    if (/solo|alone/i.test(t)) return 1;
    return 2;
  }

  function renderTripOverview(query) {
    if (!query) return null;
    var text = String(query);

    var overview = el("div", "trip-overview");
    var head = el("div", "trip-overview-head");
    head.appendChild(el("span", "trip-overview-label", "Trip Overview"));
    head.appendChild(el("span", "trip-overview-sub", "Pulled from your request"));
    overview.appendChild(head);

    var grid = el("div", "trip-overview-grid");

    function addCard(label, iconPath, extract) {
      var val = extract(text);
      if (!val) return;
      var card = el("div", "trip-overview-card");
      var ico = el("div", "trip-overview-ico");
      ico.appendChild(icon(iconPath));
      card.appendChild(ico);
      var body = el("div", "trip-overview-body");
      body.appendChild(el("span", "trip-overview-card-label", label));
      body.appendChild(el("span", "trip-overview-card-value", val));
      card.appendChild(body);
      grid.appendChild(card);
    }

    addCard("Destination", "M12 21s-6-5.686-6-10a6 6 0 1 1 12 0c0 4.314-6 10-6 10Zm0-7a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", extractDestination);
    addCard("Origin", "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10", extractOrigin);

    addCard("Duration", "M12 6v6l4 2M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Z", function (t) {
      var m = t.match(/(\d+)\s*(?:day|days)/i);
      if (m) return m[1] + " Days";
      m = t.match(/(\d+)\s*(?:night|nights)/i);
      if (m) return m[1] + " Nights";
      return null;
    });

    addCard("Travellers", "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 14v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75", function (t) {
      var m = t.match(/(\d+)\s*(?:traveller|travelers|people|person)/i);
      if (m) return m[1] + (m[1] === "1" ? " Traveller" : " Travellers");
      m = t.match(/for\s+two\b/i);
      if (m) return "2 Travellers";
      return null;
    });

    addCard("Budget", "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6", function (t) {
      if (!t) return null;
      var str = String(t);
      // Lakhs
      var mLakh = str.match(/(?:budget|cost|under|max)?\s*(?:of\s*)?([₹$€£¥])?\s*(\d+(?:\.\d+)?)\s*(?:lakhs?|lacs?)\b/i);
      if (mLakh) return (mLakh[1] || "₹") + mLakh[2] + " Lakh";
      // Prefix symbol
      var mSym = str.match(/(?:budget|cost|under|max)?\s*(?:of\s*)?([₹$€£¥])\s*([\d,]+(?:\.\d+)?)/i);
      if (mSym) return mSym[1] + mSym[2];
      // Named currency (e.g. 80000 euro, 5000 usd, 4500 gbp, 500000 yen, 160000 inr)
      var mNamed = str.match(/(?:budget|cost|under|max)?\s*(?:of\s*)?([\d,]+(?:\.\d+)?)\s*(?:k\s*)?(euro|euros|eur|gbp|pounds?|usd|dollars?|jpy|yen|inr|rupees?|rs\.?|aed|sar)\b/i);
      if (mNamed) {
        var curr = mNamed[2].toLowerCase();
        var sym = "";
        if (/euro|eur/i.test(curr)) sym = "€";
        else if (/gbp|pound/i.test(curr)) sym = "£";
        else if (/usd|dollar/i.test(curr)) sym = "$";
        else if (/jpy|yen/i.test(curr)) sym = "¥";
        else if (/inr|rupee|rs/i.test(curr)) sym = "₹";
        else if (/aed/i.test(curr)) sym = "AED ";
        else if (/sar/i.test(curr)) sym = "SAR ";
        else sym = curr.toUpperCase() + " ";
        var num = mNamed[1];
        var val = parseInt(num.replace(/,/g, ""), 10);
        return sym + (val ? val.toLocaleString() : num);
      }
      return null;
    });

    addCard("Timing", "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z", function (t) {
      var m = t.match(/(?:in|during)\s+(January|February|March|April|May|June|July|August|September|October|November|December|next month|this month)/i);
      if (m) return m[1];
      m = t.match(/departing\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
      if (m) return m[1];
      return null;
    });

    if (grid.children.length === 0) return null;
    overview.appendChild(grid);
    return overview;
  }

  function renderExtraSection(title, subtitle, iconPath, content) {
    var text = toText(content).trim();
    if (!text) return null;

    var wrap = el("div", "extra-card");
    var head = el("div", "extra-card-head");
    var ico = el("div", "extra-card-ico");
    ico.appendChild(icon(iconPath));
    head.appendChild(ico);
    var tbox = el("div", "extra-card-title");
    tbox.appendChild(el("strong", null, title));
    if (subtitle) tbox.appendChild(el("small", null, subtitle));
    head.appendChild(tbox);
    wrap.appendChild(head);

    var body = el("div", "extra-card-body");
    body.appendChild(mdBlock(text, "No data available."));
    wrap.appendChild(body);
    return wrap;
  }

  function renderPackingChecklist(content) {
    var text = toText(content).trim();
    if (!text) return null;

    var wrap = el("div", "extra-card");
    var head = el("div", "extra-card-head");
    var ico = el("div", "extra-card-ico");
    ico.appendChild(icon("M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"));
    head.appendChild(ico);
    var tbox = el("div", "extra-card-title");
    tbox.appendChild(el("strong", null, "Interactive Packing Checklist"));
    tbox.appendChild(el("small", null, "Tick items as you pack • Live progress tracker"));
    head.appendChild(tbox);
    wrap.appendChild(head);

    var body = el("div", "extra-card-body");

    // Progress Bar & Counter
    var progressWrap = el("div", "packing-progress-wrap");
    var progressTop = el("div", "packing-progress-top");
    var progressLabel = el("span", "packing-progress-label", "0 / 0 items packed (0%)");
    progressTop.appendChild(progressLabel);

    var actions = el("div", "packing-quick-actions");
    var btnCheckAll = el("button", "packing-action-btn", "Check all");
    btnCheckAll.type = "button";
    var btnReset = el("button", "packing-action-btn", "Reset");
    btnReset.type = "button";
    actions.appendChild(btnCheckAll);
    actions.appendChild(btnReset);
    progressTop.appendChild(actions);
    progressWrap.appendChild(progressTop);

    var progressBarTrack = el("div", "packing-progress-track");
    var progressBarFill = el("div", "packing-progress-fill");
    progressBarTrack.appendChild(progressBarFill);
    progressWrap.appendChild(progressBarTrack);
    body.appendChild(progressWrap);

    var list = el("div", "packing-list");
    var allCheckboxes = [];

    function updateProgress() {
      var total = allCheckboxes.length;
      if (total === 0) return;
      var checked = allCheckboxes.filter(function (c) { return c.checked; }).length;
      var pct = Math.round((checked / total) * 100);
      progressBarFill.style.width = pct + "%";
      progressLabel.textContent = checked + " / " + total + " items packed (" + pct + "%)";
      if (pct === 100) {
        progressBarFill.style.background = "#10b981";
        progressLabel.textContent = "🎉 All " + total + " items packed! You're ready to go!";
      } else {
        progressBarFill.style.background = "#0d9488";
      }
    }

    btnCheckAll.addEventListener("click", function () {
      allCheckboxes.forEach(function (cb) {
        cb.checked = true;
        var parentItem = cb.closest(".packing-item");
        if (parentItem) parentItem.classList.add("packed");
      });
      updateProgress();
    });

    btnReset.addEventListener("click", function () {
      allCheckboxes.forEach(function (cb) {
        cb.checked = false;
        var parentItem = cb.closest(".packing-item");
        if (parentItem) parentItem.classList.remove("packed");
      });
      updateProgress();
    });

    var groups = text.split(/\n\s*\n/);
    groups.forEach(function (group) {
      var lines = group.split(/\r?\n/).map(function (l) { return l.replace(/^#+\s*/i, "").trim(); }).filter(Boolean);
      if (lines.length === 0) return;
      var g = el("div", "packing-group");
      var gh = el("div", "packing-group-head");
      gh.innerHTML = window.MD && window.MD.inline ? window.MD.inline(lines[0]) : lines[0];
      g.appendChild(gh);
      var gb = el("div", "packing-group-body");
      lines.slice(1).forEach(function (line) {
        var item = el("label", "packing-item");
        var cb = document.createElement("input");
        cb.type = "checkbox";
        allCheckboxes.push(cb);
        cb.addEventListener("change", function () {
          item.classList.toggle("packed", cb.checked);
          updateProgress();
        });
        item.appendChild(cb);
        var itemSpan = el("span");
        var cleanLine = line.replace(/^[-*•]\s*/i, "").replace(/^\[\s*\]\s*/i, "");
        itemSpan.innerHTML = window.MD && window.MD.inline ? window.MD.inline(cleanLine) : cleanLine;
        item.appendChild(itemSpan);
        gb.appendChild(item);
      });
      if (gb.children.length === 0) return;
      g.appendChild(gb);
      list.appendChild(g);
    });

    if (list.children.length === 0) {
      body.appendChild(mdBlock(text, "No data available."));
    } else {
      body.appendChild(list);
      updateProgress();
    }

    // Add personal item adder form (appended at last)
    var addForm = el("form", "packing-add-row");
    addForm.style.display = "flex";
    addForm.style.gap = "8px";
    addForm.style.marginTop = "14px";
    addForm.style.flexWrap = "wrap";

    var addInput = document.createElement("input");
    addInput.type = "text";
    addInput.placeholder = "+ Add personal item (e.g., Camera lens, medicines, hiking boots)...";
    addInput.className = "packing-add-text";
    addInput.style.flex = "1";
    addInput.style.minWidth = "200px";
    addInput.style.padding = "8px 12px";
    addInput.style.borderRadius = "8px";
    addInput.style.border = "1px solid var(--border-strong)";
    addInput.style.background = "var(--surface-2)";
    addInput.style.color = "var(--text)";
    addInput.style.fontSize = "13px";

    var addBtn = el("button", "btn btn-primary btn-sm packing-add-submit", "+ Add to List");
    addBtn.type = "submit";
    addBtn.style.padding = "0 14px";
    addBtn.style.height = "36px";
    addBtn.style.borderRadius = "8px";
    addBtn.style.fontWeight = "600";
    addBtn.style.cursor = "pointer";

    addForm.appendChild(addInput);
    addForm.appendChild(addBtn);

    addForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var val = (addInput.value || "").trim();
      if (!val) return;

      var lastGroup = list.querySelector(".packing-group-custom");
      if (!lastGroup) {
        lastGroup = el("div", "packing-group packing-group-custom");
        var gh = el("div", "packing-group-head");
        gh.innerHTML = "<strong>🎒 Personal & Custom Items</strong>";
        lastGroup.appendChild(gh);
        var gb = el("div", "packing-group-body");
        lastGroup.appendChild(gb);
        list.appendChild(lastGroup);
      }

      var targetBody = lastGroup.querySelector(".packing-group-body") || lastGroup;
      var item = el("label", "packing-item");
      var cb = document.createElement("input");
      cb.type = "checkbox";
      allCheckboxes.push(cb);
      cb.addEventListener("change", function () {
        item.classList.toggle("packed", cb.checked);
        updateProgress();
      });
      item.appendChild(cb);
      var itemSpan = el("span");
      itemSpan.textContent = val + " — Custom personal item";
      item.appendChild(itemSpan);
      targetBody.appendChild(item);

      addInput.value = "";
      updateProgress();
    });

    body.appendChild(addForm);
    wrap.appendChild(body);
    return wrap;
  }

  /* ---------------- feature 1: booking deeplinks ---------------- */

  function renderBookingShortcuts(dest, origin) {
    if (!dest) return null;
    var d = encodeURIComponent(dest);
    var o = origin ? encodeURIComponent(origin) : "";

    var wrap = el("div", "booking-shortcuts");
    var head = el("div", "booking-shortcuts-head");
    var title = el("div", "booking-shortcuts-title");
    title.appendChild(icon("M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"));
    title.appendChild(el("span", null, "Instant Booking Shortcuts"));
    head.appendChild(title);

    var hint = el("span", "booking-shortcuts-hint", "Pre-filtered for " + dest);
    head.appendChild(hint);
    wrap.appendChild(head);

    var pills = el("div", "booking-pills");

    var flightsUrl = o
      ? "https://www.google.com/travel/flights?q=flights+from+" + o + "+to+" + d
      : "https://www.google.com/travel/flights?q=flights+to+" + d;
    var skyscannerUrl = o
      ? "https://www.skyscanner.com/transport/flights/" + o + "/" + d
      : "https://www.skyscanner.com/flights-to/" + d;
    var bookingUrl = "https://www.booking.com/searchresults.html?ss=" + d;
    var airbnbUrl = "https://www.airbnb.com/s/" + d + "/homes";
    var gygUrl = "https://www.getyourguide.com/s/?q=" + d;

    var links = [
      { name: "Google Flights", icon: "✈️", url: flightsUrl },
      { name: "Skyscanner", icon: "🛫", url: skyscannerUrl },
      { name: "Booking.com", icon: "🏨", url: bookingUrl },
      { name: "Airbnb", icon: "🏡", url: airbnbUrl },
      { name: "GetYourGuide Activities", icon: "🎟️", url: gygUrl }
    ];

    links.forEach(function (item) {
      var a = el("a", "booking-pill");
      a.href = item.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";

      var ico = el("span", "booking-pill-ico", item.icon);
      a.appendChild(ico);

      var txt = el("span", null, item.name);
      a.appendChild(txt);

      var arrow = el("span", "booking-pill-arrow", "↗");
      a.appendChild(arrow);

      pills.appendChild(a);
    });

    wrap.appendChild(pills);
    return wrap;
  }

  /* ---------------- feature 2: interactive destination map ---------------- */

  function renderDestinationMap(dest) {
    if (!dest) return null;

    var wrap = el("div", "destination-map-wrap");
    var head = el("div", "destination-map-head");
    head.appendChild(el("span", null, "📍 Interactive Destination Map — " + dest));
    head.appendChild(el("small", null, "OpenStreetMap • Pinch / Scroll to Zoom"));
    wrap.appendChild(head);

    var mapId = "map-" + Math.random().toString(36).substring(2, 9);
    var frame = el("div", "destination-map-frame");
    frame.id = mapId;
    wrap.appendChild(frame);

    setTimeout(function () {
      if (typeof window.L === "undefined") return;
      var elMap = document.getElementById(mapId);
      if (!elMap) return;

      var cities = dest.split(/\s+to\s+|\s+and\s+|,\s*/i)
        .map(function (s) { return s.trim(); })
        .filter(function (s) { return s.length > 2 && !/^(trip|vacation|tour|holiday)$/i.test(s); });

      if (cities.length === 0) cities = [dest];

      var geocodePromises = cities.map(function (cityName) {
        return fetch("https://nominatim.openstreetmap.org/search?format=json&q=" + encodeURIComponent(cityName) + "&limit=1", {
          headers: { "Accept-Language": "en" }
        })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            if (data && data.length > 0) {
              return {
                name: cityName,
                lat: parseFloat(data[0].lat),
                lon: parseFloat(data[0].lon)
              };
            }
            return null;
          })
          .catch(function () { return null; });
      });

      Promise.all(geocodePromises).then(function (points) {
        var valid = points.filter(Boolean);
        var map = L.map(mapId, { scrollWheelZoom: false });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18,
          attribution: "© OpenStreetMap contributors"
        }).addTo(map);

        if (valid.length > 0) {
          try {
            var destLon = valid[0].lon;
            var offsetHours = Math.round(destLon / 15);
            var now = new Date();
            var utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
            var destDate = new Date(utcMs + (offsetHours * 3600000));
            var hrs = String(destDate.getHours()).padStart(2, "0");
            var mins = String(destDate.getMinutes()).padStart(2, "0");
            var sign = offsetHours >= 0 ? "+" : "";
            var timePill = el("span", "dest-time-badge", "🕒 Local Time: " + hrs + ":" + mins + " (UTC" + sign + offsetHours + ")");
            head.appendChild(timePill);
          } catch (e) {}
        }

        if (valid.length === 0) {
          map.setView([20.0, 0.0], 2);
          return;
        }

        var coords = [];
        valid.forEach(function (pt, idx) {
          coords.push([pt.lat, pt.lon]);
          var marker = L.marker([pt.lat, pt.lon]).addTo(map);
          var badge = valid.length > 1 ? ("Stop " + (idx + 1) + ": ") : "";
          marker.bindPopup("<b>" + badge + pt.name + "</b>").openPopup();
        });

        if (coords.length > 1) {
          L.polyline(coords, {
            color: "#0d9488",
            dashArray: "6, 8",
            weight: 3,
            opacity: 0.85
          }).addTo(map);
          map.fitBounds(L.latLngBounds(coords), { padding: [35, 35] });
        } else {
          map.setView(coords[0], 11);
        }
      }).catch(function () {
        try {
          var fallbackMap = L.map(mapId, { scrollWheelZoom: false }).setView([20.0, 0.0], 2);
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 18,
            attribution: "© OpenStreetMap contributors"
          }).addTo(fallbackMap);
        } catch (err) {}
      });
    }, 150);

    return wrap;
  }

  /* ---------------- feature 4: currency & split calculator ---------------- */

  function renderBudgetSectionWithCalculator(content, travellersCount) {
    var text = toText(content).trim();
    if (!text) return null;

    var wrap = el("div", "extra-card");
    var head = el("div", "extra-card-head");
    var ico = el("div", "extra-card-ico");
    ico.appendChild(icon("M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"));
    head.appendChild(ico);
    var tbox = el("div", "extra-card-title");
    tbox.appendChild(el("strong", null, "Budget Breakdown & Expense Splitter"));
    tbox.appendChild(el("small", null, "Estimated costs, live currency conversion & per-person split"));
    head.appendChild(tbox);
    wrap.appendChild(head);

    var body = el("div", "extra-card-body");

    var rates = {
      INR: 83.0,
      USD: 1.0,
      EUR: 0.92,
      GBP: 0.79,
      JPY: 155.0
    };
    var symbols = {
      INR: "₹",
      USD: "$",
      EUR: "€",
      GBP: "£",
      JPY: "¥"
    };

    var detectedTotal = 120000;
    var detectedCurr = "INR";

    // Support Lakhs / Lacs (e.g. 15 Lakh, ₹15 Lacs)
    var mLakh = text.match(/(\d+(?:\.\d+)?)\s*(?:lakh|lakhs|lac|lacs)\b/i);
    if (mLakh) {
      detectedTotal = Math.round(parseFloat(mLakh[1]) * 100000);
      detectedCurr = "INR";
    } else {
      var mTotalWithCurr = text.match(
        /(?:total(?:\s+estimated)?\s+cost|estimated\s+total|total\s+budget|grand\s+total)[:\s]*([₹$€£¥]|(?:rs\.?|inr|usd|eur|gbp|jpy)\b)?\s*([\d,]{3,10})(?:\s*(k|thousand))?\s*(euro|euros|eur|gbp|pounds?|usd|dollars?|jpy|yen|inr|rupees?|rs\.?)?/i
      );
      if (mTotalWithCurr) {
        var symPrefix = mTotalWithCurr[1];
        var numRaw = mTotalWithCurr[2].replace(/,/g, "");
        var multiplier = mTotalWithCurr[3] ? 1000 : 1;
        var symSuffix = mTotalWithCurr[4];
        var val = parseInt(numRaw, 10) * multiplier;
        if (val > 0) {
          detectedTotal = val;
          var token = symPrefix || symSuffix || "";
          detectedCurr = getCurrencyFromToken(token, "INR");
        }
      } else {
        var mSym = text.match(/([₹$€£¥])\s*([\d,]{3,10})/);
        if (mSym) {
          var val = parseInt(mSym[2].replace(/,/g, ""), 10);
          if (val > 0) {
            detectedTotal = val;
            detectedCurr = getCurrencyFromToken(mSym[1], "INR");
          }
        } else {
          var mSuffix = text.match(/([\d,]{3,10})\s*(?:k\s*)?(euro|euros|eur|gbp|pounds?|usd|dollars?|jpy|yen|inr|rupees?|rs\.?)\b/i);
          if (mSuffix) {
            var val = parseInt(mSuffix[1].replace(/,/g, ""), 10);
            if (val > 0) {
              detectedTotal = val;
              detectedCurr = getCurrencyFromToken(mSuffix[2], "INR");
            }
          }
        }
      }
    }

    var baseUsd = detectedTotal / (rates[detectedCurr] || 1);
    var currentCurr = detectedCurr;
    var currentPeople = travellersCount > 0 ? travellersCount : 2;

    var calcBar = el("div", "budget-calc-bar");

    var row1 = el("div", "budget-calc-row");
    var label1 = el("span", "budget-calc-label", "Currency");
    row1.appendChild(label1);

    var currs = el("div", "budget-currencies");
    var currButtons = {};
    ["INR", "USD", "EUR", "GBP", "JPY"].forEach(function (c) {
      var btn = el("button", "currency-btn" + (c === currentCurr ? " active" : ""));
      btn.type = "button";
      btn.textContent = symbols[c] + " " + c;
      currButtons[c] = btn;
      btn.addEventListener("click", function () {
        currentCurr = c;
        Object.keys(currButtons).forEach(function (k) {
          currButtons[k].classList.toggle("active", k === c);
        });
        updateSplit();
      });
      currs.appendChild(btn);
    });
    row1.appendChild(currs);
    calcBar.appendChild(row1);

    var row2 = el("div", "budget-calc-row");
    var label2 = el("span", "budget-calc-label", "Split Bill");
    row2.appendChild(label2);

    var splitControls = el("div", "budget-split-controls");
    var minusBtn = el("button", "split-btn", "-");
    minusBtn.type = "button";
    var splitCount = el("span", "split-count", currentPeople + (currentPeople === 1 ? " Person" : " People"));
    var plusBtn = el("button", "split-btn", "+");
    plusBtn.type = "button";

    minusBtn.addEventListener("click", function () {
      if (currentPeople > 1) {
        currentPeople--;
        splitCount.textContent = currentPeople + (currentPeople === 1 ? " Person" : " People");
        updateSplit();
      }
    });

    plusBtn.addEventListener("click", function () {
      if (currentPeople < 20) {
        currentPeople++;
        splitCount.textContent = currentPeople + " People";
        updateSplit();
      }
    });

    splitControls.appendChild(minusBtn);
    splitControls.appendChild(splitCount);
    splitControls.appendChild(plusBtn);
    row2.appendChild(splitControls);
    calcBar.appendChild(row2);

    var splitDisplay = el("div", "budget-split-display");
    var splitTitle = el("span", null, "Estimated Per Person");
    var splitVal = el("span", null, "");
    splitDisplay.appendChild(splitTitle);
    splitDisplay.appendChild(splitVal);
    calcBar.appendChild(splitDisplay);

    // Feature: Visual Segmented Expense Distribution Bar
    var distWrap = el("div", "budget-dist-wrap");
    var distHead = el("div", "budget-dist-head");
    distHead.appendChild(el("span", "budget-dist-title", "Estimated Expense Allocation"));
    distWrap.appendChild(distHead);

    var distBar = el("div", "budget-dist-bar");
    var segments = [
      { name: "Flights", pct: 35, color: "#0d9488", icon: "✈️" },
      { name: "Stay", pct: 35, color: "#0284c7", icon: "🏨" },
      { name: "Food", pct: 18, color: "#f59e0b", icon: "🍜" },
      { name: "Activities", pct: 12, color: "#8b5cf6", icon: "🎟️" },
    ];
    segments.forEach(function (seg) {
      var segEl = el("div", "budget-dist-seg");
      segEl.style.width = seg.pct + "%";
      segEl.style.backgroundColor = seg.color;
      segEl.title = seg.name + ": ~" + seg.pct + "%";
      distBar.appendChild(segEl);
    });
    distWrap.appendChild(distBar);

    var distLegend = el("div", "budget-dist-legend");
    var legendItems = {};
    segments.forEach(function (seg) {
      var item = el("div", "budget-dist-legend-item");
      var dot = el("span", "budget-dist-dot");
      dot.style.backgroundColor = seg.color;
      item.appendChild(dot);
      var label = el("span", "budget-dist-legend-text", seg.icon + " " + seg.name + " (" + seg.pct + "%): ");
      var val = el("strong", "budget-dist-legend-val", "");
      legendItems[seg.name] = { val: val, pct: seg.pct };
      item.appendChild(label);
      item.appendChild(val);
      distLegend.appendChild(item);
    });
    distWrap.appendChild(distLegend);
    calcBar.appendChild(distWrap);

    function formatNumber(n, curr) {
      if (curr === "INR") {
        return n.toLocaleString("en-IN");
      }
      return n.toLocaleString("en-US");
    }

    function formatConvertedNumber(val, curr) {
      if (val >= 1) {
        var rounded = Math.round(val);
        if (curr === "INR") return rounded.toLocaleString("en-IN");
        return rounded.toLocaleString("en-US");
      }
      if (val > 0) return val.toFixed(2);
      return "0";
    }

    function getCurrencyFromToken(tok, fallback) {
      if (!tok) return fallback || "INR";
      var t = tok.trim().toLowerCase();
      if (t === "₹" || /^rs\.?$/i.test(t) || /^inr$/i.test(t) || /rupee/i.test(t) || /lakh/i.test(t)) return "INR";
      if (t === "$" || /^usd$/i.test(t) || /dollar/i.test(t)) return "USD";
      if (t === "€" || /^eur(?:o|os)?$/i.test(t)) return "EUR";
      if (t === "£" || /^gbp$/i.test(t) || /pound/i.test(t)) return "GBP";
      if (t === "¥" || /^jpy$/i.test(t) || /yen/i.test(t)) return "JPY";
      return fallback || "INR";
    }

    function transformBudgetText(rawText, baseCurr, toCurr) {
      if (!rawText) return "";
      baseCurr = baseCurr || "INR";
      toCurr = toCurr || "INR";
      if (baseCurr === toCurr) return rawText;

      var tokens = [];
      function saveToken(str) {
        var id = "__ROAMLY_CURR_TOKEN_" + tokens.length + "__";
        tokens.push(str);
        return id;
      }

      var out = String(rawText);

      // 1. Dual currency mentions e.g. (¥800 / ₹450) or ¥1,500 / ₹830 or ₹45,000 / $550
      out = out.replace(
        /(?:[([]\s*)?([₹$€£¥]|Rs\.?|INR|EUR|USD|GBP|JPY)\s*([\d,]+(?:\.\d+)?)\s*(?:\/|\s+(?:or|approx\.?|about|~)\s+)\s*([₹$€£¥]|Rs\.?|INR|EUR|USD|GBP|JPY)\s*([\d,]+(?:\.\d+)?)(?:\s*[)\]])?/gi,
        function (match, sym1, num1, sym2, num2) {
          var c1 = getCurrencyFromToken(sym1, baseCurr);
          var c2 = getCurrencyFromToken(sym2, baseCurr);
          var v1 = parseFloat(num1.replace(/,/g, ""));
          var v2 = parseFloat(num2.replace(/,/g, ""));
          var converted;
          if (c1 === toCurr) converted = v1;
          else if (c2 === toCurr) converted = v2;
          else converted = v1 * ((rates[toCurr] || 1) / (rates[c1] || 1));
          return saveToken(symbols[toCurr] + formatConvertedNumber(converted, toCurr));
        }
      );

      // 2. Lakhs notation
      out = out.replace(
        /(?:([₹$€£¥]|Rs\.?|INR)\s*)?(\d+(?:\.\d+)?)\s*(?:lakhs?|lacs?)\b/gi,
        function (match, sym, numStr) {
          var valInInr = parseFloat(numStr) * 100000;
          var ratio = (rates[toCurr] || 1) / (rates["INR"] || 1);
          return saveToken(symbols[toCurr] + formatConvertedNumber(valInInr * ratio, toCurr));
        }
      );

      // 3. Number Ranges
      out = out.replace(
        /([₹$€£¥]|Rs\.?|INR|EUR|USD|GBP|JPY)\s*([\d,]+(?:\.\d+)?)\s*(?:–|—|-|to|\band\b)\s*([₹$€£¥]|Rs\.?|INR|EUR|USD|GBP|JPY)?\s*([\d,]+(?:\.\d+)?)/gi,
        function (match, sym1, num1, sym2, num2) {
          var src1 = getCurrencyFromToken(sym1, baseCurr);
          var src2 = sym2 ? getCurrencyFromToken(sym2, src1) : src1;
          var v1 = parseFloat(num1.replace(/,/g, ""));
          var v2 = parseFloat(num2.replace(/,/g, ""));
          if (isNaN(v1) || isNaN(v2)) return match;
          var c1 = v1 * ((rates[toCurr] || 1) / (rates[src1] || 1));
          var c2 = v2 * ((rates[toCurr] || 1) / (rates[src2] || 1));
          return saveToken(symbols[toCurr] + formatConvertedNumber(c1, toCurr) + " – " + symbols[toCurr] + formatConvertedNumber(c2, toCurr));
        }
      );

      // 4. Single amounts with prefix
      out = out.replace(
        /([₹$€£¥]|Rs\.?|INR|EUR|USD|GBP|JPY)\s*([\d,]+(?:\.\d+)?)/gi,
        function (match, sym, numStr) {
          var src = getCurrencyFromToken(sym, baseCurr);
          var v = parseFloat(numStr.replace(/,/g, ""));
          if (isNaN(v)) return match;
          var c = v * ((rates[toCurr] || 1) / (rates[src] || 1));
          return saveToken(symbols[toCurr] + formatConvertedNumber(c, toCurr));
        }
      );

      // 5. Trailing currency notation (e.g. 45,000 INR, 80000 euro, 80,000 EUR, 45,000/-, 45000 Rs)
      out = out.replace(
        /([\d,]+(?:\.\d+)?)\s*(?:-\/|\/-\s*(?:INR)?|\b(?:INR|Rs\.?|EUR|euro|euros|GBP|pounds?|USD|dollars?|JPY|yen)\b)/gi,
        function (match, numStr) {
          var v = parseFloat(numStr.replace(/,/g, ""));
          if (isNaN(v)) return match;
          var src = getCurrencyFromToken(match, baseCurr);
          var c = v * ((rates[toCurr] || 1) / (rates[src] || 1));
          return saveToken(symbols[toCurr] + formatConvertedNumber(c, toCurr));
        }
      );

      // 6. Currency labels and phrases
      out = out
        .replace(/\b(?:in\s+)?Indian\s+Rupees\s*(?:\(INR\))?/gi, "in " + toCurr + " (" + symbols[toCurr] + ")")
        .replace(/\b(?:in\s+)?Rupees\b/gi, "in " + toCurr)
        .replace(/\b(?:in\s+)?Euros?\b/gi, "in " + toCurr)
        .replace(/\b(?:in\s+)?Pounds?\b/gi, "in " + toCurr)
        .replace(/\b(?:in\s+)?Dollars?\b/gi, "in " + toCurr)
        .replace(/\b(?:in\s+)?Yen\b/gi, "in " + toCurr)
        .replace(/\b(?:in\s+)?(?:INR|EUR|USD|GBP|JPY)\b/gi, toCurr)
        .replace(/\bCurrency:\s*(?:INR|USD|EUR|GBP|JPY)\b/gi, "Currency: " + toCurr)
        .replace(/\b(?:All\s+prices|Prices|Estimated\s+Cost|Cost)\s+in\s+[₹$€£¥]/gi, "Prices in " + symbols[toCurr])
        .replace(/\([₹$€£¥]\)/g, "(" + symbols[toCurr] + ")");

      // 7. Restore tokens
      tokens.forEach(function (val, idx) {
        out = out.replace("__ROAMLY_CURR_TOKEN_" + idx + "__", val);
      });

      return out;
    }

    var mdBlockEl = mdBlock(transformBudgetText(text, detectedCurr, currentCurr), "No budget breakdown available.");

    function updateSplit() {
      var convertedTotal = Math.round(baseUsd * rates[currentCurr]);
      var perPerson = Math.round(convertedTotal / currentPeople);
      splitVal.textContent = symbols[currentCurr] + " " + formatNumber(perPerson, currentCurr) + " (" + symbols[currentCurr] + " " + formatNumber(convertedTotal, currentCurr) + " total)";

      segments.forEach(function (seg) {
        var segAmt = Math.round(convertedTotal * (seg.pct / 100));
        if (legendItems[seg.name]) {
          legendItems[seg.name].val.textContent = symbols[currentCurr] + " " + formatNumber(segAmt, currentCurr);
        }
      });

      if (mdBlockEl) {
        var convertedText = transformBudgetText(text, detectedCurr, currentCurr);
        mdBlockEl.innerHTML = window.MD && window.MD.render ? window.MD.render(convertedText) : convertedText;
      }
    }

    updateSplit();
    body.appendChild(calcBar);
    body.appendChild(mdBlockEl);
    wrap.appendChild(body);
    return wrap;
  }

  /* ---------------- feature 5: weather strip & wardrobe ---------------- */

  function renderWeatherStrip(weatherData, query) {
    var text = toText(weatherData);
    var qText = String(query || "");

    var temp = "22°C";
    var mTemp = text.match(/(-?\d+(?:\.\d+)?)\s*°\s*C/i);
    if (!mTemp) mTemp = text.match(/temp(?:erature)?[:\s*]+(-?\d+(?:\.\d+)?)/i);
    if (mTemp) {
      temp = Math.round(parseFloat(mTemp[1])) + "°C";
    } else {
      if (/summer|july|august|may|june|beach|bali|phuket|dubai/i.test(qText + " " + text)) temp = "29°C";
      else if (/winter|december|january|february|snow|switzerland|alps/i.test(qText + " " + text)) temp = "6°C";
      else temp = "22°C";
    }

    var numericTemp = parseInt(temp, 10);

    var condition = "Sunny & Clear";
    if (/rain|shower|drizzle|storm/i.test(text + " " + qText)) condition = "Rain Showers";
    else if (/cloud|overcast/i.test(text)) condition = "Partly Cloudy";
    else if (/snow|blizzard/i.test(text + " " + qText)) condition = "Snow & Cold";
    else if (/clear|sunny/i.test(text)) condition = "Clear & Sunny";

    var advice = "Comfortable walking shoes, breathable cotton layers & sunglasses.";
    if (numericTemp <= 12 || /snow|winter|cold/i.test(text + " " + qText)) {
      advice = "Pack thermal innerwear, a heavy woollen coat, gloves & waterproof winter boots.";
    } else if (numericTemp >= 27 || /beach|island|tropical|resort/i.test(text + " " + qText)) {
      advice = "Light breathable linens, swimwear, UV sunglasses, sunhat & high-SPF sunscreen.";
    } else if (/rain|monsoon/i.test(condition)) {
      advice = "Waterproof trench coat or light rain shell, compact windproof umbrella & slip-resistant footwear.";
    }

    var wrap = el("div", "weather-strip-wrap");
    var head = el("div", "weather-strip-head");
    var title = el("div", "weather-strip-title");
    title.appendChild(icon("M12 3v2M12 19v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z"));
    title.appendChild(el("span", null, "Weather & Wardrobe Guide"));
    head.appendChild(title);
    wrap.appendChild(head);

    var cardsRow = el("div", "weather-cards-row");

    function addMetric(label, val) {
      var c = el("div", "weather-metric-card");
      c.appendChild(el("span", "weather-metric-label", label));
      c.appendChild(el("span", "weather-metric-val", val));
      cardsRow.appendChild(c);
    }

    addMetric("Avg Temp", "🌡️ " + temp);
    addMetric("Condition", "🌤️ " + condition);
    addMetric("Rain Risk", /rain/i.test(condition) ? "🌧️ High" : "☀️ Low");

    wrap.appendChild(cardsRow);

    var advicePill = el("div", "weather-advice-pill");
    advicePill.appendChild(el("span", null, "👕"));
    var adviceText = el("span");
    adviceText.innerHTML = "<strong>What to Pack & Wear:</strong> " + advice;
    advicePill.appendChild(adviceText);
    wrap.appendChild(advicePill);

    return wrap;
  }

  /* ---------------- feature 7: quick follow-up action chips ---------------- */

  function renderFollowupChips(dest) {
    var cleanDest = dest ? String(dest).replace(/^[,.\s-]+|[,.\s-]+$/g, "").trim() : "";
    var isInvalid = !cleanDest || cleanDest.length < 2 || cleanDest.length > 30 || /[?!]/.test(cleanDest) ||
      /\b(?:how|its|it's|going|bro|hey|hello|doing|asking|wanna|chaos|locate|free time|destination|custom|introduce|yourself|urself|who|can you|capabilities)\b/i.test(cleanDest) ||
      /\b(?:asdf|qwerty|zxcv|kjsd|lkjh)\b/i.test(cleanDest);

    var suggestions = !isInvalid
      ? [
          "🍝 Best local street food & budget eats in " + cleanDest,
          "🚇 Public transport guide & transit passes for " + cleanDest,
          "🌧️ Rainy day & bad weather backup itinerary in " + cleanDest,
          "💡 Top travel scams to avoid & safety tips for " + cleanDest,
          "📸 5 most photogenic hidden photo spots in " + cleanDest
        ]
      : [
          "🏜️ Calm & peaceful retreats in Saudi Arabia away from chaos",
          "🌸 7-day Japan trip focused on food, temples and culture",
          "✨ Curated local food and hidden gems in Dubai",
          "🍕 Authentic trattorias and historic walks in Rome, Italy",
          "🏔️ Scenic mountain rail & lakeside getaway in Switzerland"
        ];

    var wrap = el("div", "followup-chips-wrap");
    var title = el("div", "followup-chips-title");
    title.appendChild(icon("M13 10V3L4 14h7v7l9-11h-7z"));
    title.appendChild(el("span", null, !isInvalid ? "Ask a Follow-up Question" : "Popular Travel Inspirations & Questions"));
    wrap.appendChild(title);

    var list = el("div", "followup-chips-list");
    suggestions.forEach(function (promptText) {
      var chip = el("button", "followup-chip");
      chip.type = "button";
      chip.textContent = promptText;
      chip.addEventListener("click", function () {
        if (busy) return;
        input.value = promptText;
        autosize();
        send(promptText);
      });
      list.appendChild(chip);
    });
    wrap.appendChild(list);
    return wrap;
  }

  function renderResult(result) {
    var card = el("article", "card");

    /* head */
    var head = el("div", "card-head");
    var avatar = el("div", "card-avatar");
    avatar.appendChild(icon("M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2a.8.8 0 0 0-.8 1.3L8 11l-2 2-2.2-.5a.6.6 0 0 0-.6 1L5 16l2.5 1.8a.6.6 0 0 0 1-.6L8 15l2-2 3.5 4a.8.8 0 0 0 1.3-.8Z"));
    head.appendChild(avatar);

    var titleBox = el("div", "card-title");
    titleBox.appendChild(el("strong", null, "Roamly AI"));
    titleBox.appendChild(el("small", null, "Plan ready"));
    head.appendChild(titleBox);

    var tools = el("div", "card-tools");

    tools.appendChild(toolButton("Copy plan", "M8 4h10a2 2 0 0 1 2 2v10M16 8H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2Z", function () {
      var text = plainTextOf(result);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () { toast("Plan copied to clipboard"); },
          function () { toast("Could not copy"); }
        );
      } else {
        toast("Clipboard not available");
      }
    }));

    tools.appendChild(toolButton("Download as Markdown", "M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2", function () {
      var blob = new Blob([plainTextOf(result)], { type: "text/markdown;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "roamly-plan.md";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }));

    tools.appendChild(toolButton("Print", "M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14h12v7H6z", function () {
      window.print();
    }));

    head.appendChild(tools);
    card.appendChild(head);

    /* one message: the final assembled plan. */
    var body = el("div", "card-body");

    var dest = extractDestination(result.__query) || extractDestination(result.answer) || "Destination";
    var origin = extractOrigin(result.__query);
    var travellersCount = extractTravellers(result.__query);

    // 1. Overview Tiles
    var overview = renderTripOverview(result.__query);
    if (overview) {
      body.appendChild(overview);
    }

    // 2. Feature 1: Booking Shortcuts (Google Flights, Skyscanner, Booking.com, Airbnb, GetYourGuide)
    var shortcuts = renderBookingShortcuts(dest, origin);
    if (shortcuts) {
      body.appendChild(shortcuts);
    }

    // 3. Feature 2: Interactive Destination Map (Leaflet.js + OSM)
    var map = renderDestinationMap(dest);
    if (map) {
      body.appendChild(map);
    }

    function extractSectionText(src, header) {
      if (!src) return "";
      var re = new RegExp("(?:###|\\*\\*|##)\\s*" + header + "[\\s\\S]*?(?=(?:###|\\*\\*|##)\\s*(?:Flight|Weather|Hotel|Itinerary|Budget|Packing|Must-Visit|Travel|Practical|Day)|\\Z)", "i");
      var m = String(src).match(re);
      return m ? m[0] : "";
    }

    // 4. Step 1 in Flow: Flight Information Card
    var flightText = result.flight_results || extractSectionText(result.answer, "Flight Information");
    if (flightText) {
      var flightCard = renderExtraSection(
        "Flight Information & Airfare",
        "Airlines serving route, airports, durations & estimated airfare",
        "M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2a.8.8 0 0 0-.8 1.3L8 11l-2 2-2.2-.5a.6.6 0 0 0-.6 1L5 16l2.5 1.8a.6.6 0 0 0 1-.6L8 15l2-2 3.5 4a.8.8 0 0 0 1.3-.8Z",
        flightText
      );
      if (flightCard) body.appendChild(flightCard);
    }

    // 5. Step 2 in Flow: Weather Strip & Climate Guidance
    var weatherStrip = renderWeatherStrip(result.weather_results || result.answer, result.__query);
    if (weatherStrip) {
      body.appendChild(weatherStrip);
    }

    // 6. Step 3 in Flow: Hotel Suggestions & Accommodations
    var hotelText = result.hotel_results || extractSectionText(result.answer, "Hotel Suggestions");
    if (hotelText) {
      var hotelCard = renderExtraSection(
        "Hotel Suggestions & Stays",
        "Top recommended accommodations, prime areas & estimated rates",
        "M3 21h18M3 7v14M21 7v14M6 11h4M6 15h4M14 11h4M14 15h4M9 3h6v4H9z",
        hotelText
      );
      if (hotelCard) body.appendChild(hotelCard);
    }

    // 7. Step 4 in Flow: Day-by-Day Timeline Itinerary
    var timeline = renderItineraryTimeline(result.itinerary || result.answer);
    if (timeline) {
      body.appendChild(timeline);
    }

    // 8. Step 5 in Flow: Budget Breakdown, Packing Checklist & Essentials
    var extraWrap = el("div", "extra-sections");

    // Feature 4: Budget Breakdown with Currency & Split-Bill Calculator
    var bText = result.budget_breakdown || extractSectionText(result.answer, "Budget Breakdown") || ("### Budget Breakdown\n- Total Estimated Cost: " + (result.__query || "₹1,50,000"));
    var budget = renderBudgetSectionWithCalculator(bText, travellersCount);
    if (budget) extraWrap.appendChild(budget);

    var pText = result.packing_list || extractSectionText(result.answer, "Packing Checklist") || ("### Packing Checklist\n- Essentials: Passport, ID, Tickets, Credit Cards\n- Clothing: Weather-appropriate layers, comfortable walking pants\n- Footwear: Cushioned walking sneakers, hiking shoes\n- Electronics: Chargers, universal plug adapter, power bank\n- Toiletries: Sunscreen, lip balm, travel med kit");
    var packing = renderPackingChecklist(pText);
    if (packing) extraWrap.appendChild(packing);

    var exploreText = result.must_visit || extractSectionText(result.answer, "Must-Visit") || ("### Must-Visit & Local Picks\n- Top Attractions: Key sights and historic monuments\n- Hidden Gems: Local bazaars and panoramic viewpoints\n- Local Food & Drinks: Traditional delicacies and street snacks");
    var explore = renderExtraSection("Must-Visit & Local Picks", "Attractions, hidden gems & food", "M12 21s-6-5.686-6-10a6 6 0 1 1 12 0c0 4.314-6 10-6 10Zm0-7a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", exploreText);
    if (explore) extraWrap.appendChild(explore);

    var essentialsText = result.travel_essentials || extractSectionText(result.answer, "Travel Essentials") || ("### Travel Essentials\n- Visa: Check entry requirements and passport validity\n- Currency: Local currency & major card acceptance\n- Plugs: Standard travel adapter\n- Safety: Official ride-hailing apps and emergency contacts");
    var essentials = renderExtraSection("Travel Essentials", "Visa, currency, plugs & more", "M9 12l2 2 4-4M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Z", essentialsText);
    if (essentials) extraWrap.appendChild(essentials);

    if (extraWrap.children.length > 0) {
      body.appendChild(extraWrap);
    }

    // 9. Quick Follow-up Action Chips
    var followups = renderFollowupChips(dest);
    if (followups) {
      body.appendChild(followups);
    }

    card.appendChild(body);

    var wrap = el("div", "msg msg-assistant");
    wrap.appendChild(card);
    messages.appendChild(wrap);
    return wrap;
  }

  function renderConciergeResult(result) {
    var card = el("article", "card concierge-card");

    var head = el("div", "card-head");
    var avatar = el("div", "card-avatar concierge-avatar");
    avatar.appendChild(icon("M12 2a10 10 0 1 0 10 10H12V2z"));
    head.appendChild(avatar);

    var titleBox = el("div", "card-title");
    titleBox.appendChild(el("strong", null, "Roamly Concierge"));
    titleBox.appendChild(el("small", null, "Local Insider Guide"));
    head.appendChild(titleBox);

    var tools = el("div", "card-tools");
    tools.appendChild(toolButton("Copy advice", "M8 4h10a2 2 0 0 1 2 2v10M16 8H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2Z", function () {
      var text = toText(result.answer);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () { toast("Copied to clipboard"); },
          function () { toast("Could not copy"); }
        );
      }
    }));
    tools.appendChild(toolButton("Print", "M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14h12v7H6z", function () {
      window.print();
    }));
    head.appendChild(tools);
    card.appendChild(head);

    var body = el("div", "card-body");
    body.appendChild(mdBlock(result.answer, "No details returned."));

    var queryText = result.__query || "";
    var isGreeting = isGreetingOrBanter(queryText);
    var isMeta = isOutOfTheBoxOrMeta(queryText);
    var isIrrelevant = isIncomprehensibleOrIrrelevant(queryText);
    var isNonDest = isGreeting || isMeta || isIrrelevant || result.destination === "";

    var dest = "";
    if (!isNonDest) {
      if (result.destination) {
        dest = result.destination;
      }
      if (!dest) {
        dest = extractDestination(queryText);
      }
    }
    var followups = renderFollowupChips(dest);
    if (followups) body.appendChild(followups);

    card.appendChild(body);

    var wrap = el("div", "msg msg-assistant");
    wrap.appendChild(card);
    messages.appendChild(wrap);
    return wrap;
  }

  function renderError(message, kind) {
    var card = el("article", "card error-card");
    var body = el("div", "error-body");
    body.appendChild(icon("M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z", "error-ico"));

    var copy = {
      server: {
        title: "The planner could not finish",
        detail: "The request reached the server but the agent run failed. Check the uvicorn console for the full traceback."
      },
      network: {
        title: "Could not reach the server",
        detail: "The request never completed. Check that the server is still running."
      },
      render: {
        title: "The plan came back, but could not be displayed",
        detail: "The agents returned data in an unexpected shape. This is a frontend issue, not an agent failure."
      },
      setup: {
        title: "Missing credentials",
        detail: "Add the required keys in Settings, or set them in the server's .env file."
      }
    }[kind || "server"];

    var textBox = el("div");
    textBox.appendChild(el("strong", null, copy.title));
    textBox.appendChild(el("p", null, copy.detail));
    textBox.appendChild(el("code", null, message));

    if (kind === "setup") {
      var open = el("button", "btn btn-soft btn-sm", "Open settings");
      open.type = "button";
      open.addEventListener("click", openSettings);
      textBox.appendChild(open);
    }

    body.appendChild(textBox);
    card.appendChild(body);

    var wrap = el("div", "msg msg-assistant");
    wrap.appendChild(card);
    messages.appendChild(wrap);
    return wrap;
  }

  /* ---------------- pipeline (agent stepper) ---------------- */

  function renderPipeline() {
    var card = el("article", "card agent-stepper-card");

    var head = el("div", "agent-stepper-head");
    var headTitle = el("div", "agent-stepper-title");
    headTitle.appendChild(el("strong", null, "Agents at work"));
    headTitle.appendChild(el("small", null, "Running the LangGraph pipeline step by step"));
    head.appendChild(headTitle);

    var meta = el("span", "progress-meta");
    var pct = el("b", null, "0%");
    meta.appendChild(pct);
    meta.appendChild(el("span", "progress-sep", "·"));
    var timer = el("span", null, "0s");
    meta.appendChild(timer);
    head.appendChild(meta);
    card.appendChild(head);

    var track = el("div", "progress-track");
    var fill = el("div", "progress-fill");
    track.appendChild(fill);
    card.appendChild(track);

    var list = el("div", "agent-stepper-list");
    var steps = [];

    AGENT_STEPS.forEach(function (step, idx) {
      var item = el("div", "agent-step");
      item.setAttribute("data-step", step.id);

      var rail = el("div", "agent-step-rail");
      var dot = el("div", "agent-step-dot");
      dot.appendChild(icon(step.icon, "agent-step-ico"));
      rail.appendChild(dot);
      if (idx < AGENT_STEPS.length - 1) {
        rail.appendChild(el("div", "agent-step-line"));
      }
      item.appendChild(rail);

      var body = el("div", "agent-step-body");
      body.appendChild(el("div", "agent-step-label", step.label));
      body.appendChild(el("div", "agent-step-sub", step.sub));
      item.appendChild(body);

      var status = el("div", "agent-step-status");
      status.appendChild(el("span", "agent-step-pill", "Pending"));
      item.appendChild(status);

      list.appendChild(item);
      steps.push({ item: item, pill: status.querySelector(".agent-step-pill") });
    });

    card.appendChild(list);

    var wrap = el("div", "msg msg-assistant");
    wrap.appendChild(card);
    messages.appendChild(wrap);

    var started = Date.now();
    var currentIdx = -1;

    function setStep(index, state) {
      if (index < 0 || index >= steps.length) return;
      var s = steps[index];
      s.item.classList.remove("is-pending", "is-active", "is-done");
      s.item.classList.add("is-" + state);
      if (state === "active") {
        s.pill.textContent = "In progress";
      } else if (state === "done") {
        s.pill.textContent = "Done";
      } else {
        s.pill.textContent = "Pending";
      }
    }

    AGENT_STEPS.forEach(function (_, idx) { setStep(idx, "pending"); });

    function tick() {
      var elapsed = Date.now() - started;
      var ratio = Math.min(elapsed / ESTIMATED_MS, 0.97);

      fill.style.width = (ratio * 100).toFixed(1) + "%";
      pct.textContent = Math.round(ratio * 100) + "%";
      timer.textContent = Math.floor(elapsed / 1000) + "s";

      var idx = Math.floor(ratio * AGENT_STEPS.length);
      if (idx >= AGENT_STEPS.length) idx = AGENT_STEPS.length - 1;
      if (idx < 0) idx = 0;

      if (idx !== currentIdx) {
        for (var i = 0; i < AGENT_STEPS.length; i++) {
          if (i < idx) setStep(i, "done");
          else if (i === idx) setStep(i, "active");
          else setStep(i, "pending");
        }
        currentIdx = idx;
      }
    }

    tick();
    var interval = setInterval(tick, 250);

    return {
      node: wrap,
      finish: function () {
        clearInterval(interval);
        fill.style.width = "100%";
        pct.textContent = "100%";
        for (var i = 0; i < AGENT_STEPS.length; i++) {
          setStep(i, "done");
        }
        var pills = card.querySelectorAll(".agent-step-pill");
        pills.forEach(function (p) { p.textContent = "Done"; });
      }
    };
  }

  /* ---------------- sending ---------------- */

  function setBusy(state) {
    busy = state;
    sendBtn.classList.toggle("is-busy", state);
    updateEmptyState();
  }

  function send(text) {
    if (busy) return;

    var message = String(text == null ? input.value : text).trim();
    if (!message) return;

    if (!isReady()) {
      toast("No live API — add your keys first.");
      updateEmptyState();
      return;
    }

    input.value = "";
    autosize();
    setBusy(true);

    renderUser(message);
    updateEmptyState();
    var pipeline = renderPipeline();
    scrollToEnd(true);

    fetch("/api/travel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message, thread_id: threadId, destination: activeDestination })
    })
      .catch(function (e) {
        e.__kind = "network";
        throw e;
      })
      .then(function (response) {
        return response.json()
          .catch(function () { throw new Error("Server returned a non-JSON response (HTTP " + response.status + ")"); })
          .then(function (data) {
            if (!response.ok || data.success === false) {
              var err = new Error(data.error || ("Request failed with HTTP " + response.status));
              // 428 Precondition Required = a credential is missing.
              if (response.status === 428) err.__kind = "setup";
              throw err;
            }
            return data;
          });
      })
      .then(function (data) {
        pipeline.finish();
        pipeline.node.remove();

        data.__query = message;
        data.__title = deriveTripTitle(message);
        threadId = data.thread_id || threadId;
        if (data.destination && !/your destination/i.test(data.destination)) {
          activeDestination = data.destination;
        }

        // A rendering bug here must not be reported as an agent failure.
        try {
          if (data.is_followup) {
            renderConciergeResult(data);
          } else {
            renderResult(data);
          }
        } catch (e) {
          console.error("renderResult failed", e, data);
          renderError(e.message || String(e), "render");
        }

        scrollToEnd(true);
      })
      .catch(function (err) {
        pipeline.finish();
        if (pipeline.node.parentNode) pipeline.node.remove();
        renderError(err.message || String(err), err.__kind || "server");
        scrollToEnd(true);
        refreshConfig();
      })
      .then(function () {
        setBusy(false);
        input.focus();
      });
  }

  /* ---------------- trips ---------------- */

  function deriveTripTitle(query) {
    if (!query) return "New Trip";
    var text = String(query);
    var dest = null;
    var m = text.match(/(?:to|in)\s+([A-Za-z][A-Za-z\s,&-]{2,40}?)(?=\s+from|\s+for|\s+in\s+\d|\s+with|\s+on|\s+departing|\.|,|\n|$)/i);
    if (!m) m = text.match(/trip\s+to\s+([A-Za-z][A-Za-z\s,&-]{2,40})/i);
    if (m) dest = m[1].replace(/\s+/g, " ").trim();
    var days = null;
    var dm = text.match(/(\d+)\s*(?:day|days)/i);
    if (dm) days = dm[1] + "D";
    var parts = [];
    if (dest) parts.push(dest);
    if (days) parts.push(days);
    return parts.length ? parts.join(" • ") : "Travel Plan";
  }

  function startNewTrip() {
    if (busy) { toast("Wait for the current plan to finish."); return; }
    threadId = null;
    activeDestination = null;
    messages.innerHTML = "";
    updateEmptyState();
    if (isReady()) input.focus();
  }

  $("newTripBtn").addEventListener("click", startNewTrip);

  var heroStartBtn = $("heroStartBtn");
  if (heroStartBtn) {
    heroStartBtn.addEventListener("click", function () {
      if (!isReady()) {
        toast("No live API — add your keys first.");
        openSettings();
        updateEmptyState();
        return;
      }
      input.focus();
      input.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  /* ---------------- composer ---------------- */

  function autosize() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 200) + "px";
  }

  input.addEventListener("input", autosize);

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  composer.addEventListener("submit", function (e) {
    e.preventDefault();
    send();
  });

  document.querySelectorAll(".suggestion").forEach(function (btn) {
    btn.addEventListener("click", function () {
      send(btn.getAttribute("data-prompt"));
    });
  });

  /* ---------------- trip builder ---------------- */

  var builderToggle = $("builderToggle");

  builderToggle.addEventListener("click", function () {
    var show = builder.hidden;
    builder.hidden = !show;
    builderToggle.classList.toggle("is-on", show);
    if (show) $("fFrom").focus();
  });

  document.querySelectorAll("#interestChips .chip").forEach(function (chip) {
    chip.addEventListener("click", function () { chip.classList.toggle("on"); });
  });

  $("builderClear").addEventListener("click", function () {
    ["fFrom", "fTo", "fDate", "fDays", "fPeople", "fBudget"].forEach(function (id) { $(id).value = ""; });
    document.querySelectorAll("#interestChips .chip").forEach(function (c) { c.classList.remove("on"); });
  });

  $("builderApply").addEventListener("click", function () {
    var from    = $("fFrom").value.trim();
    var to      = $("fTo").value.trim();
    var date    = $("fDate").value;
    var days    = $("fDays").value.trim();
    var people  = $("fPeople").value.trim();
    var budget  = $("fBudget").value.trim();

    var interests = [];
    document.querySelectorAll("#interestChips .chip.on").forEach(function (c) {
      interests.push(c.getAttribute("data-value"));
    });

    if (!to) {
      toast("Add a destination first.");
      $("fTo").focus();
      return;
    }

    var parts = ["Plan a"];
    if (days) parts.push(days + " day");
    parts.push("trip to " + to);
    if (from) parts.push("from " + from);

    if (date) {
      var d = new Date(date + "T00:00:00");
      if (!isNaN(d)) {
        parts.push("departing " + d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }));
      }
    }

    if (people) parts.push("for " + people + (people === "1" ? " traveller" : " travellers"));
    if (budget) parts.push("with a budget of " + budget);
    if (interests.length) parts.push("focused on " + interests.join(", "));

    var sentence = parts.join(" ") + ". Find flights, hotels, the weather outlook and a day-by-day itinerary.";

    input.value = sentence;
    autosize();
    builder.hidden = true;
    builderToggle.classList.remove("is-on");
    input.focus();
  });

  /* ---------------- boot ---------------- */

  initTheme();
  updateEmptyState();
  refreshConfig().then(function () {
    if (isReady()) input.focus();
  });
  setInterval(refreshConfig, 60000);
  autosize();
})();
