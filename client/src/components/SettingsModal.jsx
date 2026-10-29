import React, { useState, useEffect } from 'react'
import { saveConfig, resetConfig } from '../services/api'

export default function SettingsModal({
  isOpen,
  onClose,
  config,
  onConfigUpdated,
  onToast
}) {
  const [inputs, setInputs] = useState({})
  const [revealed, setRevealed] = useState({})
  const [errors, setErrors] = useState({})
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setInputs({})
      setErrors({})
      setRevealed({})
    }
  }, [isOpen])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const credentials = (config && config.credentials) || {}

  const toggleReveal = (name) => {
    setRevealed((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  const handleInputChange = (name, val) => {
    setInputs((prev) => ({ ...prev, [name]: val }))
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }))
    }
  }

  const handleSave = async () => {
    if (isSaving) return

    const payload = {}
    let anything = false

    Object.keys(inputs).forEach((name) => {
      const val = inputs[name]?.trim()
      if (val) {
        anything = true
        payload[name.toLowerCase()] = val
      }
    })

    if (!anything) {
      if (onToast) onToast('Enter a key first.')
      return
    }

    setIsSaving(true)
    setErrors({})

    try {
      const res = await saveConfig(payload)
      if (onConfigUpdated) onConfigUpdated(res)
      if (onToast) {
        onToast(res.ready ? 'Connected.' : 'Saved — one key still missing.')
      }
      onClose()
    } catch (err) {
      if (err.errors) {
        setErrors(err.errors)
        if (onToast) onToast('Check the highlighted field.')
      } else {
        if (onToast) onToast(err.message || 'Could not save credentials.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = async () => {
    if (isSaving) return
    setIsSaving(true)
    try {
      const res = await resetConfig()
      if (onConfigUpdated) onConfigUpdated(res)
      if (onToast) onToast('Session keys cleared.')
      setInputs({})
      setErrors({})
    } catch (err) {
      if (onToast) onToast('Could not reach the server.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <div className="modal-scrim" onClick={onClose}></div>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">
        <div className="modal-head">
          <div className="modal-heading">
            <h2 id="settingsTitle">Settings</h2>
            <p>Keys you enter here stay in server memory for this browser session only — they are never written to disk.</p>
          </div>
          <button className="icon-btn" type="button" aria-label="Close settings" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {Object.keys(credentials).length === 0 ? (
            <p className="cred-loading">Loading…</p>
          ) : (
            Object.keys(credentials).map((name) => {
              const info = credentials[name]
              const badgeText =
                info.source === 'env'
                  ? 'From server .env'
                  : info.source === 'session'
                  ? 'Set for this session'
                  : 'Not configured'
              const badgeClass = `badge badge-${info.source || 'missing'}`
              const isPassword = !revealed[name]

              return (
                <div key={name} className="cred">
                  <div className="cred-head">
                    <label className="cred-label">{info.label}</label>
                    <span className={badgeClass}>{badgeText}</span>
                  </div>

                  <p className="cred-hint">{info.hint}</p>

                  <div className="cred-field">
                    <input
                      type={isPassword ? 'password' : 'text'}
                      className="cred-input"
                      placeholder={info.configured ? '•••••••• (leave blank to keep)' : info.placeholder}
                      autoComplete="off"
                      spellCheck="false"
                      value={inputs[name] || ''}
                      onChange={(e) => handleInputChange(name, e.target.value)}
                    />
                    <button
                      className="icon-btn sm"
                      type="button"
                      title="Show / hide"
                      aria-label="Show or hide value"
                      onClick={() => toggleReveal(name)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
                      </svg>
                    </button>
                  </div>

                  {errors[name.toLowerCase()] && (
                    <p className="cred-error">{errors[name.toLowerCase()]}</p>
                  )}
                </div>
              )
            })
          )}
        </div>

        <div className="modal-foot">
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            title="Discard session keys and fall back to the server .env"
            disabled={isSaving}
            onClick={handleReset}
          >
            Use server .env
          </button>
          <button
            className={`btn btn-primary btn-sm ${isSaving ? 'is-busy' : ''}`}
            type="button"
            disabled={isSaving}
            onClick={handleSave}
          >
            <span className="btn-label">Save for this session</span>
            <span className="spinner" aria-hidden="true"></span>
          </button>
        </div>
      </div>
    </>
  )
}
