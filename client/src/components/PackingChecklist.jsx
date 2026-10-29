import React, { useState, useEffect } from 'react'

const INITIAL_PACKING_ITEMS = [
  { id: 'p1', category: '🗂️ Documents', name: 'Passport & Government ID', note: 'Must have 6+ months validity remaining' },
  { id: 'p2', category: '🗂️ Documents', name: 'Flight Tickets & Hotel Bookings', note: 'Save offline PDF copies on your phone' },
  { id: 'p3', category: '🗂️ Documents', name: 'Forex / Credit Cards & Cash', note: 'Carry at least 2 cards & local cash' },
  { id: 'p4', category: '👕 Clothing', name: 'Weather-Ready Casual Outfits', note: 'Breathable tees, comfortable trousers' },
  { id: 'p5', category: '👕 Clothing', name: 'Smart Evening Outfit', note: 'For fine dining or cultural performances' },
  { id: 'p6', category: '👕 Clothing', name: 'Light Windbreaker / Jacket', note: 'For cooler evenings or air-conditioned transit' },
  { id: 'p7', category: '👟 Footwear', name: 'Cushioned Walking Sneakers', note: 'Essential for 10,000+ daily sightseeing steps' },
  { id: 'p8', category: '👟 Footwear', name: 'Casual Loafers / Evening Shoes', note: 'Smart slip-ons for dinner and strolls' },
  { id: 'p9', category: '🔌 Tech', name: 'Universal Travel Plug Adapter', note: 'Compatible with destination socket types' },
  { id: 'p10', category: '🔌 Tech', name: 'Portable Power Bank (10,000mAh)', note: 'Must be packed in carry-on bag, not checked' },
  { id: 'p11', category: '🧴 Toiletries', name: 'High-SPF Sunscreen & Lip Balm', note: 'SPF 50+ recommended for outdoor exploring' },
  { id: 'p12', category: '🧴 Toiletries', name: 'Personal First-Aid & Prescription Meds', note: 'Pain relievers, band-aids, blister pads' },
  { id: 'p13', category: '🎒 Essentials', name: 'UV-Protected Sunglasses', note: 'Essential for sunny walking tours' },
  { id: 'p14', category: '🎒 Essentials', name: 'Compact Daypack / Sling Bag', note: 'Secure front-facing bag for city strolls' },
]

export default function PackingChecklist({ content }) {
  const text = String(content || '').trim()

  const [items, setItems] = useState(INITIAL_PACKING_ITEMS)
  const [checkedMap, setCheckedMap] = useState({})
  const [activeCategory, setActiveCategory] = useState('All')
  const [newItemName, setNewItemName] = useState('')
  const [newItemCat, setNewItemCat] = useState('🎒 Essentials')
  const [copied, setCopied] = useState(false)

  // Smart item parser: extracts items from AI text if rich
  useEffect(() => {
    if (!text || text.length < 20) return

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    const extracted = []
    let currentCat = '🧳 Essentials'

    lines.forEach((line, idx) => {
      if (line.startsWith('#') || line.startsWith('**') || /^[A-Z][a-zA-Z\s]+:/.test(line)) {
        const catClean = line.replace(/^[#*`_~-]+\s*/g, '').replace(/:\s*$/, '').trim()
        if (!/packing\s+checklist/i.test(catClean)) {
          currentCat = catClean
        }
        return
      }

      const clean = line.replace(/^[-*•]\s*/, '').replace(/^\[\s*\]\s*/, '').trim()
      if (clean && clean.length > 2) {
        // Check for colon in line: "Item: Note"
        const parts = clean.split(/:\s+/)
        if (parts.length > 1) {
          extracted.push({
            id: `ai-${idx}`,
            category: currentCat,
            name: parts[0].trim(),
            note: parts.slice(1).join(': ').trim(),
          })
        } else {
          // Check for comma separated items
          const subItems = clean.split(/,\s*/)
          if (subItems.length > 1) {
            subItems.forEach((sub, sIdx) => {
              if (sub.trim().length > 1) {
                extracted.push({
                  id: `ai-${idx}-${sIdx}`,
                  category: currentCat,
                  name: sub.trim(),
                  note: 'Pack in daypack / luggage',
                })
              }
            })
          } else {
            extracted.push({
              id: `ai-${idx}`,
              category: currentCat,
              name: clean,
              note: 'Recommended for this destination',
            })
          }
        }
      }
    })

    if (extracted.length >= 8) {
      setItems(extracted)
    }
  }, [text])

  const totalCount = items.length
  const packedCount = items.filter((it) => !!checkedMap[it.id]).length
  const pct = totalCount > 0 ? Math.round((packedCount / totalCount) * 100) : 0

  const handleToggle = (id) => {
    setCheckedMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  const handleCheckAll = () => {
    const updated = {}
    items.forEach((it) => {
      updated[it.id] = true
    })
    setCheckedMap(updated)
  }

  const handleReset = () => {
    setCheckedMap({})
  }

  const handleAddCustom = (e) => {
    e.preventDefault()
    if (!newItemName.trim()) return

    const newItem = {
      id: `custom-${Date.now()}`,
      category: newItemCat,
      name: newItemName.trim(),
      note: 'Custom personal item',
    }

    setItems((prev) => [newItem, ...prev])
    setNewItemName('')
  }

  const handleCopy = () => {
    const lines = ['# Trip Packing Checklist', '']
    items.forEach((it) => {
      const isDone = !!checkedMap[it.id]
      lines.push(`- [${isDone ? 'x' : ' '}] **${it.name}** (${it.category}) — ${it.note}`)
    })
    const str = lines.join('\n')
    if (navigator.clipboard) {
      navigator.clipboard.writeText(str).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }

  // Categories list
  const categoryNames = ['All']
  items.forEach((it) => {
    const cleanCat = it.category.replace(/^[^\w\s]+\s*/, '')
    if (!categoryNames.includes(cleanCat)) categoryNames.push(cleanCat)
  })

  const filteredItems = items.filter((it) => {
    if (activeCategory === 'All') return true
    return it.category.includes(activeCategory)
  })

  return (
    <div className="extra-card packing-table-card glass-card" id="packing-section">
      {/* Head */}
      <div className="extra-card-head">
        <div className="extra-card-ico">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        </div>
        <div className="extra-card-title">
          <strong>Interactive Packing Checklist Table</strong>
          <small>Dedicated 14-item checker with categories, tips & live packing progress</small>
        </div>
        <div className="extra-card-tools">
          <button
            type="button"
            className="btn btn-soft btn-sm packing-copy-btn"
            onClick={handleCopy}
            title="Copy checklist as markdown"
          >
            {copied ? '✓ Copied' : '📋 Copy List'}
          </button>
        </div>
      </div>

      <div className="extra-card-body">
        {/* Progress Tracker Card */}
        <div className="packing-progress-panel">
          <div className="packing-progress-meta">
            <div className="packing-badge-wrap">
              <span className="packing-pill-count">
                {packedCount} / {totalCount} Items Packed
              </span>
              <span className="packing-pill-pct">
                {pct === 100 ? '🎉 All Packed & Ready!' : `${pct}% completed`}
              </span>
            </div>

            {/* Clear separate buttons with high contrast & explicit spacing */}
            <div className="packing-control-buttons">
              <button
                type="button"
                className="btn-checklist btn-checklist-check"
                onClick={handleCheckAll}
              >
                ✓ Check all
              </button>
              <button
                type="button"
                className="btn-checklist btn-checklist-reset"
                onClick={handleReset}
              >
                ↺ Reset
              </button>
            </div>
          </div>

          <div className="packing-progress-bar-bg">
            <div
              className="packing-progress-bar-fill"
              style={{
                width: `${pct}%`,
                backgroundColor: pct === 100 ? '#10b981' : 'var(--accent)',
              }}
            ></div>
          </div>
        </div>

        {/* Category Filters Strip */}
        <div className="packing-filter-strip">
          {categoryNames.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`packing-filter-btn ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat === 'All' ? `🌟 All (${totalCount})` : cat}
            </button>
          ))}
        </div>

        {/* Dedicated Packing Table */}
        <div className="packing-table-container">
          <table className="packing-table">
            <thead>
              <tr>
                <th className="th-check">Status</th>
                <th className="th-cat">Category</th>
                <th className="th-item">Essential Item</th>
                <th className="th-note">Travel Advice / Note</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((it) => {
                const isChecked = !!checkedMap[it.id]

                return (
                  <tr
                    key={it.id}
                    className={`packing-row ${isChecked ? 'row-packed' : ''}`}
                    onClick={() => handleToggle(it.id)}
                  >
                    <td className="td-check" onClick={(e) => e.stopPropagation()}>
                      <label className="checkbox-container">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggle(it.id)}
                        />
                        <span className="checkbox-mark"></span>
                      </label>
                    </td>

                    <td className="td-cat">
                      <span className="cat-badge">{it.category}</span>
                    </td>

                    <td className="td-item">
                      <strong className={`item-name ${isChecked ? 'text-done' : ''}`}>
                        {it.name}
                      </strong>
                    </td>

                    <td className="td-note">
                      <span className="item-note">{it.note}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Add Personal Item Row */}
        <form className="packing-add-row" onSubmit={handleAddCustom}>
          <input
            type="text"
            className="packing-add-text"
            placeholder="+ Add personal item (e.g., Camera lens, medicines, hiking boots)..."
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
          />

          <select
            className="packing-add-select"
            value={newItemCat}
            onChange={(e) => setNewItemCat(e.target.value)}
          >
            <option value="🗂️ Documents">🗂️ Documents</option>
            <option value="👕 Clothing">👕 Clothing</option>
            <option value="👟 Footwear">👟 Footwear</option>
            <option value="🧴 Toiletries">🧴 Toiletries</option>
            <option value="🔌 Tech">🔌 Tech</option>
            <option value="🎒 Essentials">🎒 Essentials</option>
          </select>

          <button type="submit" className="btn btn-primary btn-sm packing-add-submit">
            + Add to List
          </button>
        </form>
      </div>
    </div>
  )
}
