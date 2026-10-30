import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { getTripHistory, deleteTripFromHistory, clearTripHistory } from '../utils/historyStorage'

export default function TripHistoryModal({ isOpen, onClose, onLoadTrip, onToast, currentUser }) {
  const [history, setHistory] = useState([])

  useEffect(() => {
    if (isOpen) {
      setHistory(getTripHistory(currentUser))
    }
  }, [isOpen, currentUser])

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

  const handleSelect = (trip) => {
    if (onLoadTrip) {
      onLoadTrip(trip)
      if (onToast) onToast(`Loaded ${trip.dest || 'trip'} dossier`)
    }
    onClose()
  }

  const handleDelete = (e, id, dest) => {
    e.stopPropagation()
    const updated = deleteTripFromHistory(id, currentUser)
    setHistory(updated)
    if (onToast) onToast(`Deleted ${dest || 'trip'} from history`)
  }

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear your entire trip history?')) {
      clearTripHistory(currentUser)
      setHistory([])
      if (onToast) onToast('Trip history cleared')
    }
  }

  const formatTime = (ts) => {
    if (!ts) return ''
    const diff = Date.now() - ts
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days === 1) return 'Yesterday'
    return `${days}d ago`
  }

  return createPortal(
    <div className="modal-portal-wrapper">
      <div className="modal-scrim" onClick={onClose} />
      <div
        className="modal modal-history glass-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="historyModalTitle"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-head">
          <div className="modal-heading">
            <span className="modal-category">TRAVEL ARCHIVE</span>
            <h2 id="historyModalTitle">Saved Trip Itineraries</h2>
            <p className="modal-sub">
              Your previously planned trips stored in your browser session. Revisit or resume anytime.
            </p>
          </div>
          <button className="icon-btn modal-close" onClick={onClose} type="button" aria-label="Close history modal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="modal-body history-body">
          {history.length === 0 ? (
            <div className="history-empty">
              <span className="history-empty-icon">🧭</span>
              <h4>No Saved Trips Yet</h4>
              <p>Ask Roamly AI to plan a trip to any city or country and it will automatically be archived here.</p>
            </div>
          ) : (
            <div className="history-list">
              {history.map((trip) => (
                <div
                  key={trip.id}
                  className="history-item glass-panel"
                  onClick={() => handleSelect(trip)}
                  title="Click to reload this trip dossier"
                >
                  <div className="history-item-left">
                    <div className="history-avatar">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2a.8.8 0 0 0-.8 1.3L8 11l-2 2-2.2-.5a.6.6 0 0 0-.6 1L5 16l2.5 1.8a.6.6 0 0 0 1-.6L8 15l2-2 3.5 4a.8.8 0 0 0 1.3-.8Z" />
                      </svg>
                    </div>
                    <div className="history-meta">
                      <div className="history-title-row">
                        <strong className="history-dest">{trip.dest || 'Custom Trip'}</strong>
                        {trip.duration && <span className="history-badge">{trip.duration}</span>}
                      </div>
                      <span className="history-origin">
                        {trip.origin ? `From ${trip.origin}` : 'Round Trip'} • {formatTime(trip.date)}
                      </span>
                      <small className="history-query-snippet">"{trip.query}"</small>
                    </div>
                  </div>

                  <div className="history-item-actions">
                    <button
                      type="button"
                      className="btn btn-sm btn-primary history-load-btn"
                      onClick={() => handleSelect(trip)}
                    >
                      View Plan ↗
                    </button>
                    <button
                      type="button"
                      className="icon-btn sm history-del-btn"
                      title="Delete trip from history"
                      onClick={(e) => handleDelete(e, trip.id, trip.dest)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {history.length > 0 && (
          <div className="modal-footer history-footer">
            <span className="history-count">
              {history.length} {history.length === 1 ? 'trip' : 'trips'} saved locally
            </span>
            <button type="button" className="btn btn-soft btn-sm btn-danger-soft" onClick={handleClearAll}>
              Clear History
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
