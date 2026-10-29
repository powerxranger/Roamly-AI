import React, { useState } from 'react'
import { saveConfig } from '../services/api'

function joinAnd(list) {
  if (list.length <= 1) return list[0] || ''
  return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1]
}

export default function SetupGate({ config, onConfigUpdated, onToast }) {
  const [inputs, setInputs] = useState({})
  const [revealed, setRevealed] = useState({})
  const [errors, setErrors] = useState({})
  const [isSaving, setIsSaving] = useState(false)

  const credentials = (config && config.credentials) || {}
  const missing = (config && config.missing) || []

  const labels = missing.map((name) => (credentials[name] && credentials[name].label) || name)
  const subtitle = labels.length
    ? `The server has no ${joinAnd(labels)} configured, so the agents cannot run. Add ${
        labels.length === 1 ? 'it' : 'them'
      } below to start planning.`
    : 'The server has no API keys configured, so the agents cannot run.'

  const toggleReveal = (name) => {
    setRevealed((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  const handleInputChange = (name, val) => {
    setInputs((prev) => ({ ...prev, [name]: val }))
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }))
    }
  }

  const handleConnect = async () => {
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
    } catch (err) {
      if (err.errors) {
        setErrors(err.errors)
        if (onToast) onToast('Check the highlighted field.')
      } else {
        if (onToast) onToast(err.message || 'Could not connect.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="gate">
      <span className="gate-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </svg>
      </span>

      <h2>No Live API</h2>
      <p className="gate-sub">{subtitle}</p>

      <div className="gate-creds">
        {Object.keys(credentials).map((name) => {
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
        })}
      </div>

      <div className="gate-actions">
        <button
          className={`btn btn-primary ${isSaving ? 'is-busy' : ''}`}
          type="button"
          disabled={isSaving}
          onClick={handleConnect}
        >
          <span className="btn-label">Connect</span>
          <span className="spinner" aria-hidden="true"></span>
        </button>
      </div>

      <p className="gate-foot">
        Keys entered here last for this browser session only. To configure them
        once for everyone, add them to the server&rsquo;s <code>.env</code> and restart.
      </p>
    </section>
  )
}
