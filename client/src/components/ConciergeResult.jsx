import React from 'react'
import { renderMarkdown } from '../utils/markdown'
import FollowupChips from './FollowupChips'

function isGreetingOrBanter(str) {
  if (!str) return false
  const s = String(str).toLowerCase().replace(/[?!.,;]+$/, '').trim()
  return (
    /^(?:hey+|heya|heyo|hello+|hi+|hiya+|yo+|sup|howdy|aloha|hola|bonjour|greetings?|good\s+(?:morning|afternoon|evening|day))\b/i.test(s) ||
    /\b(?:how(?:'s| is|s)?\s*(?:it|things?|you|u|life|everything)|what(?:'s|s)?\s*up|how\s+are\s+you|how\s+it\s+going|how\s+its\s+going)\b/i.test(s) ||
    /\b(?:how\s+are\s+things|how\s+are\s+you\s+doing|how\s+do\s+you\s+do)\b/i.test(s) ||
    /^(?:bro|mate|dude|buddy|friend)\b/i.test(s)
  )
}

function cleanDestName(str) {
  if (!str) return null
  let s = String(str).trim()
  if (isGreetingOrBanter(s) || /[?!@#$%*_]/.test(s)) return null
  s = s
    .replace(/\b(?:like|maybe|please|just|wanna|want|plan|trip|vacation|getaway|explore|visit|looking for|help me|going to|travel to|chaos|free time|locate me to|locate me|calm place in|calm places in|peaceful place in|quiet place in|some place in|place in|spots in|places in|away from)\b/gi, '')
    .replace(/^(?:the|a|an|in|to|from|at|near|for|around|of)\s+/i, '')
    .replace(/\s+(?:in|to|from|for|on|at|during|with|and|or|by|the|a|an)$/i, '')
    .replace(/^[,.\s-]+|[,.\s-]+$/g, '')
    .trim()
  if (
    s.length < 2 ||
    s.length > 30 ||
    /\b(?:chaos|wanna|free time|locate|how|its|it's|going|bro|hey|hello|doing|asking|what|where|why|your|destination|custom)\b/i.test(s)
  ) return null
  return s || null
}

function extractDestination(text) {
  if (!text) return null
  const t = String(text)
  if (isGreetingOrBanter(t)) {
    const majors = ["Saudi Arabia", "AlUla", "Riyadh", "Jeddah", "Abha", "Farasan Islands", "Dubai", "UAE", "Abu Dhabi", "Japan", "Tokyo", "Kyoto", "Osaka", "Bali", "Paris", "Rome", "Italy", "Switzerland", "London"]
    for (const m of majors) {
      if (new RegExp(`\\b${m}\\b`, 'i').test(t)) return m
    }
    return null
  }

  // Dedicated check for calm places in [destination]
  const mCalm = t.match(/\b(?:calm|peaceful|quiet|scenic|relaxing|hidden)\s+(?:place|places|spot|spots|retreat|retreats|getaway)\s+(?:in|around|at|of)\s+([A-Za-z\s,-]{2,30})/i)
  if (mCalm && mCalm[1]) {
    const c = cleanDestName(mCalm[1])
    if (c) return c
  }

  // Direct check for major destinations
  const majors = ["Saudi Arabia", "AlUla", "Riyadh", "Jeddah", "Abha", "Dubai", "UAE", "Abu Dhabi", "Japan", "Tokyo", "Kyoto", "Osaka", "Bali", "Paris", "Rome", "Italy", "Switzerland", "London"]
  for (const m of majors) {
    if (new RegExp(`\\b${m}\\b`, 'i').test(t)) {
      return m
    }
  }

  const mFromTo = t.match(/\bfrom\s+[A-Za-z\s,-]{2,25}?\s+to\s+([A-Za-z\s,-]{2,25})/i)
  if (mFromTo && mFromTo[1]) {
    const c = cleanDestName(mFromTo[1])
    if (c) return c
  }

  let m = t.match(
    /(?:to|in)\s+([A-Za-z][A-Za-z\s,&-]{2,35}?)(?=\s+from|\s+for|\s+in\s+\d|\s+with|\s+on|\s+departing|\.|,|\n|$)/i
  )
  if (!m) m = t.match(/trip\s+to\s+([A-Za-z][A-Za-z\s,&-]{2,35})/i)
  if (!m) return null
  return cleanDestName(m[1])
}

export default function ConciergeResult({ result, onFollowup, onToast }) {
  const isGreeting = isGreetingOrBanter(result.__query)
  const cleanExplicit = cleanDestName(result.destination)
  let dest = (cleanExplicit && !/your destination/i.test(cleanExplicit) ? cleanExplicit : null)

  if (!dest && !isGreeting) {
    dest = extractDestination(result.__query) || extractDestination(result.answer)
  }

  // If query explicitly names a known destination:
  if (!dest && result.__query) {
    const q = result.__query.toLowerCase()
    if (/\bsaudi\b|\balula\b|\briyadh\b|\bjaddah\b|\babha\b/i.test(q)) dest = 'Saudi Arabia'
    else if (/\bdubai\b|\buae\b|\babu dhabi\b/i.test(q)) dest = 'Dubai'
    else if (/\bjapan\b|\btokyo\b|\bkyoto\b|\bosaka\b/i.test(q)) dest = 'Japan'
    else if (/\bitaly\b|\brome\b|\bflorence\b|\bvenice\b/i.test(q)) dest = 'Italy'
    else if (/\bswitzerland\b|\bswiss\b|\bzurich\b/i.test(q)) dest = 'Switzerland'
  }

  const handleCopy = () => {
    const text = String(result.answer || '')
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => onToast && onToast('Copied to clipboard'),
        () => onToast && onToast('Could not copy')
      )
    }
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="msg msg-assistant">
      <article className="card concierge-card">
        <div className="card-head">
          <div className="card-avatar concierge-avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
            </svg>
          </div>

          <div className="card-title">
            <strong>Roamly Concierge</strong>
            <small>Local Insider Guide</small>
          </div>

          <div className="card-tools">
            <button className="icon-btn sm" type="button" title="Copy advice" onClick={handleCopy}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 4h10a2 2 0 0 1 2 2v10M16 8H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2Z" />
              </svg>
            </button>
            <button className="icon-btn sm" type="button" title="Print" onClick={handlePrint}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14h12v7H6z" />
              </svg>
            </button>
          </div>
        </div>

        <div className="card-body">
          <div
            className="md"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(result.answer || 'No details returned.') }}
          />

          {dest && <FollowupChips dest={dest} onSelect={onFollowup} />}
        </div>
      </article>
    </div>
  )
}
