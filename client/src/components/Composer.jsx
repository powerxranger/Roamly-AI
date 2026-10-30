import React, { useRef, useEffect } from 'react'
import TripBuilder from './TripBuilder'

export default function Composer({
  input,
  setInput,
  isReady,
  busy,
  isBuilderOpen,
  setIsBuilderOpen,
  onSubmit,
  onToast
}) {
  const textareaRef = useRef(null)

  const autosize = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

  useEffect(() => {
    autosize()
  }, [input])

  const handleSubmit = (e) => {
    if (e) e.preventDefault()
    if (busy) {
      if (onToast) onToast('Plan is currently generating. Please wait until it completes.')
      return
    }
    if (!isReady || !input.trim()) return
    onSubmit()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (busy) {
        if (onToast) onToast('Plan is currently generating. Please wait until it completes.')
        return
      }
      handleSubmit()
    }
  }

  const handleApplyBuilderPrompt = (sentence) => {
    setInput(sentence)
    setIsBuilderOpen(false)
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }

  return (
    <div className={`composer-wrap ${!isReady ? 'is-locked' : ''}`}>
      <TripBuilder
        isOpen={isBuilderOpen}
        onClose={() => setIsBuilderOpen(false)}
        onApply={handleApplyBuilderPrompt}
        onToast={onToast}
      />

      <form className="composer" onSubmit={handleSubmit} autoComplete="off">
        <button
          type="button"
          className={`icon-btn composer-tool ${isBuilderOpen ? 'is-on' : ''}`}
          onClick={() => setIsBuilderOpen(!isBuilderOpen)}
          aria-label="Open trip builder"
          title="Trip builder"
          disabled={!isReady || busy}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16M4 12h10M4 18h6" />
            <circle cx="18" cy="12" r="2" />
            <circle cx="14" cy="18" r="2" />
          </svg>
        </button>

        <textarea
          ref={textareaRef}
          rows="1"
          placeholder={
            busy
              ? "Autonomous agents at work… Draft your next destination or question here"
              : "Plan a 7 day trip to Tokyo from Dhaka in April, mid-range budget…"
          }
          aria-label="Describe your trip"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!isReady}
        />

        <button
          type="submit"
          className={`btn btn-primary send-btn ${busy ? 'is-busy' : ''}`}
          disabled={!isReady || busy || !input.trim()}
          aria-label={busy ? "Plan is building..." : "Plan trip"}
          title={busy ? "Plan is building... will be ready to send once completed" : "Send prompt"}
        >
          <svg className="ico-send" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m22 2-7 20-4-9-9-4 20-7Z" />
          </svg>
          <span className="spinner" aria-hidden="true"></span>
        </button>
      </form>
    </div>
  )
}
