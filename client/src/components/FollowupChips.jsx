import React from 'react'

function isInvalidDestination(str) {
  if (!str) return true
  const s = String(str).trim().toLowerCase().replace(/[?!.,;]+$/, '').trim()
  if (s.length < 2 || s.length > 30) return true
  if (/[?!@#$%*_]/.test(s)) return true
  if (
    /^(?:hey+|heya|heyo|hello+|hi+|hiya+|yo+|sup|howdy|aloha|hola|bonjour|greetings?)\b/i.test(s) ||
    /\b(?:how(?:'s| is|s)?\s*(?:it|things?|you|u|life)|what(?:'s|s)?\s*up|how\s+are\s+you|how\s+it\s+going|how\s+its\s+going)\b/i.test(s) ||
    /\b(?:how|its|it's|going|bro|hey|hello|doing|asking|wanna|chaos|locate|free time|what|where|why)\b/i.test(s)
  ) return true
  if (/your destination|destination|custom destination|custom trip|home/i.test(s)) return true
  return false
}

export default function FollowupChips({ dest, onSelect }) {
  // Clean any trailing prepositions or noise
  let cleanDest = String(dest || '')
    .replace(/\b(?:like|maybe|please|just|get|freshest|dishes)\b/gi, '')
    .replace(/^(?:the|a|an|in|to|from|at|near|for|around|of)\s+/i, '')
    .replace(/\s+(?:in|to|for|from|with|and|or)$/i, '')
    .replace(/^[,.\s-]+|[,.\s-]+$/g, '')
    .trim()

  const hasValidDest = !isInvalidDestination(cleanDest)

  const suggestions = hasValidDest
    ? [
        `🍝 Best local street food & authentic dining in ${cleanDest}`,
        `🚇 Public transport guide & transit passes for ${cleanDest}`,
        `🌧️ Rainy day & bad weather backup itinerary in ${cleanDest}`,
        `💡 Top travel scams to avoid & safety tips for ${cleanDest}`,
        `📸 5 most photogenic hidden photo spots in ${cleanDest}`,
      ]
    : [
        '🏜️ Calm & peaceful retreats in Saudi Arabia away from chaos',
        '🌸 7-day Japan trip focused on food, temples and culture',
        '✨ Curated local food and hidden gems in Dubai',
        '🍕 Authentic trattorias and historic walks in Rome, Italy',
        '🏔️ Scenic mountain rail & lakeside getaway in Switzerland',
      ]

  return (
    <div className="followup-chips-wrap">
      <div className="followup-chips-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <span>{hasValidDest ? 'Ask a Follow-up Question' : 'Popular Travel Inspirations & Questions'}</span>
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
