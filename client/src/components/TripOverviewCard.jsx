import React from 'react'

export default function TripOverviewCard({
  dest,
  origin,
  durationStr,
  travellersCount,
  onTravellersChange,
  budgetStr,
  timingStr,
  onScrollTo,
}) {
  const fromCity = origin || 'Your Departure City'
  const toCity = dest || 'Your Destination'

  return (
    <div className="trip-overview-card-wrapper extra-card glass-card" id="overview-section">
      {/* Head */}
      <div className="extra-card-head">
        <div className="extra-card-ico">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
          </svg>
        </div>
        <div className="extra-card-title">
          <strong>Trip Overview & Multi-Agent Briefing</strong>
          <small>Key trip parameters synthesized from your request</small>
        </div>
      </div>

      <div className="extra-card-body">
        {/* Visual Journey Banner (similar to flight banner with prominent nodes) */}
        <div className="trip-route-banner">
          <div className="trip-route-node">
            <span className="trip-route-node-badge">DEPARTURE</span>
            <strong className="trip-route-node-city">{fromCity}</strong>
            <small className="trip-route-node-sub">Trip Origin</small>
          </div>

          <div className="trip-route-connector">
            <span className="trip-route-duration-badge">{durationStr}</span>
            <div className="trip-route-line">
              <span className="trip-route-plane-ico">✈</span>
            </div>
            <span className="trip-route-type-tag">Round Trip Itinerary</span>
          </div>

          <div className="trip-route-node">
            <span className="trip-route-node-badge dest-badge">DESTINATION</span>
            <strong className="trip-route-node-city">{toCity}</strong>
            <small className="trip-route-node-sub">Primary Destination</small>
          </div>
        </div>

        {/* Interactive Trip Parameter Grid */}
        <div className="trip-stats-grid">
          {/* Party Size with Interactive Stepper */}
          <div className="trip-stat-card">
            <div className="trip-stat-card-head">
              <span className="trip-stat-icon">👥</span>
              <span className="trip-stat-label">PARTY SIZE</span>
            </div>
            <div className="trip-stepper-control">
              <button
                type="button"
                className="trip-stepper-btn"
                onClick={() => onTravellersChange && onTravellersChange(Math.max(1, travellersCount - 1))}
                title="Decrease travelers"
              >
                −
              </button>
              <strong className="trip-stepper-val">
                {travellersCount} {travellersCount === 1 ? 'Solo Traveller' : 'Travellers'}
              </strong>
              <button
                type="button"
                className="trip-stepper-btn"
                onClick={() => onTravellersChange && onTravellersChange(Math.min(20, travellersCount + 1))}
                title="Increase travelers"
              >
                +
              </button>
            </div>
            <span className="trip-stat-hint">Click − / + to recalculate budget</span>
          </div>

          {/* Budget Estimate */}
          <div
            className="trip-stat-card clickable"
            onClick={() => onScrollTo && onScrollTo('budget-section')}
            title="Click to view detailed expense breakdown & currency converter"
          >
            <div className="trip-stat-card-head">
              <span className="trip-stat-icon">💰</span>
              <span className="trip-stat-label">ESTIMATED BUDGET</span>
            </div>
            <strong className="trip-stat-val trip-stat-val-highlight">{budgetStr}</strong>
            <span className="trip-stat-hint link-hint">Click for expense split ↗</span>
          </div>

          {/* Travel Season / Timing */}
          <div
            className="trip-stat-card clickable"
            onClick={() => onScrollTo && onScrollTo('weather-section')}
            title="Click to view climate forecast & packing advice"
          >
            <div className="trip-stat-card-head">
              <span className="trip-stat-icon">🌤️</span>
              <span className="trip-stat-label">TRAVEL WINDOW</span>
            </div>
            <strong className="trip-stat-val">{timingStr}</strong>
            <span className="trip-stat-hint link-hint">Click for weather forecast ↗</span>
          </div>

          {/* Duration & Pacing */}
          <div
            className="trip-stat-card clickable"
            onClick={() => onScrollTo && onScrollTo('itinerary-section')}
            title="Click to jump to Day-by-Day timeline"
          >
            <div className="trip-stat-card-head">
              <span className="trip-stat-icon">📅</span>
              <span className="trip-stat-label">TRIP DURATION</span>
            </div>
            <strong className="trip-stat-val">{durationStr}</strong>
            <span className="trip-stat-hint link-hint">Click for full daily schedule ↗</span>
          </div>
        </div>

        {/* Quick Navigation Strip */}
        <div className="trip-nav-strip">
          <span className="trip-nav-strip-label">Jump to Section:</span>
          <div className="trip-nav-buttons">
            <button type="button" className="trip-nav-btn" onClick={() => onScrollTo('map-section')}>
              🗺️ Map
            </button>
            <button type="button" className="trip-nav-btn" onClick={() => onScrollTo('flights-section')}>
              ✈️ Flights
            </button>
            <button type="button" className="trip-nav-btn" onClick={() => onScrollTo('hotels-section')}>
              🏨 Stays
            </button>
            <button type="button" className="trip-nav-btn" onClick={() => onScrollTo('itinerary-section')}>
              📅 Itinerary
            </button>
            <button type="button" className="trip-nav-btn" onClick={() => onScrollTo('budget-section')}>
              💰 Budget
            </button>
            <button type="button" className="trip-nav-btn" onClick={() => onScrollTo('packing-section')}>
              🎒 Packing
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
