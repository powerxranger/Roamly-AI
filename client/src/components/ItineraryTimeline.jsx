import React, { useState } from 'react'
import { inline, renderMarkdown } from '../utils/markdown'

export default function ItineraryTimeline({ itineraryText }) {
  const source = String(itineraryText || '').trim()
  if (!source) return null

  const dayRegex = /(?:^|\n)\s*(?:#{1,6}\s*)?(day\s*\d+|day\s*[ivxlcdm]+)/gi
  const matches = []
  let match
  while ((match = dayRegex.exec(source)) !== null) {
    matches.push({ index: match.index, value: match[0] })
  }

  if (matches.length < 2) return null

  const daysData = []
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index
    const end = i + 1 < matches.length ? matches[i + 1].index : source.length
    const chunk = source.slice(start, end).trim()
    if (!chunk) continue

    const lines = chunk.split(/\r?\n/)
    const dayLabel = lines[0].replace(/^#+\s*/i, '').trim().replace(/:$/, '')
    const bodyText = lines.slice(1).join('\n').trim()

    const sections = [
      { key: 'morning', title: 'Morning', icon: '☀️' },
      { key: 'afternoon', title: 'Afternoon', icon: '🌤️' },
      { key: 'evening', title: 'Evening', icon: '🌆' },
      { key: 'night', title: 'Night', icon: '🌙' },
    ]

    const blocks = []
    sections.forEach((sec) => {
      const re = new RegExp(
        `(?:^|\\n)\\s*(?:#{0,6}\\s*)?(${sec.key})\\s*:?-?\\s*([\\s\\S]*?)(?=\\n\\s*(?:#{0,6}\\s*)?(?:morning|afternoon|evening|night)\\s*:|\\n\\s*(?:#{1,6}\\s*)?(?:day\\s*\\d+|day\\s*[ivxlcdm]+)|$)`,
        'i'
      )
      const m = re.exec(bodyText)
      if (m && m[2]) {
        const t = m[2].replace(/\n{3,}/g, '\n\n').trim()
        if (t) blocks.push({ title: `${sec.icon} ${sec.title}`, text: t })
      }
    })

    if (blocks.length === 0 && bodyText) {
      blocks.push({
        title: '📍 Daily Schedule & Highlights',
        text: bodyText.replace(/^\s*[-*]\s*/gm, '- ').trim(),
      })
    }

    const mDayNum = dayLabel.match(/Day\s*\d+/i)
    const shortDay = mDayNum ? mDayNum[0] : `Day ${i + 1}`

    daysData.push({
      idx: i,
      dayLabel,
      shortDay,
      blocks,
    })
  }

  const [activeFilter, setActiveFilter] = useState('all')
  const [bookmarkedDays, setBookmarkedDays] = useState({})
  const [collapsedDays, setCollapsedDays] = useState({})

  const toggleBookmark = (e, idx) => {
    e.stopPropagation()
    setBookmarkedDays((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }))
  }

  const toggleCollapse = (idx) => {
    setCollapsedDays((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }))
  }

  const toggleAllCollapse = () => {
    const anyExpanded = daysData.some((d) => !collapsedDays[d.idx])
    if (anyExpanded) {
      const allCollapsed = {}
      daysData.forEach((d) => { allCollapsed[d.idx] = true })
      setCollapsedDays(allCollapsed)
    } else {
      setCollapsedDays({})
    }
  }

  const isAnyExpanded = daysData.some((d) => !collapsedDays[d.idx])

  return (
    <div className="itinerary-timeline-wrap">
      <div className="itinerary-timeline-head">
        <div className="itinerary-timeline-title">
          <strong>Day by Day Timeline</strong>
          <small>Interactive daily breakdown • Click headers to expand or collapse</small>
        </div>
        <div className="itinerary-head-actions">
          <button
            type="button"
            className="btn btn-soft btn-sm itinerary-expand-btn"
            onClick={toggleAllCollapse}
          >
            {isAnyExpanded ? 'Collapse All' : 'Expand All'}
          </button>
        </div>
      </div>

      <div className="itinerary-day-filter-strip">
        <button
          type="button"
          className={`day-filter-btn ${activeFilter === 'all' ? 'active' : ''}`}
          onClick={() => setActiveFilter('all')}
        >
          🌟 All Days ({daysData.length})
        </button>
        {daysData.map((d) => (
          <button
            key={d.idx}
            type="button"
            className={`day-filter-btn ${activeFilter === d.idx ? 'active' : ''}`}
            onClick={() => setActiveFilter(d.idx)}
          >
            {d.shortDay}
            {bookmarkedDays[d.idx] && ' ⭐'}
          </button>
        ))}
      </div>

      <div className="itinerary-timeline-list">
        {daysData.map((d) => {
          if (activeFilter !== 'all' && activeFilter !== d.idx) return null
          const isSaved = !!bookmarkedDays[d.idx]
          const isCollapsed = !!collapsedDays[d.idx]

          return (
            <div key={d.idx} className="itinerary-timeline-item">
              <div className="itinerary-timeline-dot">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
                </svg>
              </div>

              <article className={`itinerary-timeline-card ${isSaved ? 'saved-day' : ''} ${isCollapsed ? 'is-collapsed' : ''}`}>
                <div
                  className="itinerary-timeline-card-head"
                  onClick={() => toggleCollapse(d.idx)}
                  role="button"
                  tabIndex={0}
                  title="Click to expand or collapse this day"
                >
                  <div className="itinerary-timeline-day">
                    <span
                      className="itinerary-timeline-day-label"
                      dangerouslySetInnerHTML={{ __html: inline(d.dayLabel) }}
                    />
                    <span className="itinerary-timeline-day-title">Itinerary</span>
                    <span className="itinerary-timeline-day-sub">
                      {d.blocks.length} scheduled {d.blocks.length === 1 ? 'part' : 'parts'} • Click to {isCollapsed ? 'expand' : 'collapse'}
                    </span>
                  </div>

                  <div className="itinerary-card-actions">
                    <button
                      type="button"
                      className={`day-bookmark-btn ${isSaved ? 'bookmarked' : ''}`}
                      title={isSaved ? 'Saved as favorite day' : 'Save as favorite day'}
                      onClick={(e) => toggleBookmark(e, d.idx)}
                    >
                      {isSaved ? '⭐' : '☆'}
                    </button>
                    <span className="day-chevron">{isCollapsed ? '▼' : '▲'}</span>
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="itinerary-timeline-card-body">
                    {d.blocks.map((b, bIdx) => (
                      <div key={bIdx} className="itinerary-timeline-block">
                        <div className="itinerary-timeline-block-head">
                          <span className="itinerary-timeline-block-dot"></span>
                          <span className="itinerary-timeline-block-title">{b.title}</span>
                        </div>
                        <div
                          className="itinerary-timeline-block-text"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(b.text) }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </div>
          )
        })}
      </div>
    </div>
  )
}
