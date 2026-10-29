/**
 * Tiny, secure Markdown renderer for Roamly AI
 */

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatRun(text) {
  let out = escapeHtml(text);
  out = out.replace(/&lt;br\s*\/?&gt;/gi, "<br />");

  // links
  out = out.replace(/\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)/g, (m, label, url) => {
    if (!/^(https?:\/\/|mailto:|\/|#)/i.test(url)) return m;
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label || url}</a>`;
  });

  // bare urls
  out = out.replace(/(^|[\s(])(https?:\/\/[^\s<)"']+[^\s<).,;:!?"'])/g, (m, pre, url) => {
    return `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });

  return out
    .replace(/\*\*\*([\s\S]+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__([\s\S]+?)__/g, "<strong>$1</strong>")
    .replace(/~~([\s\S]+?)~~/g, "<del>$1</del>")
    .replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/(^|[^_\w])_([^_\n]+?)_(?!_)/g, "$1<em>$2</em>");
}

export function inline(text) {
  if (text === null || text === undefined) return "";
  const parts = String(text).split(/(`[^`]*`)/g);
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    if (part.length > 1 && part.startsWith("`") && part.endsWith("`")) {
      out += `<code>${escapeHtml(part.slice(1, -1))}</code>`;
    } else {
      out += formatRun(part);
    }
  }
  return out;
}

const BULLET = /^(\s*)([-*+•–—])\s+(.*)$/;
const ORDERED = /^(\s*)(\d+)[.)]\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/;

function splitRow(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map(c => c.trim());
}

function parseList(lines, start) {
  const stack = [];
  const parts = [];
  let i = start;

  function closeDeeperThan(indent) {
    while (stack.length && stack[stack.length - 1].indent > indent) {
      parts.push("</li></" + stack.pop().tag + ">");
    }
  }

  while (i < lines.length) {
    const line = lines[i];
    let tag = "ul";
    let m = line.match(BULLET);
    if (!m) {
      m = line.match(ORDERED);
      tag = "ol";
    }

    if (!m) {
      if (stack.length && line.trim() && /^\s{2,}/.test(line)) {
        parts.push(" " + inline(line.trim()));
        i++;
        continue;
      }
      if (stack.length && !line.trim() && i + 1 < lines.length && (BULLET.test(lines[i + 1]) || ORDERED.test(lines[i + 1]))) {
        i++;
        continue;
      }
      break;
    }

    const indent = m[1].replace(/\t/g, "    ").length;
    if (!stack.length || indent > stack[stack.length - 1].indent) {
      stack.push({ tag, indent });
      parts.push(`<${tag}><li>`);
    } else {
      closeDeeperThan(indent);
      if (!stack.length) {
        stack.push({ tag, indent });
        parts.push(`<${tag}><li>`);
      } else if (stack[stack.length - 1].tag !== tag) {
        parts.push(`</li></${stack.pop().tag}>`);
        stack.push({ tag, indent });
        parts.push(`<${tag}><li>`);
      } else {
        parts.push("</li><li>");
      }
    }

    parts.push(inline(m[3]));
    i++;
  }

  while (stack.length) parts.push(`</li></${stack.pop().tag}>`);
  return { html: parts.join(""), next: i };
}

export function renderMarkdown(src) {
  if (src === null || src === undefined) return "";
  const lines = String(src).replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  let para = [];
  let i = 0;

  function flushPara() {
    if (!para.length) return;
    const rendered = inline(para.join("\n")).replace(/\n/g, "<br />");
    html.push(`<p>${rendered}</p>`);
    para = [];
  }

  while (i < lines.length) {
    const line = lines[i];

    const fence = line.match(/^\s*(```|~~~)/);
    if (fence) {
      flushPara();
      const marker = fence[1];
      const buf = [];
      i++;
      while (i < lines.length && lines[i].trim().indexOf(marker) !== 0) {
        buf.push(lines[i]);
        i++;
      }
      i++;
      html.push(`<pre><code>${escapeHtml(buf.join("\n"))}</code></pre>`);
      continue;
    }

    if (!line.trim()) {
      flushPara();
      i++;
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushPara();
      html.push("<hr />");
      i++;
      continue;
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (heading) {
      flushPara();
      const level = Math.min(heading[1].length, 4);
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (line.indexOf("|") !== -1 && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      flushPara();
      const head = splitRow(line);
      i += 2;
      const body = [];
      while (i < lines.length && lines[i].trim() && lines[i].indexOf("|") !== -1) {
        body.push(splitRow(lines[i]));
        i++;
      }
      const t = ['<div class="md-table-wrap"><table><thead><tr>'];
      head.forEach(c => { t.push(`<th>${inline(c)}</th>`); });
      t.push("</tr></thead><tbody>");
      body.forEach(row => {
        t.push("<tr>");
        for (let c = 0; c < head.length; c++) {
          t.push(`<td>${inline(row[c] || "")}</td>`);
        }
        t.push("</tr>");
      });
      t.push("</tbody></table></div>");
      html.push(t.join(""));
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      flushPara();
      const quote = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      html.push(`<blockquote>${renderMarkdown(quote.join("\n"))}</blockquote>`);
      continue;
    }

    if (BULLET.test(line) || ORDERED.test(line)) {
      flushPara();
      const list = parseList(lines, i);
      html.push(list.html);
      i = list.next;
      continue;
    }

    para.push(line.trim());
    i++;
  }

  flushPara();
  return html.join("\n");
}
