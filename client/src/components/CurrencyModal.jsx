import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

const FX_RATES_TO_USD = {
  USD: 1.0,
  INR: 83.2,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 154.5,
  THB: 36.4,
  IDR: 15850.0,
  AED: 3.67,
  AUD: 1.52,
  CAD: 1.37,
  SGD: 1.35,
}

const SYMBOLS = {
  USD: '$',
  INR: '₹',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  THB: '฿',
  IDR: 'Rp',
  AED: 'AED ',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
}

export default function CurrencyModal({ isOpen, onClose, defaultCurrency = 'INR' }) {
  const [amount, setAmount] = useState(100)
  const [fromCurr, setFromCurr] = useState(defaultCurrency)
  const [toCurr, setToCurr] = useState('EUR')
  const [tipPct, setTipPct] = useState(10)
  const [partySize, setPartySize] = useState(2)

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

  // Currency math
  const valNum = parseFloat(amount) || 0
  const inUsd = valNum / (FX_RATES_TO_USD[fromCurr] || 1)
  const converted = inUsd * (FX_RATES_TO_USD[toCurr] || 1)

  // Tip math
  const tipAmount = (converted * tipPct) / 100
  const grandTotal = converted + tipAmount
  const perPerson = grandTotal / Math.max(1, partySize)

  const formatCurr = (n, c) => {
    const s = SYMBOLS[c] || ''
    if (c === 'JPY' || c === 'IDR') {
      return `${s}${Math.round(n).toLocaleString()}`
    }
    return `${s}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const handleSwap = () => {
    const prevFrom = fromCurr
    setFromCurr(toCurr)
    setToCurr(prevFrom)
  }

  return createPortal(
    <div className="modal-portal-wrapper">
      <div className="modal-scrim" onClick={onClose} />
      <div
        className="modal modal-fx glass-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fxTitle"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-head">
          <div className="modal-heading">
            <span className="modal-category">TRAVEL FINANCE TOOLS</span>
            <h2 id="fxTitle">Live Currency & Dining Tip Calculator</h2>
            <p className="modal-sub">
              Convert currencies instantly and calculate dining gratuities and per-person split bills.
            </p>
          </div>
          <button className="icon-btn modal-close" onClick={onClose} type="button" aria-label="Close currency modal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="modal-body fx-body">
          {/* Section 1: Instant Converter */}
          <div className="fx-converter-card">
            <div className="fx-input-row">
              <div className="fx-field">
                <label>Amount</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="fx-num-input"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>

              <div className="fx-field">
                <label>From</label>
                <select
                  className="fx-select"
                  value={fromCurr}
                  onChange={(e) => setFromCurr(e.target.value)}
                >
                  {Object.keys(FX_RATES_TO_USD).map((c) => (
                    <option key={c} value={c}>
                      {c} ({SYMBOLS[c]})
                    </option>
                  ))}
                </select>
              </div>

              <button type="button" className="fx-swap-btn" onClick={handleSwap} title="Swap currencies">
                ⇄
              </button>

              <div className="fx-field">
                <label>To</label>
                <select
                  className="fx-select"
                  value={toCurr}
                  onChange={(e) => setToCurr(e.target.value)}
                >
                  {Object.keys(FX_RATES_TO_USD).map((c) => (
                    <option key={c} value={c}>
                      {c} ({SYMBOLS[c]})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="fx-result-banner">
              <span className="fx-result-sub">{formatCurr(valNum, fromCurr)} equals</span>
              <strong className="fx-result-main">{formatCurr(converted, toCurr)}</strong>
              <small className="fx-rate-hint">
                1 {fromCurr} = {( (FX_RATES_TO_USD[toCurr] || 1) / (FX_RATES_TO_USD[fromCurr] || 1) ).toFixed(4)} {toCurr}
              </small>
            </div>
          </div>

          {/* Section 2: Dining Tip & Split Bill Calculator */}
          <div className="fx-tip-section">
            <div className="fx-tip-head">
              <strong>🍽️ Dining Tip & Split Calculator</strong>
              <small>Based on your converted bill of {formatCurr(converted, toCurr)}</small>
            </div>

            <div className="fx-tip-selector">
              <span className="fx-label">Tip Percentage:</span>
              <div className="fx-tip-buttons">
                {[0, 10, 15, 18, 20].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    className={`fx-tip-btn ${tipPct === pct ? 'active' : ''}`}
                    onClick={() => setTipPct(pct)}
                  >
                    {pct === 0 ? 'No Tip' : `${pct}%`}
                  </button>
                ))}
              </div>
            </div>

            <div className="fx-party-row">
              <span className="fx-label">Number of People:</span>
              <div className="fx-stepper">
                <button
                  type="button"
                  className="fx-stepper-btn"
                  onClick={() => setPartySize((p) => Math.max(1, p - 1))}
                >
                  −
                </button>
                <strong className="fx-stepper-val">{partySize} {partySize === 1 ? 'Person' : 'People'}</strong>
                <button
                  type="button"
                  className="fx-stepper-btn"
                  onClick={() => setPartySize((p) => Math.min(20, p + 1))}
                >
                  +
                </button>
              </div>
            </div>

            <div className="fx-summary-grid">
              <div className="fx-summary-box">
                <span>Tip Amount</span>
                <strong>{formatCurr(tipAmount, toCurr)}</strong>
              </div>
              <div className="fx-summary-box">
                <span>Total with Tip</span>
                <strong>{formatCurr(grandTotal, toCurr)}</strong>
              </div>
              <div className="fx-summary-box fx-summary-highlight">
                <span>Per Person</span>
                <strong>{formatCurr(perPerson, toCurr)}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Foot */}
        <div className="modal-foot">
          <span className="fx-foot-hint">Calculated with global spot exchange benchmarks</span>
          <button className="btn btn-primary btn-sm" type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
