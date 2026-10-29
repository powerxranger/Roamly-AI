import React, { useState, useEffect } from 'react'
import { renderMarkdown } from '../utils/markdown'

const RATES = {
  INR: 83.0,
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 155.0,
}

const SYMBOLS = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
}

const SEGMENTS = [
  { name: 'Flights', pct: 35, color: '#0d9488', icon: '✈️' },
  { name: 'Stay', pct: 35, color: '#0284c7', icon: '🏨' },
  { name: 'Food', pct: 18, color: '#f59e0b', icon: '🍜' },
  { name: 'Activities', pct: 12, color: '#8b5cf6', icon: '🎟️' },
]

export default function BudgetCalculator({ content, travellersCount = 2 }) {
  const text = String(content || '').trim()

  // Detect base total and currency from text
  let detectedTotal = 120000
  let detectedCurr = 'INR'

  const mLakh = text.match(/(\d+(?:\.\d+)?)\s*(?:lakh|lakhs|lac|lacs)\b/i)
  if (mLakh) {
    detectedTotal = Math.round(parseFloat(mLakh[1]) * 100000)
    detectedCurr = 'INR'
  } else {
    let mTotal = text.match(/(?:Total|Overall|Grand\s+Total)[^0-9\n]*([₹$€£])?\s*([\d,]{3,10})/i)
    if (!mTotal) {
      mTotal = text.match(/([₹$€£])\s*([\d,]{3,10})/)
    }
    if (mTotal) {
      const sym = mTotal[1]
      const numStr = mTotal[2].replace(/,/g, '')
      const val = parseInt(numStr, 10)
      if (val > 0) {
        detectedTotal = val
        if (sym === '$') detectedCurr = 'USD'
        else if (sym === '€') detectedCurr = 'EUR'
        else if (sym === '£') detectedCurr = 'GBP'
        else if (sym === '¥') detectedCurr = 'JPY'
        else detectedCurr = 'INR'
      }
    }
  }

  const baseUsd = detectedTotal / (RATES[detectedCurr] || 1)
  const [curr, setCurr] = useState(detectedCurr)
  const [people, setPeople] = useState(travellersCount > 0 ? travellersCount : 2)

  useEffect(() => {
    if (travellersCount && travellersCount > 0) {
      setPeople(travellersCount)
    }
  }, [travellersCount])

  const formatNumber = (n, c) => {
    if (c === 'INR') return n.toLocaleString('en-IN')
    return n.toLocaleString('en-US')
  }

  const convertedTotal = Math.round(baseUsd * RATES[curr])
  const perPerson = Math.round(convertedTotal / people)

  return (
    <div className="extra-card">
      <div className="extra-card-head">
        <div className="extra-card-ico">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        </div>
        <div className="extra-card-title">
          <strong>Budget Breakdown & Expense Splitter</strong>
          <small>Estimated costs, live currency conversion & per-person split</small>
        </div>
      </div>

      <div className="extra-card-body">
        <div className="budget-calc-bar">
          <div className="budget-calc-row">
            <span className="budget-calc-label">Currency</span>
            <div className="budget-currencies">
              {['INR', 'USD', 'EUR', 'GBP', 'JPY'].map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`currency-btn ${c === curr ? 'active' : ''}`}
                  onClick={() => setCurr(c)}
                >
                  {SYMBOLS[c]} {c}
                </button>
              ))}
            </div>
          </div>

          <div className="budget-calc-row">
            <span className="budget-calc-label">Split Bill</span>
            <div className="budget-split-controls">
              <button
                type="button"
                className="split-btn"
                onClick={() => setPeople((p) => Math.max(1, p - 1))}
              >
                -
              </button>
              <span className="split-count">
                {people} {people === 1 ? 'Person' : 'People'}
              </span>
              <button
                type="button"
                className="split-btn"
                onClick={() => setPeople((p) => Math.min(20, p + 1))}
              >
                +
              </button>
            </div>
          </div>

          <div className="budget-split-display">
            <span>Estimated Per Person</span>
            <span>
              {SYMBOLS[curr]} {formatNumber(perPerson, curr)} ({SYMBOLS[curr]}{' '}
              {formatNumber(convertedTotal, curr)} total)
            </span>
          </div>

          <div className="budget-dist-wrap">
            <div className="budget-dist-head">
              <span className="budget-dist-title">Estimated Expense Allocation</span>
            </div>
            <div className="budget-dist-bar">
              {SEGMENTS.map((seg) => (
                <div
                  key={seg.name}
                  className="budget-dist-seg"
                  style={{ width: `${seg.pct}%`, backgroundColor: seg.color }}
                  title={`${seg.name}: ~${seg.pct}%`}
                ></div>
              ))}
            </div>
            <div className="budget-dist-legend">
              {SEGMENTS.map((seg) => {
                const segAmt = Math.round(convertedTotal * (seg.pct / 100))
                return (
                  <div key={seg.name} className="budget-dist-legend-item">
                    <span className="budget-dist-dot" style={{ backgroundColor: seg.color }}></span>
                    <span className="budget-dist-legend-text">
                      {seg.icon} {seg.name} ({seg.pct}%):{' '}
                    </span>
                    <strong className="budget-dist-legend-val">
                      {SYMBOLS[curr]} {formatNumber(segAmt, curr)}
                    </strong>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {text ? (
          <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
        ) : (
          <div className="md">
            <div className="md-empty">
              <span>No budget breakdown available.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
