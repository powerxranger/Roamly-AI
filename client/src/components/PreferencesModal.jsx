import React, { useState, useEffect } from 'react'

export default function PreferencesModal({
  isOpen,
  onClose,
  currency,
  onSelectCurrency,
  pace,
  onSelectPace,
  themeColor,
  onSelectThemeColor,
  theme,
  onToggleTheme,
  config,
  onOpenDevSettings,
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const CURRENCIES = [
    { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
    { code: 'USD', symbol: '$', name: 'US Dollar' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
    { code: 'GBP', symbol: '£', name: 'British Pound' },
    { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  ]

  const PACING_OPTIONS = [
    { id: 'relaxed', label: 'Relaxed Pace', emoji: '🏖️', desc: 'Fewer stops, leisure time & cafes' },
    { id: 'balanced', label: 'Balanced', emoji: '⚖️', desc: 'Mix of sights, local food & rest' },
    { id: 'active', label: 'Packed & Fast', emoji: '🏃', desc: 'Max sights, tours & photo spots' },
  ]

  const ACCENTS = [
    { id: 'emerald', name: 'Emerald', color: '#0d9488' },
    { id: 'cyan', name: 'Sky Cyan', color: '#0284c7' },
    { id: 'indigo', name: 'Royal Indigo', color: '#6366f1' },
    { id: 'amber', name: 'Warm Amber', color: '#d97706' },
  ]

  return (
    <>
      <div className="modal-scrim" onClick={onClose}></div>
      <div className="modal preferences-modal" role="dialog" aria-modal="true" aria-labelledby="prefTitle">
        <div className="modal-head">
          <div className="modal-heading">
            <h2 id="prefTitle">Trip Customizer & Preferences</h2>
            <p>Customize your currency, planning pace, and personal theme aesthetics.</p>
          </div>
          <button className="icon-btn" type="button" aria-label="Close preferences" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {/* Section 1: Currency Preference */}
          <div className="pref-section">
            <label className="pref-label">Default Currency</label>
            <p className="pref-sub">Used for budget estimates, airfare and per-person splits</p>
            <div className="pref-currency-grid">
              {CURRENCIES.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  className={`pref-currency-card ${currency === c.code ? 'active' : ''}`}
                  onClick={() => onSelectCurrency(c.code)}
                >
                  <span className="pref-currency-symbol">{c.symbol}</span>
                  <div className="pref-currency-info">
                    <strong>{c.code}</strong>
                    <small>{c.name}</small>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Section 2: Trip Pacing Style */}
          <div className="pref-section">
            <label className="pref-label">Travel Style & Pacing</label>
            <p className="pref-sub">How packed do you like your daily schedule?</p>
            <div className="pref-pace-grid">
              {PACING_OPTIONS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`pref-pace-card ${pace === p.id ? 'active' : ''}`}
                  onClick={() => onSelectPace(p.id)}
                >
                  <span className="pref-pace-emoji">{p.emoji}</span>
                  <div className="pref-pace-info">
                    <strong>{p.label}</strong>
                    <small>{p.desc}</small>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Section 3: Accent Color & Appearance */}
          <div className="pref-section">
            <label className="pref-label">Theme & Accent Styling</label>
            <p className="pref-sub">Pick your favorite visual style</p>
            <div className="pref-accent-row">
              {ACCENTS.map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  className={`pref-accent-dot ${themeColor === acc.id ? 'active' : ''}`}
                  style={{ backgroundColor: acc.color }}
                  title={acc.name}
                  onClick={() => onSelectThemeColor(acc.id)}
                ></button>
              ))}

              <button
                type="button"
                className="btn btn-soft btn-sm"
                onClick={onToggleTheme}
                style={{ marginLeft: 'auto' }}
              >
                <span>{theme === 'dark' ? '☀️ Switch to Light' : '🌙 Switch to Dark'}</span>
              </button>
            </div>
          </div>

          {/* Discreet API Key Manager for developers */}
          {onOpenDevSettings && (
            <div className="pref-dev-wrap">
              <button
                type="button"
                className="pref-dev-link"
                onClick={() => {
                  onClose()
                  onOpenDevSettings()
                }}
              >
                ⚙️ Custom API Key Settings (Optional)
              </button>
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn btn-primary btn-sm" type="button" onClick={onClose}>
            Apply & Save
          </button>
        </div>
      </div>
    </>
  )
}
