import React from 'react'

export default function BookingShortcuts({ dest, origin }) {
  if (!dest) return null

  const d = encodeURIComponent(dest)
  const o = origin ? encodeURIComponent(origin) : ''

  const flightsUrl = o
    ? `https://www.google.com/travel/flights?q=flights+from+${o}+to+${d}`
    : `https://www.google.com/travel/flights?q=flights+to+${d}`

  const skyscannerUrl = o
    ? `https://www.skyscanner.com/transport/flights/${o}/${d}`
    : `https://www.skyscanner.com/flights-to/${d}`

  const bookingUrl = `https://www.booking.com/searchresults.html?ss=${d}`
  const airbnbUrl = `https://www.airbnb.com/s/${d}/homes`
  const gygUrl = `https://www.getyourguide.com/s/?q=${d}`

  const links = [
    { name: 'Google Flights', icon: '✈️', url: flightsUrl },
    { name: 'Skyscanner', icon: '🛫', url: skyscannerUrl },
    { name: 'Booking.com', icon: '🏨', url: bookingUrl },
    { name: 'Airbnb', icon: '🏡', url: airbnbUrl },
    { name: 'GetYourGuide Activities', icon: '🎟️', url: gygUrl },
  ]

  return (
    <div className="booking-shortcuts">
      <div className="booking-shortcuts-head">
        <div className="booking-shortcuts-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
          </svg>
          <span>Instant Booking Shortcuts</span>
        </div>
        <span className="booking-shortcuts-hint">Pre-filtered for {dest}</span>
      </div>

      <div className="booking-pills">
        {links.map((item, idx) => (
          <a
            key={idx}
            className="booking-pill"
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="booking-pill-ico">{item.icon}</span>
            <span>{item.name}</span>
            <span className="booking-pill-arrow">↗</span>
          </a>
        ))}
      </div>
    </div>
  )
}
