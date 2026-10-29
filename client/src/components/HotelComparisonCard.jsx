import React, { useState } from 'react'
import { renderMarkdown } from '../utils/markdown'

export default function HotelComparisonCard({ hotelText, dest }) {
  const [showFullNotes, setShowFullNotes] = useState(false)
  const text = String(hotelText || '')
  const d = encodeURIComponent(dest || '')

  const bookingUrl = `https://www.booking.com/searchresults.html?ss=${d}`
  const airbnbUrl = `https://www.airbnb.com/s/${d}/homes`

  return (
    <div className="extra-card hotel-card-enhanced">
      <div className="extra-card-head">
        <div className="extra-card-ico">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 21h18M3 7v14M21 7v14M6 11h4M6 15h4M14 11h4M14 15h4M9 3h6v4H9z" />
          </svg>
        </div>
        <div className="extra-card-title">
          <strong>Hotel Suggestions & Stays</strong>
          <small>Handpicked neighbourhoods, top-rated stays & live booking</small>
        </div>
      </div>

      <div className="extra-card-body">
        {/* Neighborhood & Stay Tiers Strip */}
        <div className="hotel-tiers-strip">
          <div className="hotel-tier-pill">
            <span className="hotel-tier-emoji">✨</span>
            <div>
              <strong>Luxury & Resorts</strong>
              <small>Prime central locations</small>
            </div>
          </div>

          <div className="hotel-tier-pill">
            <span className="hotel-tier-emoji">🏨</span>
            <div>
              <strong>Boutique & Mid-Range</strong>
              <small>Walking distance to transit</small>
            </div>
          </div>

          <div className="hotel-tier-pill">
            <span className="hotel-tier-emoji">🎒</span>
            <div>
              <strong>Budget & Hostels</strong>
              <small>Great value for backpackers</small>
            </div>
          </div>
        </div>

        {/* AI Recommendations Content */}
        {text ? (
          <div className="md hotel-notes-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
        ) : (
          <p className="hotel-empty-hint">Recommended stays in prime locations near transit hubs.</p>
        )}

        {/* Live Hotel Booking CTA */}
        <div className="hotel-cta-row">
          <a
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-sm hotel-action-btn"
          >
            <span className="btn-label">Search on Booking.com</span>
            <span className="btn-arrow">↗</span>
          </a>

          <a
            href={airbnbUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-soft btn-sm hotel-action-btn"
          >
            <span className="btn-label">Browse Airbnb Homes</span>
            <span className="btn-arrow">↗</span>
          </a>
        </div>
      </div>
    </div>
  )
}
