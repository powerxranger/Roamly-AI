import React, { useState, useEffect, useMemo } from 'react'
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
  { name: 'Flights', pct: 35, color: '#6366f1', icon: '✈️' },
  { name: 'Stay', pct: 35, color: '#0284c7', icon: '🏨' },
  { name: 'Food', pct: 18, color: '#f59e0b', icon: '🍜' },
  { name: 'Activities', pct: 12, color: '#10b981', icon: '🎟️' },
]

function formatNumber(n, c) {
  if (c === 'INR') return n.toLocaleString('en-IN')
  return n.toLocaleString('en-US')
}

function formatConvertedNumber(val, curr) {
  if (val >= 1) {
    const rounded = Math.round(val)
    if (curr === 'INR') return rounded.toLocaleString('en-IN')
    return rounded.toLocaleString('en-US')
  }
  if (val > 0) return val.toFixed(2)
  return '0'
}

function getCurrencyFromToken(tok, fallback = 'INR') {
  if (!tok) return fallback
  const t = tok.trim().toLowerCase()
  if (t === '₹' || /^rs\.?$/i.test(t) || /^inr$/i.test(t) || /rupee/i.test(t) || /lakh/i.test(t)) return 'INR'
  if (t === '$' || /^usd$/i.test(t) || /dollar/i.test(t)) return 'USD'
  if (t === '€' || /^eur(?:o|os)?$/i.test(t)) return 'EUR'
  if (t === '£' || /^gbp$/i.test(t) || /pound/i.test(t)) return 'GBP'
  if (t === '¥' || /^jpy$/i.test(t) || /yen/i.test(t)) return 'JPY'
  return fallback
}

export function detectBudgetInfo(text) {
  const str = String(text || '').trim()
  let total = 120000
  let curr = 'INR'

  if (!str) return { total, currency: curr }

  // 1. Check for Lakhs / Lacs (e.g. 1.5 lakh, ₹1.5 lakh)
  const mLakh = str.match(/(\d+(?:\.\d+)?)\s*(?:lakhs?|lacs?)\b/i)
  if (mLakh) {
    return {
      total: Math.round(parseFloat(mLakh[1]) * 100000),
      currency: 'INR',
    }
  }

  // 2. Check for explicit total near Total Estimated Cost or Total:
  // e.g. "Total Estimated Cost: €80,000", "Total Estimated Cost: 80,000 euro", "Total: $5,000"
  const mTotalWithCurr = str.match(
    /(?:total(?:\s+estimated)?\s+cost|estimated\s+total|total\s+budget|grand\s+total)[:\s]*([₹$€£¥]|(?:rs\.?|inr|usd|eur|gbp|jpy)\b)?\s*([\d,]{3,10})(?:\s*(k|thousand))?\s*(euro|euros|eur|gbp|pounds?|usd|dollars?|jpy|yen|inr|rupees?|rs\.?)?/i
  )
  if (mTotalWithCurr) {
    const symPrefix = mTotalWithCurr[1]
    const numRaw = mTotalWithCurr[2].replace(/,/g, '')
    const multiplier = mTotalWithCurr[3] ? 1000 : 1
    const symSuffix = mTotalWithCurr[4]
    const val = parseInt(numRaw, 10) * multiplier
    if (val > 0) {
      total = val
      const token = symPrefix || symSuffix || ''
      curr = getCurrencyFromToken(token, 'INR')
      return { total, currency: curr }
    }
  }

  // 3. Check for any currency symbol + amount e.g. €80,000, $5,000, £4,500, ¥500,000, ₹1,60,000
  const mSym = str.match(/([₹$€£¥])\s*([\d,]{3,10})/i)
  if (mSym) {
    const val = parseInt(mSym[2].replace(/,/g, ''), 10)
    if (val > 0) {
      total = val
      curr = getCurrencyFromToken(mSym[1], 'INR')
      return { total, currency: curr }
    }
  }

  // 4. Check for amount + currency name e.g. 80000 euro, 5000 dollars, 4500 pounds
  const mSuffix = str.match(
    /([\d,]{3,10})\s*(?:k\s*)?(euro|euros|eur|gbp|pounds?|usd|dollars?|jpy|yen|inr|rupees?|rs\.?)\b/i
  )
  if (mSuffix) {
    const val = parseInt(mSuffix[1].replace(/,/g, ''), 10)
    if (val > 0) {
      total = val
      curr = getCurrencyFromToken(mSuffix[2], 'INR')
      return { total, currency: curr }
    }
  }

  return { total, currency: curr }
}

export function transformBudgetText(rawText, detectedCurr, targetCurr) {
  if (!rawText) return ''
  const baseCurr = detectedCurr || 'INR'
  const toCurr = targetCurr || 'INR'
  if (baseCurr === toCurr) return rawText

  const tokens = []
  const saveToken = (str) => {
    const id = `__ROAMLY_CURR_TOKEN_${tokens.length}__`
    tokens.push(str)
    return id
  }

  let out = String(rawText)

  // 1. Dual currency mentions e.g. (¥800 / ₹450) or ¥1,500 / ₹830 or ₹45,000 / $550
  out = out.replace(
    /(?:[([]\s*)?([₹$€£¥]|Rs\.?|INR|EUR|USD|GBP|JPY)\s*([\d,]+(?:\.\d+)?)\s*(?:\/|\s+(?:or|approx\.?|about|~)\s+)\s*([₹$€£¥]|Rs\.?|INR|EUR|USD|GBP|JPY)\s*([\d,]+(?:\.\d+)?)(?:\s*[)\]])?/gi,
    (match, sym1, num1, sym2, num2) => {
      const c1 = getCurrencyFromToken(sym1, baseCurr)
      const c2 = getCurrencyFromToken(sym2, baseCurr)
      const v1 = parseFloat(num1.replace(/,/g, ''))
      const v2 = parseFloat(num2.replace(/,/g, ''))
      let converted
      if (c1 === toCurr) converted = v1
      else if (c2 === toCurr) converted = v2
      else converted = v1 * ((RATES[toCurr] || 1) / (RATES[c1] || 1))
      return saveToken(`${SYMBOLS[toCurr]}${formatConvertedNumber(converted, toCurr)}`)
    }
  )

  // 2. Lakhs / Lacs notation: e.g. 1.5 Lakh, 2.5 Lakhs, ₹15 Lacs
  out = out.replace(
    /(?:([₹$€£¥]|Rs\.?|INR)\s*)?(\d+(?:\.\d+)?)\s*(?:lakhs?|lacs?)\b/gi,
    (match, sym, numStr) => {
      const valInInr = parseFloat(numStr) * 100000
      const ratio = (RATES[toCurr] || 1) / (RATES['INR'] || 1)
      return saveToken(`${SYMBOLS[toCurr]}${formatConvertedNumber(valInInr * ratio, toCurr)}`)
    }
  )

  // 3. Number Ranges: e.g. ₹45,000 – ₹55,000, €2,000 - €3,000, $500 - $700
  out = out.replace(
    /([₹$€£¥]|Rs\.?|INR|EUR|USD|GBP|JPY)\s*([\d,]+(?:\.\d+)?)\s*(?:–|—|-|to|\band\b)\s*([₹$€£¥]|Rs\.?|INR|EUR|USD|GBP|JPY)?\s*([\d,]+(?:\.\d+)?)/gi,
    (match, sym1, num1, sym2, num2) => {
      const src1 = getCurrencyFromToken(sym1, baseCurr)
      const src2 = sym2 ? getCurrencyFromToken(sym2, src1) : src1
      const v1 = parseFloat(num1.replace(/,/g, ''))
      const v2 = parseFloat(num2.replace(/,/g, ''))
      if (isNaN(v1) || isNaN(v2)) return match
      const c1 = v1 * ((RATES[toCurr] || 1) / (RATES[src1] || 1))
      const c2 = v2 * ((RATES[toCurr] || 1) / (RATES[src2] || 1))
      return saveToken(
        `${SYMBOLS[toCurr]}${formatConvertedNumber(c1, toCurr)} – ${SYMBOLS[toCurr]}${formatConvertedNumber(c2, toCurr)}`
      )
    }
  )

  // 4. Single amounts with currency symbol or code prefix: e.g. ₹45,000, €80,000, $500
  out = out.replace(
    /([₹$€£¥]|Rs\.?|INR|EUR|USD|GBP|JPY)\s*([\d,]+(?:\.\d+)?)/gi,
    (match, sym, numStr) => {
      const src = getCurrencyFromToken(sym, baseCurr)
      const v = parseFloat(numStr.replace(/,/g, ''))
      if (isNaN(v)) return match
      const c = v * ((RATES[toCurr] || 1) / (RATES[src] || 1))
      return saveToken(`${SYMBOLS[toCurr]}${formatConvertedNumber(c, toCurr)}`)
    }
  )

  // 5. Trailing currency notation (e.g. 45,000 INR, 80000 euro, 80,000 EUR, 45,000/-, 45000 Rs)
  out = out.replace(
    /([\d,]+(?:\.\d+)?)\s*(?:-\/|\/-\s*(?:INR)?|\b(?:INR|Rs\.?|EUR|euro|euros|GBP|pounds?|USD|dollars?|JPY|yen)\b)/gi,
    (match, numStr) => {
      const v = parseFloat(numStr.replace(/,/g, ''))
      if (isNaN(v)) return match
      const src = getCurrencyFromToken(match, baseCurr)
      const c = v * ((RATES[toCurr] || 1) / (RATES[src] || 1))
      return saveToken(`${SYMBOLS[toCurr]}${formatConvertedNumber(c, toCurr)}`)
    }
  )

  // 6. Currency labels and phrases
  out = out
    .replace(/\b(?:in\s+)?Indian\s+Rupees\s*(?:\(INR\))?/gi, `in ${toCurr} (${SYMBOLS[toCurr]})`)
    .replace(/\b(?:in\s+)?Rupees\b/gi, `in ${toCurr}`)
    .replace(/\b(?:in\s+)?Euros?\b/gi, `in ${toCurr}`)
    .replace(/\b(?:in\s+)?Pounds?\b/gi, `in ${toCurr}`)
    .replace(/\b(?:in\s+)?Dollars?\b/gi, `in ${toCurr}`)
    .replace(/\b(?:in\s+)?Yen\b/gi, `in ${toCurr}`)
    .replace(/\b(?:in\s+)?(?:INR|EUR|USD|GBP|JPY)\b/gi, `${toCurr}`)
    .replace(/\bCurrency:\s*(?:INR|USD|EUR|GBP|JPY)\b/gi, `Currency: ${toCurr}`)
    .replace(/\b(?:All\s+prices|Prices|Estimated\s+Cost|Cost)\s+in\s+[₹$€£¥]/gi, `Prices in ${SYMBOLS[toCurr]}`)
    .replace(/\([₹$€£¥]\)/g, `(${SYMBOLS[toCurr]})`)

  // 7. Restore tokens
  tokens.forEach((val, idx) => {
    out = out.replace(`__ROAMLY_CURR_TOKEN_${idx}__`, val)
  })

  return out
}

export default function BudgetCalculator({ content, travellersCount = 2 }) {
  const text = String(content || '').trim()

  const { total: detectedTotal, currency: detectedCurr } = useMemo(
    () => detectBudgetInfo(text),
    [text]
  )

  const baseUsd = detectedTotal / (RATES[detectedCurr] || 1)
  const [curr, setCurr] = useState(detectedCurr)
  const [people, setPeople] = useState(travellersCount > 0 ? travellersCount : 2)

  useEffect(() => {
    if (travellersCount && travellersCount > 0) {
      setPeople(travellersCount)
    }
  }, [travellersCount])

  useEffect(() => {
    if (detectedCurr) {
      setCurr(detectedCurr)
    }
  }, [detectedCurr])

  const convertedTotal = Math.round(baseUsd * RATES[curr])
  const perPerson = Math.round(convertedTotal / people)

  const displayedText = useMemo(() => {
    return transformBudgetText(text, detectedCurr, curr)
  }, [text, detectedCurr, curr])

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

        {displayedText ? (
          <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(displayedText) }} />
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
