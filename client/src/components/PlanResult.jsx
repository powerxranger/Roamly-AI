import React from 'react'
import { renderMarkdown } from '../utils/markdown'
import BookingShortcuts from './BookingShortcuts'
import LeafletMap from './LeafletMap'
import WeatherWidget from './WeatherWidget'
import BudgetCalculator from './BudgetCalculator'
import PackingChecklist from './PackingChecklist'
import ItineraryTimeline from './ItineraryTimeline'
import FollowupChips from './FollowupChips'

function toText(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join('\n\n')
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text
    if (typeof value.content === 'string') return value.content
    if (Array.isArray(value.content)) return toText(value.content)
    try {
      return '```json\n' + JSON.stringify(value, null, 2) + '\n```'
    } catch (e) {
      return String(value)
    }
  }
  return String(value)
}

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

function extractOrigin(text) {
  if (!text) return null
  const t = String(text)
  const m = t.match(
    /from\s+([A-Za-z][A-Za-z\s,&-]{2,30}?)(?=\s+to|\s+in|\s+for|\s+with|\s+on|\.|,|\n|$)/i
  )
  return m ? m[1].replace(/\s+/g, ' ').trim() : null
}

function extractTravellers(text) {
  if (!text) return 2
  const t = String(text)
  const m = t.match(/(\d+)\s*(?:traveller|travelers|people|person)/i)
  if (m) return parseInt(m[1], 10) || 2
  if (/for\s+two\b|couple|with\s+bae/i.test(t)) return 2
  if (/solo|alone/i.test(t)) return 1
  return 2
}

function extractSectionText(src, header) {
  if (!src) return ''
  const re = new RegExp(
    `(?:###|\\*\\*|##)\\s*${header}[\\s\\S]*?(?=(?:###|\\*\\*|##)\\s*(?:Flight|Weather|Hotel|Itinerary|Budget|Packing|Must-Visit|Travel|Practical|Day)|\\Z)`,
    'i'
  )
  const m = String(src).match(re)
  return m ? m[0] : ''
}

function plainTextOf(result) {
  const parts = [`# ${result.__query || 'Trip plan'}`, '', toText(result.answer)]
  if (result.budget_breakdown) parts.push('', toText(result.budget_breakdown))
  if (result.packing_list) parts.push('', toText(result.packing_list))
  if (result.must_visit) parts.push('', toText(result.must_visit))
  if (result.travel_essentials) parts.push('', toText(result.travel_essentials))
  return parts.join('\n')
}

export default function PlanResult({ result, onFollowup, onToast }) {
  const queryText = result.__query || ''
  const dest = extractDestination(queryText) || extractDestination(result.answer) || 'Destination'
  const origin = extractOrigin(queryText)
  const travellersCount = extractTravellers(queryText)

  const handleCopy = () => {
    const text = plainTextOf(result)
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => onToast && onToast('Plan copied to clipboard'),
        () => onToast && onToast('Could not copy')
      )
    } else {
      if (onToast) onToast('Clipboard not available')
    }
  }

  const handleDownloadMarkdown = () => {
    const blob = new Blob([plainTextOf(result)], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'roamly-plan.md'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const handlePrint = () => {
    window.print()
  }

  // Section extractions
  const flightText =
    result.flight_results || extractSectionText(result.answer, 'Flight Information')
  const hotelText =
    result.hotel_results || extractSectionText(result.answer, 'Hotel Suggestions')
  const itineraryText = result.itinerary || result.answer
  const budgetText =
    result.budget_breakdown ||
    extractSectionText(result.answer, 'Budget Breakdown') ||
    `### Budget Breakdown\n- Total Estimated Cost: ${queryText || '₹1,50,000'}`
  const packingText =
    result.packing_list ||
    extractSectionText(result.answer, 'Packing Checklist') ||
    `### Packing Checklist\n- Essentials: Passport, ID, Tickets, Credit Cards\n- Clothing: Weather-appropriate layers, comfortable walking pants\n- Footwear: Cushioned walking sneakers, hiking shoes\n- Electronics: Chargers, universal plug adapter, power bank\n- Toiletries: Sunscreen, lip balm, travel med kit`
  const exploreText =
    result.must_visit ||
    extractSectionText(result.answer, 'Must-Visit') ||
    `### Must-Visit & Local Picks\n- Top Attractions: Key sights and historic monuments\n- Hidden Gems: Local bazaars and panoramic viewpoints\n- Local Food & Drinks: Traditional delicacies and street snacks`
  const essentialsText =
    result.travel_essentials ||
    extractSectionText(result.answer, 'Travel Essentials') ||
    `### Travel Essentials\n- Visa: Check entry requirements and passport validity\n- Currency: Local currency & major card acceptance\n- Plugs: Standard travel adapter\n- Safety: Official ride-hailing apps and emergency contacts`

  // Overview Cards
  const durationMatch = queryText.match(/(\d+)\s*(?:day|days)/i) || queryText.match(/(\d+)\s*(?:night|nights)/i)
  const durationStr = durationMatch ? `${durationMatch[1]} Days` : null

  const budgetMatch = queryText.match(/(?:budget|under)\s*(?:of\s*)?([₹$€£][\d,]+|\d{3,6}\s*(?:usd|inr|eur|gbp)?)/i) || queryText.match(/(₹[\d,]+|\$[\d,]+)/)
  const budgetStr = budgetMatch ? budgetMatch[1].toUpperCase() : null

  const timingMatch = queryText.match(/(?:in|during)\s+(January|February|March|April|May|June|July|August|September|October|November|December|next month|this month)/i) || queryText.match(/departing\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i)
  const timingStr = timingMatch ? timingMatch[1] : null

  return (
    <div className="msg msg-assistant">
      <article className="card">
        {/* Head */}
        <div className="card-head">
          <div className="card-avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2a.8.8 0 0 0-.8 1.3L8 11l-2 2-2.2-.5a.6.6 0 0 0-.6 1L5 16l2.5 1.8a.6.6 0 0 0 1-.6L8 15l2-2 3.5 4a.8.8 0 0 0 1.3-.8Z" />
            </svg>
          </div>

          <div className="card-title">
            <strong>Roamly AI</strong>
            <small>Plan ready</small>
          </div>

          <div className="card-tools">
            <button className="icon-btn sm" type="button" title="Copy plan" onClick={handleCopy}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 4h10a2 2 0 0 1 2 2v10M16 8H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2Z" />
              </svg>
            </button>
            <button className="icon-btn sm" type="button" title="Download as Markdown" onClick={handleDownloadMarkdown}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
            </button>
            <button className="icon-btn sm" type="button" title="Print" onClick={handlePrint}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14h12v7H6z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="card-body">
          {/* Trip Overview Grid */}
          <div className="trip-overview">
            <div className="trip-overview-head">
              <span className="trip-overview-label">Trip Overview</span>
              <span className="trip-overview-sub">Pulled from your request</span>
            </div>
            <div className="trip-overview-grid">
              {dest && (
                <div className="trip-overview-card">
                  <div className="trip-overview-ico">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 21s-6-5.686-6-10a6 6 0 1 1 12 0c0 4.314-6 10-6 10Zm0-7a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                    </svg>
                  </div>
                  <div className="trip-overview-body">
                    <span className="trip-overview-card-label">Destination</span>
                    <span className="trip-overview-card-value">{dest}</span>
                  </div>
                </div>
              )}
              {origin && (
                <div className="trip-overview-card">
                  <div className="trip-overview-ico">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10" />
                    </svg>
                  </div>
                  <div className="trip-overview-body">
                    <span className="trip-overview-card-label">Origin</span>
                    <span className="trip-overview-card-value">{origin}</span>
                  </div>
                </div>
              )}
              {durationStr && (
                <div className="trip-overview-card">
                  <div className="trip-overview-ico">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 6v6l4 2M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Z" />
                    </svg>
                  </div>
                  <div className="trip-overview-body">
                    <span className="trip-overview-card-label">Duration</span>
                    <span className="trip-overview-card-value">{durationStr}</span>
                  </div>
                </div>
              )}
              <div className="trip-overview-card">
                <div className="trip-overview-ico">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 14v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <div className="trip-overview-body">
                  <span className="trip-overview-card-label">Travellers</span>
                  <span className="trip-overview-card-value">
                    {travellersCount} {travellersCount === 1 ? 'Traveller' : 'Travellers'}
                  </span>
                </div>
              </div>
              {budgetStr && (
                <div className="trip-overview-card">
                  <div className="trip-overview-ico">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    </svg>
                  </div>
                  <div className="trip-overview-body">
                    <span className="trip-overview-card-label">Budget</span>
                    <span className="trip-overview-card-value">{budgetStr}</span>
                  </div>
                </div>
              )}
              {timingStr && (
                <div className="trip-overview-card">
                  <div className="trip-overview-ico">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
                    </svg>
                  </div>
                  <div className="trip-overview-body">
                    <span className="trip-overview-card-label">Timing</span>
                    <span className="trip-overview-card-value">{timingStr}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Booking Shortcuts */}
          <BookingShortcuts dest={dest} origin={origin} />

          {/* Interactive Leaflet Map */}
          <LeafletMap dest={dest} />

          {/* Flight Card */}
          {flightText && (
            <div className="extra-card">
              <div className="extra-card-head">
                <div className="extra-card-ico">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2a.8.8 0 0 0-.8 1.3L8 11l-2 2-2.2-.5a.6.6 0 0 0-.6 1L5 16l2.5 1.8a.6.6 0 0 0 1-.6L8 15l2-2 3.5 4a.8.8 0 0 0 1.3-.8Z" />
                  </svg>
                </div>
                <div className="extra-card-title">
                  <strong>Flight Information & Airfare</strong>
                  <small>Airlines serving route, airports, durations & estimated airfare</small>
                </div>
              </div>
              <div className="extra-card-body">
                <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(flightText) }} />
              </div>
            </div>
          )}

          {/* Weather Widget */}
          <WeatherWidget weatherData={result.weather_results || result.answer} query={queryText} />

          {/* Hotel Card */}
          {hotelText && (
            <div className="extra-card">
              <div className="extra-card-head">
                <div className="extra-card-ico">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 21h18M3 7v14M21 7v14M6 11h4M6 15h4M14 11h4M14 15h4M9 3h6v4H9z" />
                  </svg>
                </div>
                <div className="extra-card-title">
                  <strong>Hotel Suggestions & Stays</strong>
                  <small>Top recommended accommodations, prime areas & estimated rates</small>
                </div>
              </div>
              <div className="extra-card-body">
                <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(hotelText) }} />
              </div>
            </div>
          )}

          {/* Itinerary Timeline */}
          {itineraryText && <ItineraryTimeline itineraryText={itineraryText} />}

          {/* Extra Sections (Budget, Packing, Must-Visit, Essentials) */}
          <div className="extra-sections">
            <BudgetCalculator content={budgetText} travellersCount={travellersCount} />
            <PackingChecklist content={packingText} />

            {exploreText && (
              <div className="extra-card">
                <div className="extra-card-head">
                  <div className="extra-card-ico">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 21s-6-5.686-6-10a6 6 0 1 1 12 0c0 4.314-6 10-6 10Zm0-7a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                    </svg>
                  </div>
                  <div className="extra-card-title">
                    <strong>Must-Visit & Local Picks</strong>
                    <small>Attractions, hidden gems & food</small>
                  </div>
                </div>
                <div className="extra-card-body">
                  <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(exploreText) }} />
                </div>
              </div>
            )}

            {essentialsText && (
              <div className="extra-card">
                <div className="extra-card-head">
                  <div className="extra-card-ico">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 12l2 2 4-4M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Z" />
                    </svg>
                  </div>
                  <div className="extra-card-title">
                    <strong>Travel Essentials</strong>
                    <small>Visa, currency, plugs & more</small>
                  </div>
                </div>
                <div className="extra-card-body">
                  <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(essentialsText) }} />
                </div>
              </div>
            )}
          </div>

          {/* Follow-up Chips */}
          <FollowupChips dest={dest} onSelect={onFollowup} />
        </div>
      </article>
    </div>
  )
}
