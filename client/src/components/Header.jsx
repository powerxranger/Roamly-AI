import React from 'react'

export default function Header({
  onOpenPreferences,
  onOpenHistory,
  onOpenAuth,
  onNewTrip,
  theme,
  onToggleTheme,
  currency = 'INR',
  tripCount = 0,
  user = null
}) {
  const currencySymbols = {
    INR: '₹',
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥'
  }

  return (
    <header className="topbar">
      <a className="brand" href="/" onClick={(e) => { e.preventDefault(); onNewTrip(); }}>
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2a.8.8 0 0 0-.8 1.3L8 11l-2 2-2.2-.5a.6.6 0 0 0-.6 1L5 16l2.5 1.8a.6.6 0 0 0 1-.6L8 15l2-2 3.5 4a.8.8 0 0 0 1.3-.8Z" />
          </svg>
        </span>
        <span className="brand-text">
          <strong>Roamly</strong>
          <em>AI</em>
        </span>
      </a>

      <div className="topbar-actions">
        {/* Saved Trips Archive Drawer */}
        <button
          className="btn btn-soft btn-sm btn-history-trigger"
          onClick={onOpenHistory}
          type="button"
          title="View your saved trip history"
        >
          <span className="pref-btn-icon">🧭</span>
          <span className="btn-label">My Trips</span>
          {tripCount > 0 && <span className="history-count-pill">{tripCount}</span>}
        </button>

        {/* Interactive Trip Preferences & Currency Switcher */}
        <button
          className="btn btn-soft btn-sm btn-pref-trigger"
          onClick={onOpenPreferences}
          type="button"
          title="Trip Customizer, Currency & Aesthetics"
        >
          <span className="pref-btn-icon">✨</span>
          <span className="btn-label">Preferences</span>
          <span className="currency-pill">{currencySymbols[currency] || currency}</span>
        </button>

        <button className="btn btn-soft btn-sm" onClick={onNewTrip} type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="btn-label">New trip</span>
        </button>

        {/* User Account / Profile */}
        {user ? (
          <button
            className={`btn btn-sm user-profile-btn ${user.isGuest ? 'btn-soft is-guest-btn' : 'btn-soft'}`}
            onClick={onOpenAuth}
            type="button"
            title={user.isGuest ? 'Guest Session — Click to Sign In or Create Account' : `Account: ${user.name} (${user.email})`}
          >
            <span className="user-avatar-pill">{user.avatar || '👤'}</span>
            <span className="btn-label user-name-label">{user.isGuest ? 'Guest (Sign In)' : user.name.split(' ')[0]}</span>
          </button>
        ) : (
          <button
            className="btn btn-primary btn-sm user-signin-btn"
            onClick={onOpenAuth}
            type="button"
            title="Sign in to save trips and customize itineraries"
          >
            <span className="btn-label">Sign In</span>
          </button>
        )}

        <button className="icon-btn" onClick={onToggleTheme} type="button" aria-label="Toggle colour theme" title="Toggle theme">
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  )
}
