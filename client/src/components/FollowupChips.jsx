import React from 'react'

export default function FollowupChips({ dest, onSelect }) {
  if (!dest) return null

  // Clean any trailing prepositions or noise
  const cleanDest = String(dest || '')
    .replace(/\b(?:like|maybe|please|just|get|freshest|dishes)\b/gi, '')
    .replace(/\s+(?:in|to|for|from|with|and|or)$/i, '')
    .trim() || 'your destination'

  const suggestions = [
    `🍝 Best local street food & authentic dining in ${cleanDest}`,
    `🚇 Public transport guide & transit passes for ${cleanDest}`,
    `🌧️ Rainy day & bad weather backup itinerary in ${cleanDest}`,
    `💡 Top travel scams to avoid & safety tips for ${cleanDest}`,
    `📸 5 most photogenic hidden photo spots in ${cleanDest}`,
  ]

  return (
    <div className="followup-chips-wrap">
      <div className="followup-chips-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <span>Ask a Follow-up Question</span>
      </div>

      <div className="followup-chips-list">
        {suggestions.map((promptText, idx) => (
          <button
            key={idx}
            type="button"
            className="followup-chip"
            onClick={() => onSelect(promptText)}
          >
            {promptText}
          </button>
        ))}
      </div>
    </div>
  )
}
