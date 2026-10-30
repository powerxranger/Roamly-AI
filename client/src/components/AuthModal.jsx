import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { loginUser, registerUser, continueAsGuest, logoutUser } from '../utils/auth'

export default function AuthModal({ isOpen, onClose, onAuthSuccess, onLogout, currentUser, onToast }) {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [forceSwitch, setForceSwitch] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSignOut = () => {
    logoutUser()
    if (onLogout) onLogout()
    if (onToast) onToast('Signed out of Roamly')
    setForceSwitch(false)
    onClose()
  }

  // If user is currently signed in and not switching accounts, show profile card
  if (currentUser && !forceSwitch) {
    return createPortal(
      <div className="modal-portal-wrapper">
        <div className="modal-scrim" onClick={onClose} />
        <div
          className="modal modal-auth glass-card"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="auth-header">
            <div className="auth-avatar-large">
              {currentUser.avatar || '👤'}
            </div>
            <h3>{currentUser.name}</h3>
            <span className="auth-user-email">{currentUser.email}</span>
            <span className="auth-status-pill">
              {currentUser.isGuest ? '🧭 Guest Traveler' : '✓ Verified Member'}
            </span>
          </div>

          <div className="auth-profile-actions">
            {currentUser.isGuest ? (
              <button
                type="button"
                className="btn btn-primary auth-profile-btn"
                onClick={() => setForceSwitch(true)}
              >
                Sign In / Create Account ↗
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-soft auth-profile-btn"
                  onClick={() => setForceSwitch(true)}
                >
                  Switch Account
                </button>
                <button
                  type="button"
                  className="btn btn-soft btn-danger-soft auth-profile-btn"
                  onClick={handleSignOut}
                >
                  Sign Out
                </button>
              </>
            )}
          </div>

          <button type="button" className="btn btn-primary auth-done-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>,
      document.body
    )
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      let user
      if (mode === 'register') {
        user = registerUser(name, email, password)
        if (onToast) onToast(`Welcome to Roamly, ${user.name}!`)
      } else {
        user = loginUser(email, password)
        if (onToast) onToast(`Welcome back, ${user.name}!`)
      }

      setForceSwitch(false)
      if (onAuthSuccess) onAuthSuccess(user)
      onClose()
    } catch (err) {
      setError(err.message || 'Authentication failed. Please check your details.')
    } finally {
      setLoading(false)
    }
  }

  const handleGuest = () => {
    setError('')
    const guest = continueAsGuest('Guest Traveler')
    if (onToast) onToast('Signed in as Guest Traveler')
    setForceSwitch(false)
    if (onAuthSuccess) onAuthSuccess(guest)
    onClose()
  }

  return createPortal(
    <div className="modal-portal-wrapper">
      <div className="modal-scrim" onClick={onClose} />
      <div
        className="modal modal-auth glass-card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Apple Style Segmented Tab */}
        <div className="auth-segmented-wrap">
          <div className="auth-segmented">
            <button
              type="button"
              className={`auth-segment-btn ${mode === 'login' ? 'active' : ''}`}
              onClick={() => { setMode('login'); setError(''); }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`auth-segment-btn ${mode === 'register' ? 'active' : ''}`}
              onClick={() => { setMode('register'); setError(''); }}
            >
              Create Account
            </button>
          </div>
        </div>

        {/* Header */}
        <div className="auth-header">
          <div className="auth-avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2a.8.8 0 0 0-.8 1.3L8 11l-2 2-2.2-.5a.6.6 0 0 0-.6 1L5 16l2.5 1.8a.6.6 0 0 0 1-.6L8 15l2-2 3.5 4a.8.8 0 0 0 1.3-.8Z" />
            </svg>
          </div>
          <h3>{mode === 'login' ? 'Sign In to Roamly' : 'Join Roamly AI'}</h3>
          <p className="auth-sub">
            {mode === 'login'
              ? 'Access your saved trips, custom preferences, and autonomous itineraries.'
              : 'Create your account to start crafting personalized multi-agent travel plans.'}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="auth-error-banner" role="alert">
            <span className="auth-error-dot">!</span>
            <div className="auth-error-content">
              <span>{error}</span>
              {mode === 'login' && error.includes('create an account first') && (
                <button
                  type="button"
                  className="auth-error-switch-btn"
                  onClick={() => {
                    setMode('register')
                    setError('')
                  }}
                >
                  Switch to Create Account →
                </button>
              )}
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'register' && (
            <div className="auth-field">
              <label htmlFor="auth-name">Full Name</label>
              <input
                id="auth-name"
                type="text"
                placeholder="e.g. Alex Rivera"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="auth-email">Email Address</label>
            <input
              id="auth-email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus={mode === 'login'}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary auth-submit-btn" disabled={loading}>
            {loading ? 'Authenticating...' : mode === 'login' ? 'Sign In' : 'Create Free Account'}
          </button>
        </form>

        {/* Divider */}
        <div className="auth-divider">
          <span>OR</span>
        </div>

        {/* Quick Guest / Demo Access */}
        <div className="auth-guest-row">
          <button type="button" className="btn btn-soft auth-guest-btn" onClick={handleGuest}>
            <span className="auth-guest-icon">🧭</span>
            <span>Explore as Guest Traveler</span>
          </button>
        </div>

        <p className="auth-terms">
          By signing in, you agree to Roamly's Travel Concierge Terms of Service & Privacy Policy.
        </p>
      </div>
    </div>,
    document.body
  )
}
