import React from 'react'

export const SUGGESTIONS = [
  {
    emoji: "🇯🇵",
    tag: "Tokyo & Kyoto",
    title: "7 Days in Japan",
    sub: "Cherry Blossoms • Culinary Tour • Shrines",
    prompt: "Plan a 7 day Japan trip from India in April with a mid-range budget, focused on food, culture and temples."
  },
  {
    emoji: "🇫🇷",
    tag: "Paris & Louvre",
    title: "Parisienne Getaway",
    sub: "5 Days • City Centre • Under Budget",
    prompt: "I want a 5 day Paris trip in July from Delhi. Find flights, hotels near the centre, weather outlook and an itinerary under ₹1,60,000."
  },
  {
    emoji: "🏝️",
    tag: "Tropical Villa",
    title: "Bali Beach Escape",
    sub: "4 Days • Couple Getaway • Relaxed Pace",
    prompt: "Plan a 4 day beach getaway to Bali from Mumbai for two people, relaxed pace with cafe hopping and water activities."
  },
  {
    emoji: "🚆",
    tag: "Scenic Rail",
    title: "Europe by Train",
    sub: "10 Days • Amsterdam, Berlin & Prague",
    prompt: "Plan a 10 day Europe rail trip from India covering Amsterdam, Berlin and Prague on a mid-range budget with food recommendations."
  }
]

export default function Hero({ onSelectPrompt, onFocusInput, history = [], onLoadTrip }) {
  const recentTrips = history.slice(0, 3)

  return (
    <section className="hero">
      <div className="hero-badge">
        <span className="hero-badge-dot"></span>
        <span className="hero-badge-tag">NEXT-GEN TRAVEL</span>
        <span className="hero-badge-sep">•</span>
        <span>Autonomous Multi-Agent Swarm</span>
      </div>

      <h2>
        Plan your next journey<br />with <span className="grad">Intelligent Agents</span>
      </h2>

      <p className="hero-sub">
        Flights, boutique hotels, hyper-local dining, climate outlook and curated day-by-day itineraries — researched simultaneously by specialized agents.
      </p>

      <div className="hero-cta-row">
        <button className="btn btn-primary hero-cta" type="button" onClick={onFocusInput}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m22 2-7 20-4-9-9-4 20-7Z" />
          </svg>
          <span className="btn-label">Start Planning</span>
        </button>
        <span className="hero-cta-hint">Or choose an experience below</span>
      </div>

      {/* Returning User: Recent Saved Plans Banner */}
      {recentTrips.length > 0 && (
        <div className="hero-recent-section">
          <div className="hero-recent-head">
            <span className="hero-recent-label">YOUR RECENT ITINERARIES</span>
            <small>Archived from previous sessions</small>
          </div>
          <div className="hero-recent-grid">
            {recentTrips.map((trip) => (
              <button
                key={trip.id}
                type="button"
                className="hero-recent-card glass-panel"
                onClick={() => onLoadTrip && onLoadTrip(trip)}
                title={`Reopen ${trip.dest} itinerary`}
              >
                <div className="hero-recent-avatar">✈️</div>
                <div className="hero-recent-info">
                  <strong>{trip.dest}</strong>
                  <small>{trip.duration || 'Saved Itinerary'}</small>
                </div>
                <span className="hero-recent-arrow">Open ↗</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="suggestions">
        {SUGGESTIONS.map((item, idx) => (
          <button
            key={idx}
            className="suggestion"
            type="button"
            onClick={() => onSelectPrompt(item.prompt)}
          >
            <span className="suggestion-emoji">{item.emoji}</span>
            <span className="suggestion-body">
              {item.tag && <span className="suggestion-tag-pill">{item.tag}</span>}
              <strong>{item.title}</strong>
              <small>{item.sub}</small>
            </span>
            <span className="suggestion-arrow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
