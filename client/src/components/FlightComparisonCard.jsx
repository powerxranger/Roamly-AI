import React, { useState } from 'react'
import { renderMarkdown } from '../utils/markdown'

export default function FlightComparisonCard({ flightText, origin, dest }) {
  const [showFullDetails, setShowFullDetails] = useState(false)
  const text = String(flightText || '')

  const fromCity = origin || 'Your City'
  const toCity = dest || 'Destination'

  const o = encodeURIComponent(origin || '')
  const d = encodeURIComponent(dest || '')

  const googleFlightsUrl = origin
    ? `https://www.google.com/travel/flights?q=flights+from+${o}+to+${d}`
    : `https://www.google.com/travel/flights?q=flights+to+${d}`

  const skyscannerUrl = origin
    ? `https://www.skyscanner.com/transport/flights/${o}/${d}`
    : `https://www.skyscanner.com/flights-to/${d}`

  // Extract airlines mentioned in text
  const airlines = []
  const airlineMatches = text.match(/(?:Air India|Emirates|IndiGo|Qatar Airways|Singapore Airlines|Japan Airlines|ANA|Lufthansa|British Airways|Etihad|Turkish Airlines|Air France|KLM|United|Delta|American Airlines|Cathay Pacific|Thai Airways|Malaysia Airlines|VietJet|Qantas)/gi)
  if (airlineMatches) {
    airlineMatches.forEach((a) => {
      const clean = a.trim()
      if (!airlines.includes(clean)) airlines.push(clean)
    })
  }

  // Extract duration if present
  let duration = '6–9 hrs (1 stop typical)'
  const durMatch = text.match(/(\d+(?:\.\d+)?\s*(?:hours?|hrs?)(?:\s*(?:and)?\s*\d+\s*(?:mins?|minutes?))?)/i)
  if (durMatch) duration = durMatch[1]

  // Extract price if present
  let priceRange = 'Check live rates below'
  const priceMatch = text.match(/([₹$€£]\s*[\d,]+(?:\s*[-–to]+\s*[₹$€£]?\s*[\d,]+)?)/i) || text.match(/(\d{4,6}\s*(?:INR|USD|EUR))/i)
  if (priceMatch) priceRange = priceMatch[1]

  return (
    <div className="extra-card flight-card-enhanced">
      <div className="extra-card-head">
        <div className="extra-card-ico">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2a.8.8 0 0 0-.8 1.3L8 11l-2 2-2.2-.5a.6.6 0 0 0-.6 1L5 16l2.5 1.8a.6.6 0 0 0 1-.6L8 15l2-2 3.5 4a.8.8 0 0 0 1.3-.8Z" />
          </svg>
        </div>
        <div className="extra-card-title">
          <strong>Flight Route & Airfare Intelligence</strong>
          <small>Estimated routes, top carriers, typical durations & live search</small>
        </div>
      </div>

      <div className="extra-card-body">
        {/* Route Banner */}
        <div className="flight-route-banner">
          <div className="flight-city-node">
            <span className="flight-city-code">DEP</span>
            <strong className="flight-city-name">{fromCity}</strong>
          </div>

          <div className="flight-path-graphic">
            <span className="flight-path-duration">{duration}</span>
            <div className="flight-path-line">
              <span className="flight-path-plane">✈</span>
            </div>
            <span className="flight-path-type">Connecting / Non-stop</span>
          </div>

          <div className="flight-city-node">
            <span className="flight-city-code">ARR</span>
            <strong className="flight-city-name">{toCity}</strong>
          </div>
        </div>

        {/* Highlight Stats Grid */}
        <div className="flight-highlights-grid">
          <div className="flight-stat-tile">
            <span className="flight-stat-label">Estimated Fare</span>
            <strong className="flight-stat-val">{priceRange}</strong>
          </div>

          <div className="flight-stat-tile">
            <span className="flight-stat-label">Key Carriers</span>
            <div className="flight-carriers-chips">
              {airlines.length > 0 ? (
                airlines.slice(0, 4).map((air, i) => (
                  <span key={i} className="flight-carrier-badge">
                    {air}
                  </span>
                ))
              ) : (
                <span className="flight-carrier-badge">Top International Airlines</span>
              )}
            </div>
          </div>

          <div className="flight-stat-tile">
            <span className="flight-stat-label">Best Booking Window</span>
            <span className="flight-stat-sub">6–8 weeks before departure</span>
          </div>
        </div>

        {/* Live Booking CTA buttons */}
        <div className="flight-cta-row">
          <a
            href={googleFlightsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-sm flight-action-btn"
          >
            <span className="btn-label">Compare on Google Flights</span>
            <span className="btn-arrow">↗</span>
          </a>

          <a
            href={skyscannerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-soft btn-sm flight-action-btn"
          >
            <span className="btn-label">Check Skyscanner</span>
            <span className="btn-arrow">↗</span>
          </a>

          {text && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowFullDetails(!showFullDetails)}
            >
              {showFullDetails ? 'Hide Notes' : 'View Full Airport Notes'}
            </button>
          )}
        </div>

        {/* Collapsible raw AI details */}
        {showFullDetails && text && (
          <div className="flight-detailed-notes">
            <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
          </div>
        )}
      </div>
    </div>
  )
}
