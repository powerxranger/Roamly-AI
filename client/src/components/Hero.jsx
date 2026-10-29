import React from 'react'

export const SUGGESTIONS = [
  {
    emoji: "🇯🇵",
    title: "7 Days in Japan",
    sub: "Food • Temples • Cherry Blossom Season",
    prompt: "Plan a 7 day Japan trip from India in April with a mid-range budget, focused on food, culture and temples."
  },
  {
    emoji: "🗼",
    title: "Paris Getaway",
    sub: "5 Days • Centre Stay • Under Budget",
    prompt: "I want a 5 day Paris trip in July from Delhi. Find flights, hotels near the centre, weather outlook and an itinerary under ₹1,60,000."
  },
  {
    emoji: "🏝️",
    title: "Bali Beach Escape",
    sub: "4 Days • For Two • Relaxed Pace",
    prompt: "Plan a 4 day beach getaway to Bali from Mumbai for two people, relaxed pace with cafe hopping and water activities."
  },
  {
    emoji: "🚆",
    title: "Europe By Rail",
    sub: "10 Days • Multi-City • Mid-Range",
    prompt: "Plan a 10 day Europe rail trip from India covering Amsterdam, Berlin and Prague on a mid-range budget with food recommendations."
  }
]

export default function Hero({ onSelectPrompt, onFocusInput }) {
  return (
    <section className="hero">
      <div className="hero-badge">
        <span className="hero-badge-dot"></span>
        <span>AI Powered • Multi-Agent Travel Planner</span>
      </div>

      <h2>
        Plan your dream trip<br />with <span className="grad">AI Agents</span>
      </h2>

      <p className="hero-sub">
        Flights, hotels, weather, packing ideas and a realistic day-by-day itinerary — researched
        by a team of specialized agents and assembled into one clean plan.
      </p>

      <div className="hero-cta-row">
        <button className="btn btn-primary hero-cta" type="button" onClick={onFocusInput}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m22 2-7 20-4-9-9-4 20-7Z" />
          </svg>
          <span className="btn-label">Start Planning</span>
        </button>
        <span className="hero-cta-hint">Or pick a suggestion below</span>
      </div>

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
              <strong>{item.title}</strong>
              <small>{item.sub}</small>
            </span>
            <span className="suggestion-arrow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
