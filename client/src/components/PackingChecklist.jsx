import React, { useState, useEffect } from 'react'
import { inline, renderMarkdown } from '../utils/markdown'

export default function PackingChecklist({ content }) {
  const text = String(content || '').trim()

  // Parse groups and items from text
  const [groups, setGroups] = useState([])
  const [checkedMap, setCheckedMap] = useState({})

  useEffect(() => {
    if (!text) {
      setGroups([])
      return
    }

    const rawGroups = text.split(/\n\s*\n/)
    const parsed = []
    let itemCounter = 0

    rawGroups.forEach((group) => {
      const lines = group
        .split(/\r?\n/)
        .map((l) => l.replace(/^#+\s*/i, '').trim())
        .filter(Boolean)

      if (lines.length === 0) return

      const heading = lines[0]
      const items = lines.slice(1).map((line) => {
        const id = `item-${itemCounter++}`
        const cleanLine = line.replace(/^[-*•]\s*/i, '').replace(/^\[\s*\]\s*/i, '')
        return { id, text: cleanLine }
      })

      if (items.length > 0) {
        parsed.push({ heading, items })
      }
    })

    setGroups(parsed)
    setCheckedMap({})
  }, [text])

  if (!text) return null

  // Calculate progress
  let totalItems = 0
  let packedCount = 0
  groups.forEach((g) => {
    g.items.forEach((it) => {
      totalItems++
      if (checkedMap[it.id]) packedCount++
    })
  })

  const pct = totalItems > 0 ? Math.round((packedCount / totalItems) * 100) : 0

  const handleToggle = (id) => {
    setCheckedMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  const handleCheckAll = () => {
    const updated = {}
    groups.forEach((g) => {
      g.items.forEach((it) => {
        updated[it.id] = true
      })
    })
    setCheckedMap(updated)
  }

  const handleReset = () => {
    setCheckedMap({})
  }

  return (
    <div className="extra-card">
      <div className="extra-card-head">
        <div className="extra-card-ico">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        </div>
        <div className="extra-card-title">
          <strong>Interactive Packing Checklist</strong>
          <small>Tick items as you pack • Live progress tracker</small>
        </div>
      </div>

      <div className="extra-card-body">
        {groups.length > 0 ? (
          <>
            <div className="packing-progress-wrap">
              <div className="packing-progress-top">
                <span className="packing-progress-label">
                  {pct === 100
                    ? `🎉 All ${totalItems} items packed! You're ready to go!`
                    : `${packedCount} / ${totalItems} items packed (${pct}%)`}
                </span>
                <div className="packing-quick-actions">
                  <button type="button" className="packing-action-btn" onClick={handleCheckAll}>
                    Check all
                  </button>
                  <button type="button" className="packing-action-btn" onClick={handleReset}>
                    Reset
                  </button>
                </div>
              </div>
              <div className="packing-progress-track">
                <div
                  className="packing-progress-fill"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: pct === 100 ? '#10b981' : '#0d9488',
                  }}
                ></div>
              </div>
            </div>

            <div className="packing-list">
              {groups.map((group, gIdx) => (
                <div key={gIdx} className="packing-group">
                  <div
                    className="packing-group-head"
                    dangerouslySetInnerHTML={{ __html: inline(group.heading) }}
                  />
                  <div className="packing-group-body">
                    {group.items.map((item) => {
                      const isChecked = !!checkedMap[item.id]
                      return (
                        <label
                          key={item.id}
                          className={`packing-item ${isChecked ? 'packed' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggle(item.id)}
                          />
                          <span dangerouslySetInnerHTML={{ __html: inline(item.text) }} />
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
        )}
      </div>
    </div>
  )
}
