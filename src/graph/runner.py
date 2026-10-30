"""Entry point the API layer calls to run one travel planning request."""

import logging
import re
import uuid

from langchain_core.messages import HumanMessage, SystemMessage

from src.agents.destination import (
    KNOWN_DESTINATIONS,
    _clean_destination_candidate,
    extract_destination,
    extract_trip_locations,
    is_greeting_or_banter,
    is_invalid_destination,
)
from src.agents.prompts import CONCIERGE_PROMPT, CONCIERGE_SYSTEM_PROMPT
from src.clients.llm import get_concierge_llm, get_llm
from src.config.session import require
from src.graph.graph import get_travel_graph
from src.graph.state import initial_state

logger = logging.getLogger(__name__)

# In-memory thread memory store to guarantee context retention across turns
_THREAD_MEMORY: dict[str, dict] = {}


def _is_focused_followup(query: str, thread_id: str | None = None) -> bool:
    """
    Classify whether a user input is a focused follow-up / concierge question
    or a command to generate a full new multi-agent itinerary from scratch.
    """
    q = query.strip().lower()

    # ----------------------------------------------------
    # 1. EXPLICIT NEW TRIP PLANNING COMMANDS
    # MUST ALWAYS RUN THE FULL 6-AGENT PIPELINE — NEVER ROUTE TO CONCIERGE!
    # ----------------------------------------------------

    # A. Verbs + Trip nouns (e.g. "Plan a 7 day Japan trip", "Create an itinerary", "Craft a vacation", "Plan a beach getaway")
    if re.search(r"\b(plan|planning|create|generate|build|design|organize|schedule|craft|make)\b.*?\b(trip|itinerary|vacation|tour|holiday|getaway|travel plan)\b", q):
        return False

    # B. Any query with explicit duration (e.g. "7 day Japan trip", "5 days in Paris", "4 day beach getaway", "10 days rail trip")
    if re.search(r"\b\d+\s*(?:day|days|night|nights|week|weeks)\b", q):
        # Unless it is specifically asking about extending or adding a day to an existing trip
        if not re.search(r"\b(extend|extra day|additional day|stay longer|another day|day or two)\b", q):
            return False

    # C. Explicit Origin to Destination routes (e.g. "from India to Bali", "to Tokyo from Dhaka", "Paris from Delhi")
    if re.search(r"\bfrom\s+[a-z\s,.-]{2,30}\s+to\s+[a-z\s,.-]{2,30}\b", q):
        return False
    if re.search(r"\bto\s+[a-z\s,.-]{2,30}\s+from\s+[a-z\s,.-]{2,30}\b", q):
        return False
    if re.search(r"\b[a-z\s,.-]{2,25}\s+(?:trip|getaway|vacation|tour|itinerary)\s+from\s+[a-z\s,.-]{2,25}\b", q):
        return False

    # D. Planning keywords (flights, hotels, full budget outlook, day-by-day)
    if re.search(r"\b(find flights|find hotels|hotel suggestions|flight options|day-by-day|full itinerary|itinerary under|budget under)\b", q):
        return False

    # E. Commands starting with planning intent
    if re.search(r"^(?:plan|create|build|generate|make|organize|schedule|design|craft)\s+(?:a|an|\d+|my|our)?\s*(?:trip|itinerary|vacation|tour|holiday|getaway)\b", q):
        return False
    if re.search(r"^(?:i\s+want|i'd\s+like|i\s+would\s+like|help\s+me)\s+(?:to\s+)?(?:plan|create|build|generate|organize|schedule)\b", q):
        return False

    # ----------------------------------------------------
    # 2. CONCIERGE FOLLOW-UP & BANTER TRIGGERS
    # ----------------------------------------------------

    # Quick action chips inserted by the UI (always follow-ups)
    if any(q.startswith(emoji) for emoji in ["🍝", "🚇", "🌧️", "💡", "📸"]):
        return True

    # Casual banter and greetings ("heyy!", "How its going bro!", "hey", "what's up", etc.)
    if is_greeting_or_banter(q) or re.search(r"^(?:how(?:'s| is|s)?\s*(?:it|things?|you|u)|what(?:'s|s)?\s*up|hey+|heya|heyo|hello+|hi+|hiya+|yo+|sup|greetings?|bro\b|good\s*(?:morning|afternoon|evening))\b", q):
        return True

    # Calm places, peaceful escapes, or escaping chaos (e.g. "away from chaos. can u locate me to calm place in saudi arabia")
    if re.search(r"\b(calm|peaceful|quiet|relaxing|serene|chaos|away from chaos|escape chaos|secluded|retreat|unwind|chill out)\b", q):
        return True

    # Distance, radius, and road trips ("what if I wanna go 250 kms ahead", "day trips outside")
    if re.search(r"\b(\d+\s*(?:km|kms|kilometers?|miles?)|ahead\s+from|beyond|outside|road\s*trip|day\s*trip|drive\s*out|nearby\s+cities|nearby\s+places)\b", q):
        return True

    # Question interrogatives (anywhere in query or multi-sentence query, or queries ending in '?')
    is_question = bool(
        re.search(
            r"(?:^|[.!?\n]\s*|\b)(?:what(?:'s| is| are| if)?|where(?:'s| is| can| should)?|how(?:'s| is|s| do| can| its)?|which|why|when|is there|are there|can (?:you|u)|could you|tell me|give me|recommend|suggest|locate me|find me|do you have|any advice|any tips|any ideas|names? of)\b",
            q,
        )
    ) or ("?" in q)

    # Follow-up intent topics
    followup_topics = [
        r"\b(must visit|must see|must not miss|absolute must)\b",
        r"\b(extend (?:my|the|our) trip|extra day|additional day|stay longer|day or two)\b",
        r"\b(suggest any names|recommend any|names of|any names|which names|venue names|places to eat)\b",
        r"\b(food|street food|dishes|cuisine|sushi|ramen|pasta|pizza|restaurant|restaurants|cafe|cafes|bakery|dining)\b",
        r"\b(transit|metro|subway|train|bullet train|shinkansen|bus|taxi|uber|suica|pasmo|pass|passes|ticket)\b",
        r"\b(scam|scams|safety|safe|emergency|pickpocket|hospital|police)\b",
        r"\b(rain|rainy|bad weather|indoor|museum|art gallery)\b",
        r"\b(photo|photogenic|instagram|viewpoint|views|spots|lookout)\b",
        r"\b(sim card|esim|roaming|plug type|voltage|adapter|atm|currency exchange|cash vs card)\b",
        r"\b(calm|peaceful|quiet|relaxing|serene|chaos|retreat|secluded|away from chaos)\b",
        r"\b(locate me|find me a place|suggest a place|recommend a place)\b",
    ]
    has_followup_topic = any(re.search(pat, q) for pat in followup_topics)

    # Reference to existing trip context (e.g. "my trip", "this trip", "the trip")
    references_active_trip = bool(re.search(r"\b(my trip|this trip|the trip|our trip|for this|during this)\b", q))

    # If within an active thread and user asks a question or follow-up topic
    if thread_id and (thread_id in _THREAD_MEMORY):
        if is_question or has_followup_topic or references_active_trip:
            return True

    if is_question or has_followup_topic:
        return True

    # Short query (< 50 chars) without explicit planning commands is a follow-up
    if len(q) < 50 and not re.search(r"\b(plan|create|build|generate|trip|itinerary)\b", q):
        return True

    return False


def _extract_destination_from_query(query: str) -> str:
    """Extract destination name from query, strictly prioritizing arrival destination over origin."""
    locs = extract_trip_locations(query)
    return locs.get("destination", "")


def _generate_greeting_response(query: str) -> str:
    """
    Generate a short, friendly, and varied greeting response in different natural forms.
    Never outputs unsolicited destination guides (like Europe) for pure greetings.
    """
    q = (query or "").strip().lower()
    clean_q = re.sub(r"[?!.,;]+$", "", q).strip()

    # Form 1: Warm & conversational check-in
    form_warm = (
        "### Hey traveler! Roamly Concierge here 🧭✨\n\n"
        "I'm doing great, thanks for saying hello! How is everything going with you?\n\n"
        "Whenever you're ready, I can help you plan anything from quiet retreats away from chaos to iconic food tours and complete itineraries. "
        "What destination is on your mind today?"
    )

    # Form 2: Friendly & relaxed (great for casual 'bro', 'hey', 'yo')
    form_casual = (
        "### Hey bro! Great to hear from you 🚀👋\n\n"
        "Everything is going awesome on my end! How are things with you today?\n\n"
        "I'm fully locked in and ready whenever you want to plan your next adventure. "
        "Got a specific destination in mind, or want some fresh travel inspiration to get started?"
    )

    # Form 3: Concise & welcoming
    form_concise = (
        "### Hello there! Welcome to Roamly 🌍💫\n\n"
        "Doing wonderful, thank you! Hope you're having a fantastic day.\n\n"
        "Whether you're looking for hidden scenic spots, street food trails, flight tips, or day-by-day itineraries—I'm here to help. "
        "Where are you dreaming of traveling next?"
    )

    # Form 4: Upbeat & travel-inquisitive
    form_inquisitive = (
        "### Hi there! Roamly Concierge at your service 🗺️\n\n"
        "All good here and excited to help you plan! How are things on your side?\n\n"
        "Are you in the mood for a tranquil escape to unwind, a vibrant cultural city break, or a fast-paced road trip? Tell me what vibe you're looking for!"
    )

    # Form 5: Crisp & direct
    form_crisp = (
        "### Hey! Great to see you 👋\n\n"
        "I'm doing well and all set. How's your day treating you?\n\n"
        "Just drop a destination or what kind of trip you want, and we'll build the perfect plan together!"
    )

    if any(w in clean_q for w in ["bro", "dude", "yo", "mate"]):
        return form_casual
    elif any(w in clean_q for w in ["how", "going", "doing", "you"]):
        return form_warm

    options = [form_warm, form_casual, form_concise, form_inquisitive, form_crisp]
    seed = sum(ord(c) for c in clean_q) if clean_q else 0
    return options[seed % len(options)]


def _generate_concierge_fallback(query: str, dest: str) -> str:
    """Rich, actionable destination-tailored concierge knowledge base with real named venues, distances, and dishes."""
    q = query.lower()
    has_valid_dest = bool(dest and not is_invalid_destination(dest) and dest.lower() not in {"destination", "your destination", "custom destination"})
    dest_clean = (dest if has_valid_dest else "Saudi Arabia").title()
    dest_lower = dest_clean.lower()

    is_dubai = any(x in dest_lower for x in ["dubai", "uae", "emirates", "abu dhabi", "sharjah"])
    is_japan = any(x in dest_lower for x in ["japan", "tokyo", "kyoto", "osaka", "nara", "hakone", "hokkaido"])
    is_italy = any(x in dest_lower for x in ["italy", "rome", "florence", "venice", "milan", "naples"])
    is_saudi = any(x in dest_lower for x in ["saudi", "riyadh", "jeddah", "alula", "abha", "farasan", "dammam", "mecca", "medina", "taif", "umluj"])

    # ----------------------------------------------------
    # 0. CONVERSATIONAL GREETINGS & BANTER
    # ----------------------------------------------------
    if is_greeting_or_banter(q) or re.search(r"^(?:how(?:'s| is|s)?\s*(?:it|things?|you|u)|what(?:'s|s)?\s*up|hey|hello|hi|sup|yo|bro|mate|dude)\b", q):
        dest_mention = f"around **{dest_clean}**" if has_valid_dest else "around scenic getaways and top travel destinations"
        return (
            f"### Hey traveler! Roamly Concierge here 🧭\n\n"
            f"I'm doing great, thanks for asking bro! How about you? How is everything going with you?\n\n"
            f"I'm fully locked in to help you with anything you need—whether you're looking for peaceful spots to get away from the chaos, iconic local street food, smart transit hacks, or road trips {dest_mention}.\n\n"
            f"What's on your mind today?"
        )

    # ----------------------------------------------------
    # 1. CALM PLACES, RETREATS & ESCAPING CHAOS
    # ----------------------------------------------------
    if re.search(r"\b(calm|peaceful|quiet|relaxing|serene|chaos|away from chaos|escape|retreat|secluded|unwind|tranquil|nature getaway)\b", q):
        if is_saudi:
            return (
                f"### Serene & Peaceful Escapes in Saudi Arabia (Away from the Chaos) 🏜️✨\n\n"
                f"If you are seeking quiet solitude, breathtaking landscapes, and a complete break from noise and crowds, here are the premier calm places in Saudi Arabia:\n\n"
                f"1. **AlUla & Ashar Valley (Ancient Desert Solitude)**\n"
                f"   - **The Vibe**: Towering 2,000-year-old sandstone canyons, peaceful date palm oases, and total desert quietude.\n"
                f"   - **Highlights**: Stay at secluded canyon sanctuaries like **Habitas AlUla** or **Banyan Tree AlUla** with private villas facing ancient cliffs. Experience stargazing in the dark-sky reserve of **Gharameel** with zero light or sound pollution, and walk through the quiet Heritage Oasis Trail.\n\n"
                f"2. **Farasan Islands Marine Sanctuary (Red Sea Island Serenity)**\n"
                f"   - **The Vibe**: An untouched archipelago of 84 islands in the southern Red Sea, far removed from modern city bustle.\n"
                f"   - **Highlights**: Quiet boat tours through mangrove forests, crystal-clear turquoise waters teeming with dolphins and sea turtles, and pristine white-sand beaches with virtually no crowds. Tour the historic Ottoman stone houses of **Al Qassar Village**.\n\n"
                f"3. **Abha & Asir National Park (Misty Green Mountain Escapes)**\n"
                f"   - **The Vibe**: Perched 2,200 meters high in the Sarawat Mountains where cool pine breezes and morning mist replace desert heat.\n"
                f"   - **Highlights**: Peaceful hiking trails through juniper forests around **Jabal Sawda** (Saudi Arabia's highest peak), gentle cable car rides above fog-covered valleys, and the tranquil heritage gingerbread village of **Rijal Almaa**.\n\n"
                f"4. **Edge of the World (Jebel Fihrayn & Tuwaiq Escarpment)**\n"
                f"   - **The Vibe**: 300-meter sheer cliffs dropping into a vast, silent ancient seabed.\n"
                f"   - **Highlights**: Stand at the cliff edge during golden hour sunset listening to pure silence as the sky turns crimson. Best visited on a quiet weekday afternoon.\n\n"
                f"5. **Umluj & The Red Sea Project (The Saudi Maldives)**\n"
                f"   - **The Vibe**: Pristine, quiet coastal waters and 104 small uninhabited islands with powdery white sand.\n"
                f"   - **Highlights**: Private traditional wooden boat charters, tranquil snorkeling in untouched coral reefs, and calm evenings listening to gentle waves."
            )
        if is_dubai:
            return (
                f"### Serene & Calm Escapes in Dubai & UAE (Away from the Chaos) 🌿✨\n\n"
                f"If you want to step away from the bustling city skyscrapers and crowds, here are the most peaceful sanctuaries in and around Dubai:\n\n"
                f"1. **Hatta Mountain Dam & Heritage Village (130 km from Dubai / ~1h 30m drive)**\n"
                f"   - **The Vibe**: Dramatic craggy Hajar Mountains surrounding a turquoise reservoir.\n"
                f"   - **Highlights**: Rent a quiet kayak or pedal boat on the silent waters of **Hatta Dam**, explore quiet hiking trails, or stay at secluded mountain glamping trailers at Hatta Sedr Trailers.\n\n"
                f"2. **Al Maha Desert Conservation Resort & Spa (Dubai Desert Conservation Reserve)**\n"
                f"   - **The Vibe**: Ultra-exclusive Bedouin tented suites tucked deep inside protected golden sand dunes with private temperature-controlled pools.\n"
                f"   - **Highlights**: Complete desert silence, free-roaming Arabian oryx and gazelles right outside your deck, and unpolluted starry night skies.\n\n"
                f"3. **Al Qudra Love Lakes & Desert Oasis (Sunrise Solitude)**\n"
                f"   - **The Vibe**: Interlocking man-made heart lakes bordered by soft sand dunes 45 minutes from Downtown.\n"
                f"   - **Highlights**: Arrive at sunrise (6:00 AM) with a thermos of hot coffee to watch black swans and desert flamingos in total morning peace.\n\n"
                f"4. **The Farm (Al Barari)**\n"
                f"   - **The Vibe**: A tranquil culinary oasis hidden inside lush botanical waterways and tropical gardens.\n"
                f"   - **Highlights**: Dine on organic, farm-to-table cuisine surrounded by babbling streams, lily ponds, and bird songs—you will forget you are in Dubai."
            )
        if is_japan:
            return (
                f"### Serene & Peaceful Escapes in {dest_clean} (Away from the Chaos) 🎋✨\n\n"
                f"If you are looking for tranquility, mindfulness, and a complete break from bustling city streets, here are the premier calm retreats:\n\n"
                f"1. **Koyasan (Mount Koya Temple Lodging)**\n"
                f"   - **The Vibe**: Sacred mountain sanctuary surrounded by 800-year-old giant cedar trees.\n"
                f"   - **Highlights**: Stay in a historic Buddhist temple (*shukubo*), partake in early-morning meditative fire rituals and sutra chanting, savor exquisite seasonal vegetarian *Shojin Ryori* cuisine, and walk through the moss-covered lanterns of **Okunoin Cemetery**.\n\n"
                f"2. **Hakone & Izu Onsen Sanctuaries (85–120 km from Tokyo)**\n"
                f"   - **The Vibe**: Traditional wooden *ryokan* inns tucked into private river valleys and bamboo forests.\n"
                f"   - **Highlights**: Soak in private mineral-rich outdoor thermal springs (*rotenburo*) overlooking mist-covered mountains, with multi-course Kaiseki dinners served in your room in complete privacy.\n\n"
                f"3. **Otagi Nenbutsu-ji & Sagano Bamboo Forest at Dawn (Kyoto)**\n"
                f"   - **The Vibe**: Peaceful northern Arashiyama far from the tourist rush.\n"
                f"   - **Highlights**: Arrive between 6:30 and 7:15 AM to listen to the gentle breeze whispering through towering green bamboo stalks without a single soul around, then visit the whimsical moss-draped temple of 1,200 carved stone Buddhist disciples."
            )
        return (
            f"### Serene & Peaceful Escapes in {dest_clean} (Away from the Chaos) 🌿✨\n\n"
            f"If you're seeking tranquil places to recharge away from crowds and city rush in **{dest_clean}**:\n\n"
            f"- **Botanical Gardens & Hidden Courtyards**: Spend a peaceful morning in the city's oldest historic cloisters, royal botanical gardens, or temple grounds where quiet paths offer sanctuary from street traffic.\n"
            f"- **Scenic Foothills & Countryside Day Trips**: Head 1 to 2 hours into surrounding mountain valleys, peaceful lakeside villages, or coastal pine reserves.\n"
            f"- **Tranquil Morning Hours (7:00–9:00 AM)**: Historic alleys and waterfront lookouts are virtually deserted early in the morning—the best time to experience the authentic soul of {dest_clean} in peace.\n"
            f"- **Boutique Sanctuary Stays**: Look for family-run countryside lodges or historic boutique properties outside the commercial core."
        )

    # ----------------------------------------------------
    # 2. DISTANCE, RADIUS & ROAD TRIP EXCURSIONS (e.g. 250 kms ahead)
    # ----------------------------------------------------
    if re.search(r"\b(\d+\s*(?:km|kms|kilometers?|miles?)|ahead\s+from|beyond|outside|road\s*trip|day\s*trip|drive\s*out|nearby\s+cities|nearby\s+places)\b", q):
        if is_dubai:
            return (
                f"### Top Road Trips & Escapes within 100–250 km from Dubai\n\n"
                f"If you want to head 100 to 250 km beyond Dubai's city center, here are the absolute premier destinations situated within a 1 to 2.5 hour drive:\n\n"
                f"1. **Abu Dhabi (140 km / ~1 hr 20 mins drive)**\n"
                f"   - **Highlights**: Visit the awe-inspiring **Sheikh Zayed Grand Mosque** (82 white marble domes, 24-carat gold chandeliers; free entry), explore the futuristic floating dome of **Louvre Abu Dhabi** on Saadiyat Island (~AED 63 / ₹1,400), and stroll the Corniche waterfront.\n"
                f"   - **Transit**: Direct drive down the multi-lane E11 highway, or take the RTA intercity bus E100/E101 from Al Ghubaiba or Ibn Battuta Metro Station for just AED 25 (~₹570).\n\n"
                f"2. **Al Ain — The Historic Garden City (150 km / ~1 hr 30 mins drive)**\n"
                f"   - **Highlights**: A tranquil UNESCO World Heritage oasis packed with 147,000 date palms. Drive the sweeping hairpin curves up **Jebel Hafeet** (1,249m) for panoramic desert sunset views, and tour historic **Al Jahili Fort** (free entry).\n"
                f"   - **Vibe**: Authentic, traditional Emirati culture far away from high-rises.\n\n"
                f"3. **Jebel Jais & Ras Al Khaimah (160 km / ~2 hrs drive)**\n"
                f"   - **Highlights**: The highest peak in the UAE (1,934m) in the rugged Hajar Mountain range. Home to the world's longest zipline (Jais Flight, 2.8 km reaching 160 km/h) and crisp mountain air 10°C cooler than the coast.\n\n"
                f"4. **Musandam Peninsula, Oman (190 km / ~2.5 hrs drive)**\n"
                f"   - **Highlights**: Known as the 'Fjords of Arabia'. Board a traditional wooden Omani dhow boat cruise through turquoise fjords, swim with wild dolphins, and snorkel off Telegraph Island (~AED 250–350 / ₹5,600–7,800 for full day cruise with lunch and border visa support).\n\n"
                f"*Road Trip Advice*: Car rentals in Dubai are affordable (~AED 90–140 / ₹2,000–3,100 per day). UAE highways have automated Salik toll gates, so tolls are billed seamlessly by your rental agency."
            )
        if is_japan:
            return (
                f"### Unmissable Excursions within 100–250 km from {dest_clean}\n\n"
                f"- **Hakone & Mt. Fuji (~85–100 km from Tokyo)**: 85 mins via the Odakyu Romancecar. Soak in therapeutic hot spring onsen, cruise Lake Ashi on a pirate ship past the floating peace torii, and ride the ropeway over steaming volcanic Owakudani.\n"
                f"- **Nikko World Heritage (~150 km from Tokyo)**: 1 hr 50 mins via the Tobu Spacia train. Discover the lavish gold-leaf Toshogu Shrine nestled inside ancient cedar forests, Lake Chuzenji, and Kegon Falls.\n"
                f"- **Kamakura & Enoshima (~60 km from Tokyo)**: 55 mins on the JR Yokosuka Line. Marvel at the 11-meter Great Bronze Buddha (Kotoku-in), scenic Pacific beaches, and bamboo temple gardens.\n"
                f"- **Nara & Uji (~40–80 km from Kyoto/Osaka)**: Bow with friendly free-roaming sika deer in Nara Park, visit Todai-ji's colossal Great Buddha, and sample Japan's finest ceremonial matcha in Uji."
            )
        if is_italy:
            return (
                f"### Premier Day Trips & Escapes within 100–250 km from {dest_clean}\n\n"
                f"- **Florence & Tuscany (~270 km / 1h 35m on Frecciarossa high-speed rail from Rome)**: Explore the Uffizi Gallery, Brunelleschi's Duomo, and world-class bistecca alla fiorentina.\n"
                f"- **Naples & Pompeii (~220 km / 1h 10m on high-speed rail from Rome)**: Taste the original Neapolitan wood-fired pizza and walk the preserved ancient Roman streets of Pompeii beneath Mt. Vesuvius.\n"
                f"- **Orvieto & Civita di Bagnoregio (~120 km from Rome)**: Discover the fairytale cliffside medieval village accessible only by footbridge, surrounded by dramatic volcanic canyons."
            )
        return (
            f"### Top Day Trips & Excursions within 100–250 km from {dest_clean}\n\n"
            f"- **Scenic Regional Highlights**: Venture into the scenic countryside, nearby historic provincial towns, and nature reserves located 1 to 2.5 hours outside {dest_clean}.\n"
            f"- **Transit Options**: High-speed regional trains or express intercity coaches typically connect {dest_clean} to surrounding heritage centers in under 90 minutes.\n"
            f"- **Rental Car Flexibility**: If exploring remote valleys, coastal viewpoints, or mountain trails, renting a car allows total freedom to stop at local vineyards and village markets along the way."
        )

    # ----------------------------------------------------
    # 2. DUBAI CONCIERGE KNOWLEDGE BASE
    # ----------------------------------------------------
    if is_dubai:
        # A. Food & Street Food in Dubai
        if re.search(r"\b(food|street food|eat|eats|dishes|cuisine|restaurant|restaurants|cafe|dining|shawarma|biryani|kabab|kebab)\b", q):
            return (
                f"### Authentic Local Dining & Iconic Street Food in Dubai\n\n"
                f"- **Al Ustad Special Kabab (Meena Bazaar, Bur Dubai)**: Operating since 1978 and filled with photos of world dignitaries. Must-try: yogurt-marinated mutton kebabs with fragrant saffron butter rice, fresh mint, and warm flatbread (~AED 35–45 / ₹800–1,000).\n"
                f"- **Ravi Restaurant (Al Satwa)**: The definitive legendary late-night Pakistani eatery. Order the sizzling Chicken Karahi, rich Mutton Peshawari, and piping-hot tandoori garlic naan (~AED 25–35 / ₹570–800 per person).\n"
                f"- **Bu Qtair (Old Umm Suqeim Fishing Harbour)**: A historic seafood institution right by the water. Pick fresh Hamour (grouper) or jumbo prawns from ice trays, flash-fried with a secret Kerala spice crust and served with coconut curry sauce & parotta (~AED 50–70 / ₹1,100–1,550).\n"
                f"- **Arabian Tea House (Al Fahidi Historical District)**: Traditional courtyard with turquoise benches under bougainvillea canopies. Savor authentic Emirati **Machboos** (spiced slow-cooked lamb with fragrant basmati rice) and warm **Regag** bread with honey & cheese (~AED 60–75 / ₹1,350–1,700).\n"
                f"- **Iconic Neighborhood Street Eats**: Grab warm Chicken Shawarma drenched in garlic toum (~AED 7–9 / ₹160–200) and freshly brewed spiced **Karak Chai** (~AED 1–2 / ₹23–45) from 24/7 street cafeterias in Karama or Deira."
            )

        # B. Transit & Passes in Dubai
        if re.search(r"\b(transit|metro|subway|bus|transport|passes|train|trains|ticket|tickets|nol|abra|taxi|careem)\b", q):
            return (
                f"### Public Transport Guide & Transit Passes for Dubai\n\n"
                f"- **Dubai Metro (Red & Green Lines)**: Fully automated, world-class driverless metro connecting Dubai International Airport (DXB), Downtown (Burj Khalifa/Dubai Mall), Marina, and Deira. Trains run every 3–5 minutes and are air-conditioned from platform to car.\n"
                f"- **Nol Silver Card (Essential)**: Buy a contactless **Nol Silver Card** at any metro station counter for **AED 25** (comes with AED 19 pre-loaded balance). Tap at turnstiles for Metro, Tram, City Buses, and Water Buses. Fares range from AED 3 (single zone) to AED 7.50 (all zones).\n"
                f"- **Traditional Abra across Dubai Creek**: The most iconic old-world experience in Dubai. Cross between Deira Old Souk and Bur Dubai on a wooden motorized Abra for exactly **AED 1 in cash** (~₹23).\n"
                f"- **Dubai Taxi & Ride-Hailing**: Download the **Careem** app to book official Hala Dubai Taxis at regulated metered rates (flag drop AED 12, ~AED 2.09/km). Official cream-colored street taxis accept credit cards and Nol cards.\n"
                f"- **Pro Tip**: Avoid hailing unmetered private cars at DXB airport arrivals; head directly to the official taxi stand queue."
            )

        # C. Scams & Safety Tips for Dubai
        if re.search(r"\b(scam|scams|safety|safe|emergency|police|rules|laws)\b", q):
            return (
                f"### Travel Safety & Essential Scams to Avoid in Dubai\n\n"
                f"- **World-Class Safety**: Dubai is statistically one of the safest cities on earth with virtually zero violent crime or street theft. Walking alone at 2:00 AM anywhere in the city is completely safe.\n"
                f"- **Souk Replica Touts (Deira & Gold Souk)**: Aggressive touts will whisper about 'copy watches' or 'designer handbags' and try to lead you into private residential back-alley flats. Never follow them—goods are low-grade knockoffs with absurd markups.\n"
                f"- **Airport Driver Solicitation**: At DXB baggage claim and arrivals, ignore drivers asking 'Taxi? Uber?'. Walk straight outside to the official cream-colored Dubai Taxi dispatch queue.\n"
                f"- **Local Laws & Cultural Respect**: Alcohol is strictly limited to licensed restaurants, lounges, and hotels—never consume alcohol in public streets or beaches. Respect modest attire when visiting government buildings and mosques.\n"
                f"- **Emergency Hotlines**: Police: **999** | Ambulance: **998** | Tourist Security Hotline: **901** | Fire: **997**."
            )

        # D. Rainy Day & Extreme Heat Backup Itinerary in Dubai
        if re.search(r"\b(rain|rainy|bad weather|indoor|museum|museums|heat|hot)\b", q):
            return (
                f"### Rainy Day & Indoor Wonders in Dubai\n\n"
                f"- **Museum of the Future**: A 77-meter architectural masterpiece wrapped in Arabic calligraphy poetry. Explore 7 floors of cutting-edge space stations, DNA bio-vaults, and sensory wellbeing exhibits (~AED 149 / ₹3,400; reserve tickets 2–3 weeks in advance).\n"
                f"- **Ski Dubai (Mall of the Emirates)**: Step into an indoor winter wonderland kept at -4°C featuring 5 real snow ski runs, chairlifts, bobsled runs, and live penguin encounters (~AED 220–290 / ₹5,000–6,500 with jackets and boots included).\n"
                f"- **The Green Planet (City Walk)**: A breathtaking 4-story indoor tropical rainforest biodome housing 3,000+ exotic plants, free-roaming sloths, toucans, and Burmese pythons.\n"
                f"- **Dubai Aquarium & Underwater Zoo (The Dubai Mall)**: Walk through a 48-meter transparent acrylic tunnel surrounded by sand tiger sharks, giant groupers, and manta rays (~AED 150 / ₹3,400).\n"
                f"- **Mohammed Bin Rashid Library (Al Jaddaf)**: A 7-story library shaped like an open book stand overlooking Dubai Creek, with rare centuries-old manuscripts and panoramic reading halls (free entry)."
            )

        # E. Photogenic Spots in Dubai
        if re.search(r"\b(photo|photogenic|instagram|viewpoint|views|spots)\b", q):
            return (
                f"### 5 Most Photogenic & Iconic Photo Spots in Dubai\n\n"
                f"- **Wings of Mexico Statue (Downtown Dubai)**: Position yourself between the bronze angel wings looking straight toward the towering Burj Khalifa for the definitive symmetrical postcard shot.\n"
                f"- **Dubai Frame (Zabeel Park)**: Stand at the base to frame the 150-meter golden monument against blue skies, or shoot through the glass skybridge floor looking down at Old Dubai and Downtown.\n"
                f"- **Al Fahidi Historical Wind Tower Alleys**: Coral-stone wind towers, antique wooden heavy doors, and lantern-lit narrow pathways; capture soft golden-hour light around 5:15 PM.\n"
                f"- **Dubai Creek Harbour Promenade**: The finest unobstructed panoramic skyline view in the city, capturing the Downtown Burj Khalifa skyline reflected across tranquil creek waters at sunset.\n"
                f"- **Al Qudra Desert Love Lakes**: Interlocking heart-shaped desert lakes surrounded by sand dunes, best photographed at sunrise with wild Arabian oryx and desert gazelles."
            )

        # F. Must Visit / Extensions in Dubai
        if re.search(r"\b(must visit|must see|must not miss|names|suggest any names|venue|venues|place|places|extend)\b", q):
            return (
                f"### Absolute Must-Visit Landmarks & Experiences in Dubai\n\n"
                f"- **Burj Khalifa & Dubai Fountain (Downtown)**: The world's tallest building (828m). Book Level 124/125 observation deck at sunset (~AED 179 / ₹4,000), followed by the evening choreographed music fountain show on the lake (free).\n"
                f"- **Museum of the Future**: Marvel at the pillarless torus structure engraved with Sheikh Mohammed's poetry (~AED 149 / ₹3,400).\n"
                f"- **Al Fahidi Historical Neighbourhood & Spice Souk**: Wander the 19th-century wind tower laneways, cross the Creek on a 1 AED Abra boat, and explore the aromatic Spice and Gold Souks.\n"
                f"- **Desert Safari with Dune Bashing**: An afternoon 4x4 dune bashing adventure in the red sands of Lahbab, sandboarding, camel rides, and a traditional starlit Bedouin BBQ dinner (~AED 150–220 / ₹3,400–5,000 per person).\n"
                f"- **Dubai Marina Walk & JBR Beach**: Stroll the illuminated 7 km marina promenade lined with superyachts, waterfront cafes, and the Ain Dubai observation wheel."
            )

    # ----------------------------------------------------
    # 3. JAPAN CONCIERGE KNOWLEDGE BASE
    # ----------------------------------------------------
    if is_japan:
        if re.search(r"\b(must visit|must see|must not miss|absolute must|names|suggest any names|venue|venues|place|places|extend)\b", q):
            return (
                f"### Absolute Must-Visit Landmarks & Experiences in {dest_clean}\n\n"
                f"- **Fushimi Inari Taisha (Kyoto)**: Walk beneath the mystical mountain tunnel of over 10,000 vivid vermilion torii gates. *Tip*: Arrive at 7:00 AM for peaceful morning tranquility without tour crowds. (Free entry)\n"
                f"- **Senso-ji Temple & Asakusa (Tokyo)**: Tokyo's oldest Buddhist temple. Pass under the massive red Kaminarimon lantern and sample Ningyo-yaki bean cakes along Nakamise shopping street. (Free entry)\n"
                f"- **TeamLab Planets (Tokyo, Toyosu)**: World-famous interactive digital art installation walking barefoot through crystal water rooms and floating orchid gardens. (~¥3,800 / ₹2,100; reserve 3–4 weeks ahead)\n"
                f"- **Arashiyama Bamboo Grove & Tenryu-ji (Kyoto)**: Walk beneath soaring green bamboo canopies and visit the UNESCO World Heritage zen pond gardens of Tenryu-ji. (~¥500 / ₹280 entry)\n"
                f"- **Shibuya Sky (Tokyo)**: Dramatic 360-degree open-air observation deck 229 meters high directly above Shibuya Crossing. Book a sunset slot to watch Tokyo skyline illuminate. (~¥2,200 / ₹1,200)"
            )

        if re.search(r"\b(food|street food|eat|eats|dishes|cuisine|restaurant|restaurants|cafe|dining|sushi|ramen)\b", q):
            return (
                f"### Authentic Dining & Iconic Street Food in {dest_clean}\n\n"
                f"- **Tsukiji Outer Market (Tokyo)**: Fresh Bluefin Tuna Nigiri, grilled Hokkaido scallops in their shell (¥800 / ₹450), and savory A5 Wagyu beef skewers (¥1,500 / ₹830).\n"
                f"- **Omoide Yokocho / Memory Lane (Shinjuku, Tokyo)**: Tiny lantern-lit post-war alleys packed with 6-seater stalls serving charcoal-grilled chicken Yakitori skewers (¥180–¥300 / ₹100–₹160 each).\n"
                f"- **Dotonbori Promenade (Osaka)**: Savor hot, crispy **Takoyaki** (octopus balls drizzled with sweet brown sauce and dancing bonito flakes, ~¥650 / ₹360 for 8 pcs) and **Okonomiyaki**.\n"
                f"- **Legendary Ramen**: Personalized private booth Tonkotsu ramen at **Ichiran** or refreshing citrusy Yuzu Shio ramen at **Afuri** (~¥1,200 / ₹660).\n"
                f"- **Gion Kaiseki Dining (Kyoto)**: Multi-course traditional seasonal dining in private tatami rooms along historic wooden streets (~¥8,000–¥15,000 / ₹4,500–₹8,300 per person)."
            )

        if re.search(r"\b(transit|metro|subway|bus|transport|passes|train|trains|ticket|tickets|shinkansen|suica|pasmo)\b", q):
            return (
                f"### Public Transport & Transit Pass Guide for {dest_clean}\n\n"
                f"- **Suica / Pasmo Digital IC Cards**: Download directly into your Apple Wallet / Google Wallet with no deposit. Tap your phone at turnstiles across all subways, city buses, and 7-Eleven stores.\n"
                f"- **Shinkansen (Bullet Train)**: Travel between Tokyo and Kyoto/Osaka in just 2 hours 15 minutes at 320 km/h on the Tokaido Shinkansen (Nozomi train). Book reserved seats via the SmartEX app.\n"
                f"- **Tokyo Subway 72-Hour Tourist Ticket**: Unlimited rides across all 13 Tokyo Metro and Toei lines for just ¥1,500 (~₹830), saving up to 50%.\n"
                f"- **Kyoto City Bus & Subway 1-Day Pass**: Best way to hop between Kinkaku-ji, Gion, and Arashiyama (¥1,100 / ₹610).\n"
                f"- **Golden Rule**: Never hail street taxis for long distances in Japan—they are exceptionally expensive. Trains are 100% on-time, spotless, and faster."
            )

        if re.search(r"\b(scam|scams|safety|safe|emergency|etiquette|rules)\b", q):
            return (
                f"### Travel Safety & Essential Etiquette in {dest_clean}\n\n"
                f"- **World-Class Safety**: Japan is universally ranked among the safest countries in the world. Walking alone late at night in Tokyo, Kyoto, or Osaka is completely safe.\n"
                f"- **Touting Scam to Avoid**: In nightlife districts like Roppongi and Kabukicho (Shinjuku), never follow touts soliciting 'cheap drinks' or entry into basement bars—they overcharge with exorbitant hidden table fees.\n"
                f"- **Cash Is Still Necessary**: While digital IC cards and credit cards work at major chains, keep ¥10,000–¥20,000 in cash for temple entrance tickets, traditional food stalls, and ramen coin machines.\n"
                f"- **Cultural Etiquette**: Never eat or drink while walking on the street (eat at the vendor's stall). Do not tip at restaurants—it is considered confusing and contrary to hospitality (*omotenashi*).\n"
                f"- **Emergency Contacts**: Police: **110** | Ambulance & Fire: **119** | 24/7 English Tourist Hotline: **050-3816-2720**."
            )

        if re.search(r"\b(rain|rainy|bad weather|indoor|museum|museums)\b", q):
            return (
                f"### Rainy Day & Indoor Culture Guide for {dest_clean}\n\n"
                f"- **TeamLab Planets (Toyosu)**: Ideal rainy day indoor wonderland where you wander barefoot through mirrored water installations and floating orchid flower rooms.\n"
                f"- **Tokyo National Museum (Ueno Park)**: Shelter inside Japan's largest art museum holding over 100,000 historic treasures, samurai armor, swords, and ukiyo-e woodblock prints.\n"
                f"- **Kyoto Station & Underground Portas**: Marvel at the 16-story futuristic architecture of Kyoto Station, with multi-level ramen streets (*Ramen Koji*) and covered shopping arcades.\n"
                f"- **Traditional Matcha Tea Ceremony**: Reserve an authentic 45-minute tea ceremony experience inside a historic Kyoto machiya townhouse, learning the mindfulness of whisking ceremonial Uji matcha.\n"
                f"- **Covered Arcades**: Stroll Shinsaibashi-suji in Osaka or Teramachi in Kyoto—miles of glass-canopied shopping completely sheltered from the weather."
            )

        if re.search(r"\b(photo|photogenic|instagram|viewpoint|views|spots)\b", q):
            return (
                f"### 5 Most Photogenic & Iconic Sights in {dest_clean}\n\n"
                f"- **Fushimi Inari Torii Tunnel at Dawn (Kyoto)**: Capture the endless crimson vermilion arches glowing in the soft early morning light between 6:30 and 7:15 AM.\n"
                f"- **Chureito Pagoda with Mt. Fuji (Arakurayama Sengen Park)**: The definitive postcard view of Japan—a classical 5-story red pagoda framing snow-capped Mount Fuji.\n"
                f"- **Shibuya Sky Observation Deck (Tokyo)**: Golden hour panoramic views over Shibuya Crossing with neon city light reflections.\n"
                f"- **Yasaka Pagoda along Ninenzaka (Kyoto)**: Historic cobblestone alleyway lined with traditional wooden machiya houses leading up to the 5-story wooden pagoda at dusk.\n"
                f"- **Arashiyama Bamboo Pathway (Kyoto)**: Stand in the center of the towering green bamboo grove looking upward as sunlight filters through the stalks."
            )

    # ----------------------------------------------------
    # 4. ITALY CONCIERGE KNOWLEDGE BASE
    # ----------------------------------------------------
    if is_italy:
        if re.search(r"\b(transit|metro|subway|bus|transport|passes|train|trains)\b", q):
            return (
                f"### Public Transport & Transit Pass Guide for {dest_clean}\n\n"
                f"- **High-Speed Trains**: Book **Trenitalia (Frecciarossa)** or **Italo** for travel between Rome, Florence, Milan, and Venice. Book 2–3 weeks early for 50%+ discounts.\n"
                f"- **City Metro & Contactless Tap**: In Rome (Metro A & B) and Milan (M1–M5), tap your credit card or Apple Pay at turnstiles (~€1.50–€2.20 per ride).\n"
                f"- **Transit Passes**: Look into the **Roma Pass** (48/72h unlimited transit + museum access) or **MilanoCard** for subway and tram travel.\n"
                f"- **Crucial Rule**: Always validate paper bus/tram tickets in the yellow stamping machine on board immediately to avoid spot fines (€50–€100).\n"
                f"- **Ride Apps**: Official licensed white taxis (FreeNow app) are more reliable than street touts."
            )
        if re.search(r"\b(food|street food|eat|eats|dishes|cuisine|restaurant|restaurants|cafe|dining)\b", q):
            return (
                f"### Authentic Local Dining & Culinary Guide for {dest_clean}\n\n"
                f"- **Authentic Trattorias & Osterias**: Skip restaurants with multilingual photo menus near tourist monuments. Look for family-run *Trattorie* with daily handwritten chalkboards.\n"
                f"- **Iconic Specialties**: Savor authentic Pasta alla Carbonara, Cacio e Pepe, Neapolitan wood-fired pizza, and fresh artisanal Gelato (look for natural muted colors in metal tins, not neon mounds).\n"
                f"- **Aperitivo Culture**: Between 6:30 PM and 8:30 PM, enjoy an Aperol Spritz or Negroni served with complimentary cured meats, cheeses, and focaccia snacks (€8–€12).\n"
                f"- **Budget & Pricing**: Casual trattoria meals run €15–€28 (₹1,400–₹2,500) per person. Note that bread/table service (*coperto*) of €1.50–€3 is standard.\n"
                f"- **Coffee Etiquette**: Order your espresso standing at the bar (*al banco*) for €1.20–€1.50 instead of sitting at outdoor square tables."
            )

    # ----------------------------------------------------
    # 5. UNIVERSAL DESTINATION-GROUNDED KNOWLEDGE BASE
    # ----------------------------------------------------
    if re.search(r"\b(transit|metro|subway|bus|transport|passes|train|trains|ticket|tickets|fare)\b", q):
        return (
            f"### Public Transport & Transit Pass Guide for {dest_clean}\n\n"
            f"- **Smart Contactless Tap**: Most modern metro, tram, and city bus systems in {dest_clean} support contactless credit cards, Apple Pay, or rechargeable transit smartcards at turnstiles.\n"
            f"- **Tourist Day Passes**: Purchase a 24-hour, 48-hour, or 72-hour unlimited city transit pass from central station ticket kiosks for 30–50% savings over individual tickets.\n"
            f"- **Airport Transfers**: Utilize official dedicated airport express trains or express shuttle buses connecting the international terminal directly to the central train station.\n"
            f"- **Licensed Ride Apps**: Rely on official licensed ride-hailing apps (Uber, Careem, Grab, or local taxi apps) to guarantee metered, transparent fares.\n"
            f"- **Ticket Validation**: Always validate paper tickets in onboard stamping machines before boarding to avoid spot inspection fines."
        )

    if re.search(r"\b(rain|rainy|bad weather|indoor|museum|museums|weather backup)\b", q):
        return (
            f"### Rainy Day & Indoor Culture Backup Plan for {dest_clean}\n\n"
            f"- **Premier Art & Heritage Museums**: Spend a weather-sheltered afternoon inside the celebrated national art galleries, royal residences, or contemporary design museums in {dest_clean}.\n"
            f"- **Covered Historical Arcades**: Stroll grand 19th-century glass-canopied shopping passages, antique book galleries, and boutique cafes completely sheltered from rain.\n"
            f"- **Culinary Workshop**: Reserve an authentic 2-hour cooking class to learn regional cooking techniques, sauces, and baking from local chefs.\n"
            f"- **Indoor Aquariums & Science Centers**: Explore state-of-the-art interactive biodomes and marine centers.\n"
            f"- **Atmospheric Cafes**: Relax in historic neighborhood coffeehouses enjoying regional pastries, artisan teas, and people-watching."
        )

    if re.search(r"\b(scam|scams|safety|safe|emergency|police|caution)\b", q):
        return (
            f"### Travel Safety & Essential Scams to Avoid in {dest_clean}\n\n"
            f"- **Transportation Safety**: Never accept rides from unofficial drivers soliciting inside arrival halls; always follow signs to the official metered taxi stand.\n"
            f"- **Crowded Hub Precautions**: In crowded metro stations, central squares, and night markets, keep wallets in zipped front pockets and beware of sudden distractions (petition signers, bracelet sellers).\n"
            f"- **Menu Pricing Transparency**: At outdoor cafes near tourist landmarks, always verify drink prices and check if service charges or table fees (*coperto*) apply before ordering.\n"
            f"- **Digital Backups**: Keep encrypted cloud copies of your passport, visa, travel insurance, and emergency bank cancellation numbers on your phone.\n"
            f"- **Emergency Help**: Note the universal emergency number (112 in Europe, 999/911 in other regions) and save the address of your country's local consulate."
        )

    if re.search(r"\b(photo|photogenic|instagram|viewpoint|views|spots|lookout)\b", q):
        return (
            f"### 5 Most Photogenic & Iconic Sights in {dest_clean}\n\n"
            f"- **Panoramic City Lookout**: Ascend the highest observation tower, fortress ramparts, or hilltop terrace at golden hour for sweeping skyline panoramas.\n"
            f"- **Historic Heritage Quarter**: Wander the oldest cobblestone pedestrian laneways at dawn (7:00–8:00 AM) to photograph centuries-old architecture in pristine morning light without crowds.\n"
            f"- **Iconic Monument Framing**: Find unique framing angles through arched colonnades, riverside bridges, or reflective fountain pools.\n"
            f"- **Bustling Central Market**: Capture the rich colors, fragrant spice pyramids, and vibrant energy of the central morning produce bazaar.\n"
            f"- **Illuminated Waterfront Promenade**: Stroll along the city harbor or riverwalk at dusk as historic bridges and bridges illuminate."
        )

    if re.search(r"\b(must visit|must see|must not miss|names|suggest any names|venue|venues|place|places)\b", q):
        return (
            f"### Top Curated Sights & Definitive Experiences in {dest_clean}\n\n"
            f"- **Premier Historic Landmark**: Visit the celebrated central heritage monument, palace, or cathedral in {dest_clean}. *Tip*: Book the earliest morning entry slot to beat queues.\n"
            f"- **Atmospheric Old Town District**: Wander the cobblestone pedestrian core filled with artisan workshops, local cafes, and historic architecture.\n"
            f"- **Panoramic City Viewpoint**: Ascend to the highest observation tower or hilltop park during sunset for sweeping views over the illuminated city.\n"
            f"- **Central Market Hall**: Stroll the central food and craft bazaar to sample freshly prepared regional specialties from local vendors.\n"
            f"- **Day Trip Excursion**: Dedicate one full day to exploring scenic lakes, coastal fishing harbors, or mountain villages within 1–2 hours of {dest_clean}."
        )

    if re.search(r"\b(food|street food|eat|eats|dishes|cuisine|restaurant|restaurants|dining)\b", q):
        return (
            f"### Authentic Local Dining & Food Guide for {dest_clean}\n\n"
            f"- **Central Food Markets**: Visit the bustling morning food halls to taste fresh regional produce, cheeses, pastries, and authentic street eats.\n"
            f"- **Neighborhood Eateries**: Dine 2-3 blocks away from primary tourist monuments where local residents eat; look for handwritten daily specials.\n"
            f"- **Signature Regional Dishes**: Sample the time-honored slow-cooked stew, handmade pasta/rice specialty, and regional baked breads.\n"
            f"- **Pricing Expectations**: High-quality casual dining averages $12–$28 (₹1,000–₹2,400) per person; street food snacks range from $3–$8.\n"
            f"- **Local Dining Hours**: Follow local dining times for the freshest cooked-to-order meals."
        )

    return (
        f"### Actionable Insider Recommendations for {dest_clean}\n\n"
        f"- **Curated Highlights**: Focus your time around the historic core and vibrant cultural quarters of {dest_clean}.\n"
        f"- **Authentic Local Flavor**: Seek out neighborhood bistros and food halls where residents dine rather than tourist-heavy squares.\n"
        f"- **Effortless Transit**: Use contactless metro cards and reliable licensed ride-hailing apps for fast travel across districts.\n"
        f"- **Timing Strategy**: Plan visits to major monuments early in the morning (before 10:00 AM) or during golden hour for pleasant temperatures and fewer queues."
    )


def run_travel_agent(user_input: str, thread_id: str | None = None, destination: str | None = None) -> dict:
    # GROQ_API_KEY is required to power the agents.
    require("GROQ_API_KEY")

    if not thread_id:
        thread_id = f"user_{uuid.uuid4().hex}"

    # Check thread memory context
    thread_ctx = _THREAD_MEMORY.get(thread_id, {})

    # Fast Concierge Mode: Handle focused queries with conversational context
    if _is_focused_followup(user_input, thread_id):
        logger.info("Routing query to fast Concierge LLM for thread '%s': '%s'", thread_id, user_input)

        is_greeting = is_greeting_or_banter(user_input)

        # Dedicated Greeting Handler: output short greet message in different forms without leaking false destinations
        if is_greeting:
            greeting_answer = _generate_greeting_response(user_input)
            try:
                llm = get_concierge_llm()
                prompt = (
                    f"You are Roamly Concierge, an upbeat AI travel advisor.\n"
                    f"The traveler said: \"{user_input.strip()}\"\n\n"
                    f"Respond in a SHORT, warm, conversational greeting message (2 to 3 sentences maximum). "
                    f"Acknowledge their greeting warmly with positive reciprocal energy (e.g. 'Doing great!', 'All good here!'), "
                    f"ask how they are doing, and ask what destination or trip vibe they are dreaming of today. "
                    f"DO NOT generate long itineraries, bulleted recommendations, or mention unsolicited destinations."
                )
                res = llm.invoke([
                    SystemMessage(content="You are Roamly Concierge, a friendly, concise travel advisor."),
                    HumanMessage(content=prompt),
                ])
                ans = (getattr(res, "content", "") or "").strip()
                if ans and len(ans) >= 15 and len(ans) <= 600:
                    greeting_answer = ans
            except Exception as e:
                logger.warning("Greeting LLM error: %s", e)

            return {
                "thread_id": thread_id,
                "destination": "",
                "answer": greeting_answer,
                "is_followup": True,
                "flight_results": "",
                "hotel_results": "",
                "weather_results": "",
                "itinerary": "",
                "budget_breakdown": "",
                "packing_list": "",
                "must_visit": "",
                "travel_essentials": "",
            }

        # 1. Resolve destination: Explicit Request -> Query -> Thread Memory -> Destination Extractor
        dest = (destination or "").strip()
        if is_invalid_destination(dest):
            dest = ""

        if not dest:
            dest = _extract_destination_from_query(user_input)
        if not dest and thread_ctx:
            dest = thread_ctx.get("destination", "")
        if not dest and not is_greeting:
            dest = extract_destination(user_input)

        dest = _clean_destination_candidate(dest)
        if is_invalid_destination(dest):
            dest = ""

        # If dest is still empty, check if query specifically names a known destination
        if not dest:
            q_lower = user_input.lower()
            if any(w in q_lower for w in ["saudi", "riyadh", "jeddah", "alula", "abha", "farasan", "umluj"]):
                dest = "Saudi Arabia"
            elif any(w in q_lower for w in ["dubai", "uae", "emirates", "abu dhabi", "burj"]):
                dest = "Dubai"
            elif any(w in q_lower for w in ["japan", "tokyo", "kyoto", "osaka"]):
                dest = "Japan"
            elif any(w in q_lower for w in ["italy", "rome", "florence", "venice"]):
                dest = "Italy"
            elif any(w in q_lower for w in ["switzerland", "swiss", "zurich", "geneva", "lucerne"]):
                dest = "Switzerland"
            elif thread_ctx.get("destination") and not is_invalid_destination(thread_ctx.get("destination")):
                dest = thread_ctx.get("destination")
            elif not is_greeting:
                dest = "Saudi Arabia" if "saudi" in q_lower else "Dubai"
            else:
                dest = ""

        has_valid_dest = bool(dest and not is_invalid_destination(dest))
        prompt_dest = dest if has_valid_dest else ("Saudi Arabia" if "saudi" in user_input.lower() else "Dubai")
        orig_query = thread_ctx.get("original_query", "") or (f"Trip to {prompt_dest}" if has_valid_dest else "Traveler greeting concierge")
        trip_context = (
            f"Trip to {prompt_dest}. Duration: {thread_ctx.get('duration', 'Multi-day trip')}. "
            f"Must-visit highlights: {thread_ctx.get('must_visit', '')[:250]}. "
            f"Original user request: {orig_query}"
        ) if has_valid_dest else "General conversational greeting / check-in with the concierge"

        concierge_answer = ""
        try:
            llm = get_concierge_llm()
            messages = [
                SystemMessage(content=CONCIERGE_SYSTEM_PROMPT),
                HumanMessage(
                    content=CONCIERGE_PROMPT.format(
                        destination=dest,
                        original_trip_query=orig_query,
                        trip_context=trip_context,
                        user_query=user_input.strip(),
                    )
                ),
            ]
            response = llm.invoke(messages)
            concierge_answer = (getattr(response, "content", "") or "").strip()
            if concierge_answer:
                concierge_answer = re.sub(r"\byour destination\b", dest, concierge_answer, flags=re.IGNORECASE)
        except Exception as e:
            logger.warning("Concierge primary invocation error: %s", e)

        # Retry with direct prompt if first attempt was empty
        if not concierge_answer or len(concierge_answer) < 30:
            try:
                llm2 = get_llm(max_tokens=800)
                simple_prompt = (
                    f"You are the local travel concierge for {dest}.\n"
                    f"Answer this traveler inquiry:\n"
                    f"\"{user_input.strip()}\"\n\n"
                    f"Provide a helpful, smart, situational answer. If they ask a casual question or banter, answer warmly and concisely. "
                    f"If they ask about distances, day trips, food, transit, photo spots, or safety, provide specific real-world recommendations with names and practical tips."
                )
                res2 = llm2.invoke(simple_prompt)
                concierge_answer = (getattr(res2, "content", "") or "").strip()
                if concierge_answer:
                    concierge_answer = re.sub(r"\byour destination\b", dest, concierge_answer, flags=re.IGNORECASE)
            except Exception as e:
                logger.warning("Concierge fallback invocation error: %s", e)

        # Guaranteed helpful, topic-specific content (never return blank or generic text)
        if not concierge_answer or len(concierge_answer) < 30:
            concierge_answer = _generate_concierge_fallback(user_input, dest)

        # Save Q&A to thread memory
        if thread_id:
            if thread_id not in _THREAD_MEMORY:
                _THREAD_MEMORY[thread_id] = {
                    "destination": dest,
                    "original_query": orig_query,
                    "qa_history": [],
                }
            _THREAD_MEMORY[thread_id].setdefault("qa_history", []).append((user_input, concierge_answer))

        return {
            "thread_id": thread_id,
            "destination": dest,
            "answer": concierge_answer,
            "is_followup": True,
            "flight_results": "",
            "hotel_results": "",
            "weather_results": "",
            "itinerary": "",
            "llm_calls": 1,
            "budget_breakdown": "",
            "packing_list": "",
            "must_visit": "",
            "travel_essentials": "",
        }

    # Full Multi-Agent Graph Planning
    config = {
        "configurable": {
            "thread_id": thread_id
        }
    }

    try:
        result = get_travel_graph().invoke(
            initial_state(user_input),
            config=config,
        )
    except Exception as e:
        err_msg = str(e).lower()
        if any(keyword in err_msg for keyword in ("ssl", "closed unexpectedly", "connection closed", "psycopg", "server closed")):
            logger.warning("PostgreSQL checkpointer connection severed during run (%s). Retrying with in-memory checkpointer...", e)
            from src.clients.checkpointer import _global_memory_saver, reset_checkpointer_cache
            reset_checkpointer_cache()

            fallback_graph = get_travel_graph(checkpointer=_global_memory_saver)
            result = fallback_graph.invoke(
                initial_state(user_input),
                config=config,
            )
        else:
            raise

    final_answer = ""
    for msg in reversed(result.get("messages", [])):
        content = getattr(msg, "content", None)
        if content and str(content).strip() not in (
            "Itinerary generated",
            "Trip extras generated",
            "Flight recommendations generated",
            "Hotel information fetched.",
            "Weather information fetched",
            "Plan generated.",
        ):
            final_answer = str(content)
            break

    if not final_answer:
        final_answer = result.get("itinerary") or "Plan ready."

    # Extract locations with confident origin/destination recognition
    locs = extract_trip_locations(user_input)
    dest = result.get("destination") or locs.get("destination") or extract_destination(user_input)
    dest = _clean_destination_candidate(dest)
    if not dest or len(dest) > 35 or dest.lower() in {"your destination", "destination", "custom destination", "custom trip"}:
        dest = locs.get("destination") or _extract_destination_from_query(user_input)
    if not dest or len(dest) > 35:
        dest = "Saudi Arabia" if "saudi" in user_input.lower() else "Custom Trip"

    # Extract duration
    m_dur = re.search(r"(\d+)\s*(?:day|days)", user_input, re.IGNORECASE)
    duration_str = f"{m_dur.group(1)} Days" if m_dur else "5 Days"

    # Extract origin (ensure origin is recognized accurately from query or state)
    origin_str = locs.get("origin", "") or result.get("origin", "")

    # Retain in thread memory for all subsequent follow-ups
    _THREAD_MEMORY[thread_id] = {
        "destination": dest,
        "origin": origin_str,
        "duration": duration_str,
        "original_query": user_input,
        "itinerary": result.get("itinerary", ""),
        "must_visit": result.get("must_visit", ""),
        "travel_essentials": result.get("travel_essentials", ""),
        "qa_history": [],
    }

    return {
        "thread_id": thread_id,
        "destination": dest,
        "answer": final_answer,
        "is_followup": False,
        "flight_results": result.get("flight_results", ""),
        "hotel_results": result.get("hotel_results", ""),
        "weather_results": result.get("weather_results", ""),
        "itinerary": result.get("itinerary", ""),
        "llm_calls": result.get("llm_calls", 0),
        "budget_breakdown": result.get("budget_breakdown", ""),
        "packing_list": result.get("packing_list", ""),
        "must_visit": result.get("must_visit", ""),
        "travel_essentials": result.get("travel_essentials", ""),
    }


if __name__ == "__main__":
    user_query = (
        "Plan a 7 day Japan trip from India in April with a mid-range budget, focused on food, culture and temples."
    )
    output = run_travel_agent(user_query, thread_id="test_thread_001")
    print("OUTPUT DESTINATION:", output.get("destination"))
    print("OUTPUT IS_FOLLOWUP:", output.get("is_followup"))
