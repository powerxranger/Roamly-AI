import React, { useState, useEffect } from 'react'

const DEFAULT_PACKING_CATEGORIES = [
  {
    category: '🗂️ Travel Documents & Cards',
    id: 'docs',
    items: [
      'Passport / Government ID',
      'Flight tickets & boarding passes',
      'Hotel & tour booking vouchers',
      'Forex / Credit cards & emergency cash',
      'Travel health insurance policy',
    ],
  },
  {
    category: '👕 Clothing & Weather Wear',
    id: 'clothing',
    items: [
      'Breathable casual shirts & t-shirts (4–5)',
      'Comfortable walking trousers / jeans',
      'Smart casual evening dining outfit',
      'Weather-appropriate jacket / windbreaker',
      'Comfortable undergarments & cushioned socks',
      'Sleepwear & thermal base layer',
    ],
  },
  {
    category: '👟 Footwear',
    id: 'footwear',
    items: [
      'Broken-in cushioned walking sneakers',
      'Smart evening loafers / flats',
      'Waterproof sandals / slip-ons',
    ],
  },
  {
    category: '🧴 Toiletries & Personal Health',
    id: 'toiletries',
    items: [
      'High-SPF sunscreen & hydrating lip balm',
      'Travel toothbrush, paste & dental floss',
      'Personal prescription medications',
      'First-aid kit (band-aids, pain relief, blister pads)',
      'Hand sanitizer & disinfectant wipes',
    ],
  },
  {
    category: '🔌 Electronics & Gear',
    id: 'electronics',
    items: [
      'Smartphone & high-speed charging cables',
      'Universal international travel plug adapter',
      '10,000mAh+ portable power bank',
      'Noise-canceling earphones / headphones',
    ],
  },
  {
    category: '🎒 Daypack & Essentials',
    id: 'essentials',
    items: [
      'Lightweight daypack / crossbody sling bag',
      'UV-protective sunglasses',
      'Insulated reusable water bottle',
      'Compact travel umbrella / rain poncho',
    ],
  },
]

export default function PackingChecklist({ content }) {
  const text = String(content || '').trim()

  const [categories, setCategories] = useState([])
  const [checkedMap, setCheckedMap] = useState({})
  const [activeCategory, setActiveCategory] = useState('all')
  const [customInput, setCustomInput] = useState('')
  const [copied, setCopied] = useState(false)

  // Smart parser: splits text lines and comma-separated sub-items into rich individual checklist items
  useEffect(() => {
    if (!text || text.length < 15) {
      setCategories(DEFAULT_PACKING_CATEGORIES)
      return
    }

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    const parsedGroups = []
    let currentCategory = null
    let itemIdx = 0

    lines.forEach((line) => {
      // Check if line is a category header (e.g. ### Clothing, - Essentials:, **Footwear**)
      const isHeader =
        line.startsWith('#') ||
        line.startsWith('**') ||
        /^[A-Z][a-zA-Z\s&/]+:/.test(line)

      if (isHeader) {
        let title = line
          .replace(/^[#*`_~-]+\s*/g, '')
          .replace(/:\s*$/, '')
          .trim()

        // Skip meta title "Packing Checklist"
        if (/^packing\s+checklist$/i.test(title)) return

        // If line has format: "- Essentials: Passport, ID, Tickets"
        const inlineSplit = line.split(/:\s+/)
        if (inlineSplit.length > 1 && !line.startsWith('#')) {
          const catName = inlineSplit[0].replace(/^[-*•#\s]+/, '').trim()
          const rawItems = inlineSplit.slice(1).join(': ').split(/,\s*|\band\b/i)

          const items = rawItems
            .map((it) => it.replace(/^[-*•\s]+/, '').trim())
            .filter((it) => it.length > 1)

          if (items.length > 0) {
            parsedGroups.push({
              id: `cat-${parsedGroups.length}`,
              category: catName,
              items: items.map((it) => ({ id: `item-${itemIdx++}`, text: it })),
            })
            return
          }
        }

        currentCategory = {
          id: `cat-${parsedGroups.length}`,
          category: title,
          items: [],
        }
        parsedGroups.push(currentCategory)
        return
      }

      // Checkbox or bullet items
      const cleanItem = line
        .replace(/^[-*•]\s*/, '')
        .replace(/^\[\s*\]\s*/, '')
        .trim()

      if (cleanItem) {
        // If comma-separated in bullet, split into individual items
        const subItems = cleanItem.split(/,\s*|\band\b/i)
        subItems.forEach((sub) => {
          const s = sub.trim()
          if (s.length > 1) {
            if (!currentCategory) {
              currentCategory = {
                id: `cat-${parsedGroups.length}`,
                category: '🧳 Trip Essentials',
                items: [],
              }
              parsedGroups.push(currentCategory)
            }
            currentCategory.items.push({ id: `item-${itemIdx++}`, text: s })
          }
        })
      }
    })

    // If parsing yielded good categories with 6+ items, use them; otherwise use rich defaults
    const totalFound = parsedGroups.reduce((acc, c) => acc + c.items.length, 0)
    if (parsedGroups.length > 0 && totalFound >= 6) {
      setCategories(
        parsedGroups.map((c) => ({
          ...c,
          items: c.items.map((it) => (typeof it === 'string' ? it : it.text)),
        }))
      )
    } else {
      setCategories(DEFAULT_PACKING_CATEGORIES)
    }
  }, [text])

  // Count items
  const allItems = []
  categories.forEach((cat) => {
    cat.items.forEach((it, idx) => {
      allItems.push({ catId: cat.id, id: `${cat.id}-${idx}`, text: it })
    })
  })

  const totalItems = allItems.length
  const packedCount = allItems.filter((it) => !!checkedMap[it.id]).length
  const pct = totalItems > 0 ? Math.round((packedCount / totalItems) * 100) : 0

  const handleToggle = (id) => {
    setCheckedMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  const handleCheckAll = () => {
    const updated = {}
    allItems.forEach((it) => {
      updated[it.id] = true
    })
    setCheckedMap(updated)
  }

  const handleReset = () => {
    setCheckedMap({})
  }

  const handleAddCustom = (e) => {
    e.preventDefault()
    if (!customInput.trim()) return

    const newItemText = customInput.trim()
    setCategories((prev) => {
      const copy = [...prev]
      if (copy.length === 0) {
        copy.push({ id: 'custom', category: '✨ Custom Items', items: [newItemText] })
      } else {
        copy[0].items = [newItemText, ...copy[0].items]
      }
      return copy
    })
    setCustomInput('')
  }

  const handleCopyChecklist = () => {
    const lines = ['# Trip Packing Checklist', '']
    categories.forEach((cat) => {
      lines.push(`## ${cat.category}`)
      cat.items.forEach((it, idx) => {
        const isDone = !!checkedMap[`${cat.id}-${idx}`]
        lines.push(`- [${isDone ? 'x' : ' '}] ${it}`)
      })
      lines.push('')
    })
    const textToCopy = lines.join('\n')
    if (navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }

  return (
    <div className="extra-card packing-card-enhanced glass-card">
      <div className="extra-card-head">
        <div className="extra-card-ico">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        </div>
        <div className="extra-card-title">
          <strong>Interactive Packing Checklist</strong>
          <small>Categorized essentials, custom additions & live packing progress</small>
        </div>
        <div className="extra-card-tools">
          <button
            type="button"
            className="btn btn-soft btn-sm packing-copy-btn"
            onClick={handleCopyChecklist}
            title="Copy checklist as markdown"
          >
            {copied ? '✓ Copied!' : '📋 Copy List'}
          </button>
        </div>
      </div>

      <div className="extra-card-body">
        {/* Progress Tracker Strip */}
        <div className="packing-progress-wrap">
          <div className="packing-progress-top">
            <div className="packing-progress-stat">
              <span className="packing-counter-badge">
                {packedCount} / {totalItems} Packed
              </span>
              <span className="packing-progress-label">
                {pct === 100
                  ? '🎉 100% Packed! You are ready to fly!'
                  : `${pct}% completed — keep packing!`}
              </span>
            </div>

            <div className="packing-quick-actions">
              <button type="button" className="packing-action-btn" onClick={handleCheckAll}>
                ✓ Check all
              </button>
              <button type="button" className="packing-action-btn" onClick={handleReset}>
                ↺ Reset
              </button>
            </div>
          </div>

          <div className="packing-progress-track">
            <div
              className="packing-progress-fill"
              style={{
                width: `${pct}%`,
                backgroundColor: pct === 100 ? '#10b981' : 'var(--accent)',
              }}
            ></div>
          </div>
        </div>

        {/* Category Filter Chips */}
        <div className="packing-category-tabs">
          <button
            type="button"
            className={`packing-cat-tab ${activeCategory === 'all' ? 'active' : ''}`}
            onClick={() => setActiveCategory('all')}
          >
            🌟 All ({totalItems})
          </button>
          {categories.map((cat) => {
            const catItemCount = cat.items.length
            return (
              <button
                key={cat.id}
                type="button"
                className={`packing-cat-tab ${activeCategory === cat.id ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat.id)}
              >
                {cat.category.split(' ')[0]} {cat.category.split(' ').slice(1, 3).join(' ')} ({catItemCount})
              </button>
            )
          })}
        </div>

        {/* Add Custom Item Input */}
        <form className="packing-add-form" onSubmit={handleAddCustom}>
          <input
            type="text"
            className="packing-add-input"
            placeholder="+ Add personal item (e.g. Camera lenses, passport pouch, power bank)..."
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
          />
          <button type="submit" className="btn btn-primary btn-sm packing-add-btn">
            Add
          </button>
        </form>

        {/* Categorized Checkbox Grid */}
        <div className="packing-categories-grid">
          {categories.map((cat) => {
            if (activeCategory !== 'all' && activeCategory !== cat.id) return null

            return (
              <div key={cat.id} className="packing-category-card">
                <div className="packing-category-header">
                  <strong>{cat.category}</strong>
                  <span className="packing-category-badge">{cat.items.length} items</span>
                </div>

                <div className="packing-items-list">
                  {cat.items.map((item, idx) => {
                    const itemId = `${cat.id}-${idx}`
                    const isChecked = !!checkedMap[itemId]

                    return (
                      <label
                        key={itemId}
                        className={`packing-item-row ${isChecked ? 'packed' : ''}`}
                      >
                        <input
                          type="checkbox"
                          className="packing-checkbox"
                          checked={isChecked}
                          onChange={() => handleToggle(itemId)}
                        />
                        <span className="packing-item-text">{item}</span>
                        {isChecked && <span className="packing-check-icon">✓</span>}
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
