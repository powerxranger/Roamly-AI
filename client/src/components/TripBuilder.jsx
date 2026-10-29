import React, { useState } from 'react'

const INTERESTS = [
  { value: 'food', label: '🍜 Food' },
  { value: 'history', label: '🏛️ History' },
  { value: 'nature', label: '🌿 Nature' },
  { value: 'nightlife', label: '🌃 Nightlife' },
  { value: 'shopping', label: '🛍️ Shopping' },
  { value: 'adventure', label: '🧗 Adventure' },
  { value: 'relaxation', label: '🧘 Relaxation' },
]

export default function TripBuilder({ isOpen, onClose, onApply, onToast }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [date, setDate] = useState('')
  const [days, setDays] = useState('')
  const [people, setPeople] = useState('')
  const [budget, setBudget] = useState('')
  const [selectedInterests, setSelectedInterests] = useState([])

  if (!isOpen) return null

  const toggleInterest = (val) => {
    setSelectedInterests((prev) =>
      prev.includes(val) ? prev.filter((i) => i !== val) : [...prev, val]
    )
  }

  const handleClear = () => {
    setFrom('')
    setTo('')
    setDate('')
    setDays('')
    setPeople('')
    setBudget('')
    setSelectedInterests([])
  }

  const handleApply = () => {
    const trimmedTo = to.trim()
    if (!trimmedTo) {
      if (onToast) onToast('Add a destination first.')
      return
    }

    const parts = ['Plan a']
    if (days.trim()) parts.push(`${days.trim()} day`)
    parts.push(`trip to ${trimmedTo}`)
    if (from.trim()) parts.push(`from ${from.trim()}`)

    if (date) {
      const d = new Date(`${date}T00:00:00`)
      if (!isNaN(d.getTime())) {
        parts.push(
          `departing ${d.toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          })}`
        )
      }
    }

    if (people.trim()) {
      parts.push(`for ${people.trim()} ${people.trim() === '1' ? 'traveller' : 'travellers'}`)
    }
    if (budget.trim()) parts.push(`with a budget of ${budget.trim()}`)
    if (selectedInterests.length > 0) parts.push(`focused on ${selectedInterests.join(', ')}`)

    const sentence = `${parts.join(' ')}. Find flights, hotels, the weather outlook and a day-by-day itinerary.`
    onApply(sentence)
  }

  return (
    <div className="builder">
      <div className="builder-grid">
        <label className="field">
          <span>From</span>
          <input
            type="text"
            placeholder="Dhaka"
            autoComplete="off"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="field">
          <span>To</span>
          <input
            type="text"
            placeholder="Tokyo"
            autoComplete="off"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Departure</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="field field-sm">
          <span>Days</span>
          <input
            type="number"
            min="1"
            max="60"
            placeholder="7"
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </label>
        <label className="field field-sm">
          <span>Travellers</span>
          <input
            type="number"
            min="1"
            max="20"
            placeholder="2"
            value={people}
            onChange={(e) => setPeople(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Budget</span>
          <input
            type="text"
            placeholder="$2000"
            autoComplete="off"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </label>
      </div>

      <div className="builder-interests">
        <span className="field-span">Interests</span>
        <div className="chips">
          {INTERESTS.map((interest) => (
            <button
              key={interest.value}
              className={`chip ${selectedInterests.includes(interest.value) ? 'on' : ''}`}
              type="button"
              onClick={() => toggleInterest(interest.value)}
            >
              {interest.label}
            </button>
          ))}
        </div>
      </div>

      <div className="builder-foot">
        <button className="btn btn-ghost btn-sm" type="button" onClick={handleClear}>
          Clear
        </button>
        <button className="btn btn-soft btn-sm" type="button" onClick={handleApply}>
          Write my prompt
        </button>
      </div>
    </div>
  )
}
