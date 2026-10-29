import React from 'react'
import { renderMarkdown } from '../utils/markdown'
import FollowupChips from './FollowupChips'

function extractDestination(text) {
  if (!text) return null
  const t = String(text)
  let m = t.match(
    /(?:to|in)\s+([A-Za-z][A-Za-z\s,&-]{2,50}?)(?=\s+from|\s+for|\s+in\s+\d|\s+with|\s+on|\s+departing|\.|,|\n|$)/i
  )
  if (!m) m = t.match(/trip\s+to\s+([A-Za-z][A-Za-z\s,&-]{2,50})/i)
  if (!m) return null
  return m[1].replace(/\b(?:like|maybe|please|just)\b/gi, '').replace(/\s+/g, ' ').trim()
}

export default function ConciergeResult({ result, onFollowup, onToast }) {
  const dest = extractDestination(result.__query) || extractDestination(result.answer)

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
