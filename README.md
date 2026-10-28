# TravelBrain AI — Autonomous Multi-Agent Travel Planner

TravelBrain AI is a full-featured, commercial-grade travel planning platform powered by an autonomous multi-agent system built on **LangGraph**, **FastAPI**, and **Groq**. Describe any trip in conversational natural language, and a coordinated team of AI agents researches live flight routes, accommodations, weather conditions, packing recommendations, budget breakdowns, and daily itineraries into an actionable travel plan.

---

## 🌟 Key Features

### 1. 🤖 Autonomous Multi-Agent LangGraph Pipeline
- **Flight Specialist**: Researches likely departure/arrival airports, airlines servicing the route, flight durations, and fare brackets.
- **Hotel Specialist**: Identifies top accommodations matched to destination, vibe, and budget through web search MCP adapters.
- **Weather Specialist**: Pulls live conditions and multi-day meteorological forecasts via OpenWeather MCP server.
- **Itinerary Architect**: Synthesizes flight schedules, accommodations, and pacing into a day-by-day itinerary.
- **Extras Specialist**: Curates comprehensive budget breakdowns, packing checklists, must-visit local spots, and country essentials (visas, currency, plugs).
- **Final Assembler**: Packages all findings into a unified, clean itinerary ready to download, copy, or print.

### 2. ⚡ Commercial Travel App Experience
- **One-Click Booking Shortcuts**: Instant deeplinks for Google Flights, Skyscanner, Booking.com, Airbnb, and GetYourGuide with auto-filled destinations and dates.
- **Interactive Multi-City Destination Map**: Client-side Leaflet.js map powered by OpenStreetMap with geocoding, multi-city route lines, and automatic zoom framing.
- **Budget Converter & Split-Bill Calculator**: Real-time currency conversion between INR (₹), USD ($), EUR (€), GBP (£), and JPY (¥) with interactive group traveler bill splitting.
- **Live Weather & Wardrobe Recommendations**: Weather conditions bar paired with intelligent wardrobe advice pills tailored to climate conditions.
- **Smart Follow-Up Action Chips**: One-tap follow-up chips to explore street food, transit guides, packing lists, and safety tips.
- **Dark & Light Mode**: High-contrast, accessibility-tested themes with smooth switching and responsive UI.

---

## 🛠️ Architecture

```
User Query ──► [Flight Agent] ──► [Hotel Agent] ──► [Weather Agent]
                                                          │
   [Final Plan] ◄── [Final Agent] ◄── [Extras Agent] ◄── [Itinerary Agent]
```

- **Backend**: FastAPI with async route handlers and session isolation.
- **Orchestration**: LangGraph state graph with persistent PostgreSQL thread checkpointer.
- **LLM Engine**: Groq with `openai/gpt-oss-20b` (fast inference, high throughput, zero OTPM bottleneck).
- **MCP Servers**:
  - AviationStack MCP (local stdio tool for airport & airline lookup)
  - Tavily MCP (remote HTTP search for hotels and local hotspots)
  - OpenWeather MCP (local stdio tool for weather & forecasts)
- **Frontend**: Clean vanilla JavaScript + CSS with Leaflet.js maps, no heavy node build steps required.

---

## 🚀 Getting Started

### Prerequisites

- **Python 3.11+**
- **[uv](https://docs.astral.sh/uv/)** (recommended) or `pip`
- **PostgreSQL Database** (e.g., [Neon](https://neon.tech/) or [Render](https://render.com/) free tier)
- **API Keys**:
  - [Groq API Key](https://console.groq.com/)
  - [Tavily API Key](https://tavily.com/)
  - [AviationStack API Key](https://aviationstack.com/)
  - [OpenWeather API Key](https://openweathermap.org/api)

### Installation

1. **Clone or navigate to the repository**:

   ```bash
   cd TravelBrain-Multi-Agent-AI-Travel-Planner-Enhanced
   ```

2. **Install dependencies with uv**:

   ```bash
   uv sync
   ```

   *(Or with standard pip: `pip install -e .`)*

3. **Configure Environment Variables**:

   Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

   Fill in your credentials in `.env`:

   ```dotenv
   # LLM Engine
   GROQ_API_KEY=your_groq_api_key
   GROQ_MODEL=openai/gpt-oss-20b

   # Service API Keys
   TAVILY_API_KEY=your_tavily_api_key
   AVIATIONSTACK_API_KEY=your_aviationstack_api_key
   OPENWEATHER_API_KEY=your_openweather_api_key

   # Checkpointer Database (PostgreSQL URL)
   DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=require

   # Cache (optional)
   CACHE_ENABLED=false
   ```

4. **Start the Application**:

   ```bash
   uv run python app.py
   ```

5. **Open in Browser**:

   Navigate to `http://127.0.0.1:8000`. You will see the green **API connected** indicator when keys are validated.

---

## 💡 Usage Examples

Type any travel idea into the prompt bar:

- *"Plan a 7 day trip to Tokyo from India in April with a mid-range budget, focused on food, culture, and cherry blossoms."*
- *"I want a 5-day romantic getaway to Paris and Rome from Delhi under ₹1,80,000."*
- *"Plan a 4-day beach escape to Bali from Mumbai for two with cafe hopping and water activities."*

Use the **Trip Builder** (sliders icon next to the chat bar) if you prefer structured input fields for origin, destination, dates, duration, budget, and travel interests.

---

## 🔧 Troubleshooting

<details>
<summary><b>Groq 429 Rate Limit Errors</b></summary>

If using high-parameter models on Groq's free tier, token limits can be reached. The recommended model `openai/gpt-oss-20b` has high token-per-minute allowances and comfortably processes full multi-agent travel plans. You can configure this via `GROQ_MODEL=openai/gpt-oss-20b` in your `.env`.
</details>

<details>
<summary><b>Missing Database URL</b></summary>

LangGraph uses PostgreSQL to checkpoint conversational threads so you can revisit plans and ask follow-ups. Ensure a valid connection string with `?sslmode=require` is present in `DATABASE_URL`.
</details>

<details>
<summary><b>Running with Docker</b></summary>

You can run the full stack including Redis cache via Docker Compose:

```bash
docker compose up -d
```
</details>

---

## 📄 License

This project is licensed under the [GNU General Public License v3.0](LICENSE).
