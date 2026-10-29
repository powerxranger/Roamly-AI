import React, { useState } from 'react'
import { renderMarkdown } from '../utils/markdown'
import BookingShortcuts from './BookingShortcuts'
import LeafletMap from './LeafletMap'
import WeatherWidget from './WeatherWidget'
import BudgetCalculator from './BudgetCalculator'
import PackingChecklist from './PackingChecklist'
import ItineraryTimeline from './ItineraryTimeline'
import FollowupChips from './FollowupChips'
import FlightComparisonCard from './FlightComparisonCard'
import HotelComparisonCard from './HotelComparisonCard'
import TripOverviewCard from './TripOverviewCard'

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

function cleanLocation(str) {
  if (!str) return ''
  let s = String(str)
    .replace(/[#*`_~]/g, '')
    .replace(/\b(?:like|maybe|please|just|want|plan|trip|vacation|getaway|explore|visit|looking for|help me|going to|travel to|freshest|dishes)\b/gi, '')
    .replace(/\b(?:airport|international|intl|aeroporto|flughafen)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  // Remove leading prepositions (e.g. "in Italy" -> "Italy")
  s = s.replace(/^(?:the|a|an|in|to|from|at|near|for|around)\s+/i, '')
  // Remove trailing prepositions and conjunctions (e.g. "Italy in" -> "Italy", "Rome for" -> "Rome")
  s = s.replace(/\s+(?:in|to|from|for|on|at|during|with|and|or|by|the|a|an)$/i, '')
  // Remove trailing and leading punctuation
  s = s.replace(/^[,.\s-]+|[,.\s-]+$/g, '')
  return s.trim()
}

function extractDestination(queryText, flightText, answerText) {
  // 1. From user query - stop strictly before prepositions like "in [month]", "from", "for"
  if (queryText) {
    const q = String(queryText).trim()
    const m = q.match(/(?:^|\s)(?:to|visit|explore|travel to)\s+([A-Za-z\s,-]{2,30}?)(?=\s+(?:in\b|during\b|from\b|for\b|with\b|on\b|departing\b|under\b|budget\b|\d|\.|\,|$))/i)
    if (m) {
      const cleaned = cleanLocation(m[1])
      if (cleaned && cleaned.length > 2 && !/destination|dishes|transit|food|airport/i.test(cleaned)) return cleaned
    }
  }

  // 2. From flight text: "Likely arrival airport: [Airport] in [City]" or "Arrival: [City]"
  if (flightText) {
    const arrMatch = String(flightText).match(/(?:likely\s+arrival\s+airport|arrival\s+airport|destination)[:\s]+([^,\n.(]+)/i)
    if (arrMatch) {
      const cleaned = cleanLocation(arrMatch[1])
      if (cleaned && cleaned.length > 2 && cleaned.length < 35 && !/destination|dishes|transit|food/i.test(cleaned)) {
        return cleaned
      }
    }
  }

  // 3. From answer/itinerary: "Trip to [Destination]"
  if (answerText) {
    const headMatch = String(answerText).match(/(?:trip\s+to|itinerary\s+for|welcome\s+to|destination:)\s+([A-Za-z\s,-]{2,35})/i)
    if (headMatch) {
      const cleaned = cleanLocation(headMatch[1])
      if (cleaned && cleaned.length > 2 && cleaned.length < 35 && !/destination|dishes|transit|food/i.test(cleaned)) {
        return cleaned
      }
    }
  }

  // Check for common destination names
  const commonDestinations = [
    "Italy", "Rome", "Milan", "Florence", "Venice", "Paris", "France", "Tokyo", "Japan",
    "London", "Barcelona", "Madrid", "Spain", "Bali", "Thailand", "Bangkok", "Dubai",
    "Switzerland", "Greece", "Santorini", "Amsterdam", "Singapore", "New York", "Almaty"
  ]
  const fullText = `${queryText} ${answerText || ''}`
  for (const c of commonDestinations) {
    if (new RegExp(`\\b${c}\\b`, 'i').test(fullText)) {
      return c
    }
  }

  return 'Your Destination'
}

function extractOrigin(queryText, flightText) {
  if (queryText) {
    const m = String(queryText).match(/(?:^|\s)from\s+([A-Za-z\s,-]{2,30}?)(?=\s+(?:to\b|in\b|for\b|with\b|on\b|departing\b|under\b|budget\b|\.|\,|$))/i)
    if (m) {
      const cleaned = cleanLocation(m[1])
      if (cleaned && cleaned.length > 2 && !/destination|airport\s+to/i.test(cleaned)) return cleaned
    }
  }

  if (flightText) {
    const depMatch = String(flightText).match(/(?:likely\s+departure\s+airport|departure\s+airport|departure\s+city|origin)[:\s]+([^,\n.(]+)/i)
    if (depMatch) {
      const cleaned = cleanLocation(depMatch[1])
      if (cleaned && cleaned.length > 2 && cleaned.length < 35 && !/destination|airport\s+to/i.test(cleaned)) {
        return cleaned
      }
    }
  }

  return 'Home / Departure City'
}

function extractDuration(queryText, itineraryText) {
  if (itineraryText) {
    const dayMatches = String(itineraryText).match(/(?:^|\n)\s*#{0,6}\s*Day\s*\d+/gi)
    if (dayMatches && dayMatches.length > 0) {
      return `${dayMatches.length} Days`
    }
  }

  if (queryText) {
    const q = String(queryText)
    const m = q.match(/(\d+)\s*(?:day|days)/i) || q.match(/(\d+)\s*(?:night|nights)/i)
    if (m) return `${m[1]} Days`
    if (/weekend/i.test(q)) return '3 Days (Weekend)'
    if (/one\s+week|1\s+week/i.test(q)) return '7 Days (1 Week)'
    if (/two\s+weeks|2\s+weeks/i.test(q)) return '14 Days (2 Weeks)'
  }

  return '5 Days'
}

function extractTravellers(queryText) {
  if (!queryText) return 2
  const t = String(queryText)
  const m = t.match(/(\d+)\s*(?:traveller|travelers|people|person|persons|adults|friends|pax)/i)
  if (m) return parseInt(m[1], 10) || 2
  if (/\b(?:solo|alone|myself|by\s+myself)\b/i.test(t)) return 1
  if (/\b(?:couple|for\s+two|partner|wife|husband|with\s+bae|honeymoon)\b/i.test(t)) return 2
  if (/\b(?:family|kids|children)\b/i.test(t)) return 4
  return 2
}

function extractBudget(queryText, budgetText, flightText) {
  if (budgetText) {
    const bMatch = String(budgetText).match(/(?:total(?:\s+estimated)?\s+cost|estimated\s+total)[:\s]*([₹$€£][\d,]+|\d{4,7}\s*(?:INR|USD|EUR|GBP|JPY))/i)
    if (bMatch) return bMatch[1].trim()
    const anyPrice = String(budgetText).match(/([₹$€£]\s*[\d,]+)/)
    if (anyPrice) return anyPrice[1].trim()
  }

  if (queryText) {
    const q = String(queryText)
    const m = q.match(/(?:budget|under|max|cost)\s*(?:of\s*)?([₹$€£][\d,]+|\d+(?:\.\d+)?\s*(?:lakh|lacs|lac|k|usd|inr|eur|gbp))/i)
    if (m) return m[1].toUpperCase().trim()
    const m2 = q.match(/([₹$€£][\d,]+)/)
    if (m2) return m2[1].trim()
  }

  if (flightText) {
    const fMatch = String(flightText).match(/estimated(?:\s+airfare)?[:\s]*([₹$€£][\d,]+(?:\s*-\s*[₹$€£]?[\d,]+)?)/i)
    if (fMatch) return `${fMatch[1]} (Flight)`
  }

  return 'Mid-Range / Flexible'
}

function extractTiming(queryText, weatherText) {
  if (queryText) {
    const q = String(queryText)
    const m = q.match(/(?:in|during|for)\s+(january|february|march|april|may|june|july|august|september|october|november|december|spring|summer|autumn|fall|winter|monsoon)/i)
    if (m) return m[1].charAt(0).toUpperCase() + m[1].slice(1)
    const mDate = q.match(/(?:departing|from|on)\s+([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)/i)
    if (mDate) return mDate[1]
    if (/next\s+month/i.test(q)) return 'Next Month'
    if (/this\s+weekend/i.test(q)) return 'Upcoming Weekend'
  }

  if (weatherText) {
    const wMatch = String(weatherText).match(/(?:best\s+time\s+to\s+visit|season|outlook)[:\s]*([^\n.]+)/i)
    if (wMatch) {
      const val = wMatch[1].replace(/[*_#]/g, '').trim()
      if (val.length < 35) return val
    }
  }

  return 'Upcoming Season'
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

  // Section extractions
  const flightText =
    result.flight_results || extractSectionText(result.answer, 'Flight Information')
  const hotelText =
    result.hotel_results || extractSectionText(result.answer, 'Hotel Suggestions')
  const itineraryText = result.itinerary || result.answer
  const budgetText =
    result.budget_breakdown || extractSectionText(result.answer, 'Budget Breakdown')
  const packingText =
    result.packing_list || extractSectionText(result.answer, 'Packing Checklist')
  const exploreText =
    result.must_visit || extractSectionText(result.answer, 'Must-Visit')
  const essentialsText =
    result.travel_essentials || extractSectionText(result.answer, 'Travel Essentials')
  const weatherText = result.weather_results || extractSectionText(result.answer, 'Weather')

  // Clean Extracted Trip Details
  const dest = extractDestination(queryText, flightText, result.answer)
  const origin = extractOrigin(queryText, flightText)
  const durationStr = extractDuration(queryText, itineraryText)
  const initialTravellers = extractTravellers(queryText)
  const budgetStr = extractBudget(queryText, budgetText, flightText)
  const timingStr = extractTiming(queryText, weatherText)

  // Interactive traveler count adjuster (updates BudgetCalculator in real time)
  const [travellersCount, setTravellersCount] = useState(initialTravellers)

  const scrollToSection = (id) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      el.classList.add('section-highlight')
      setTimeout(() => el.classList.remove('section-highlight'), 1600)
    }
  }

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
    a.download = `roamly-${dest.toLowerCase().replace(/[^a-z0-9]/g, '-')}-plan.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="msg msg-assistant">
      <article className="card glass-card">
        {/* Head */}
        <div className="card-head">
          <div className="card-avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2a.8.8 0 0 0-.8 1.3L8 11l-2 2-2.2-.5a.6.6 0 0 0-.6 1L5 16l2.5 1.8a.6.6 0 0 0 1-.6L8 15l2-2 3.5 4a.8.8 0 0 0 1.3-.8Z" />
            </svg>
          </div>

          <div className="card-title">
            <strong>Roamly AI Dossier</strong>
            <small>Autonomous trip plan for {dest}</small>
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
          {/* Executive Trip Overview Card (Rich Banner & Interactive Metric Grid) */}
          <TripOverviewCard
            dest={dest}
            origin={origin}
            durationStr={durationStr}
            travellersCount={travellersCount}
            onTravellersChange={setTravellersCount}
            budgetStr={budgetStr}
            timingStr={timingStr}
            onScrollTo={scrollToSection}
          />

          {/* Booking Shortcuts */}
          <div id="shortcuts-section">
            <BookingShortcuts dest={dest} origin={origin} />
          </div>

          {/* Interactive Leaflet Map */}
          <div id="map-section">
            <LeafletMap dest={dest} />
          </div>

          {/* Enhanced Flight Comparison Card */}
          <div id="flights-section">
            {flightText && (
              <FlightComparisonCard flightText={flightText} origin={origin} dest={dest} />
            )}
          </div>

          {/* Weather Widget */}
          <div id="weather-section">
            <WeatherWidget weatherData={weatherText || result.answer} query={queryText} />
          </div>

          {/* Enhanced Hotel Comparison Card */}
          <div id="hotels-section">
            {hotelText && (
              <HotelComparisonCard hotelText={hotelText} dest={dest} />
            )}
          </div>

          {/* Day-by-Day Interactive Itinerary Timeline */}
          <div id="itinerary-section">
            {itineraryText && <ItineraryTimeline itineraryText={itineraryText} />}
          </div>

          {/* Extra Sections (Budget Calculator, Packing Checklist Table, Must-Visit, Essentials) */}
          <div className="extra-sections">
            <div id="budget-section">
              <BudgetCalculator
                content={budgetText || result.answer}
                travellersCount={travellersCount}
              />
            </div>

            <div id="packing-section">
              <PackingChecklist content={packingText || result.answer} />
            </div>

            {exploreText && (
              <div className="extra-card glass-card">
                <div className="extra-card-head">
                  <div className="extra-card-ico">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 21s-6-5.686-6-10a6 6 0 1 1 12 0c0 4.314-6 10-6 10Zm0-7a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                    </svg>
                  </div>
                  <div className="extra-card-title">
                    <strong>Must-Visit & Local Picks</strong>
                    <small>Attractions, hidden gems & authentic dining</small>
                  </div>
                </div>
                <div className="extra-card-body">
                  <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(exploreText) }} />
                </div>
              </div>
            )}

            {essentialsText && (
              <div className="extra-card glass-card">
                <div className="extra-card-head">
                  <div className="extra-card-ico">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 12l2 2 4-4M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Z" />
                    </svg>
                  </div>
                  <div className="extra-card-title">
                    <strong>Travel Essentials</strong>
                    <small>Visa rules, local currency, SIM & plug types</small>
                  </div>
                </div>
                <div className="extra-card-body">
                  <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(essentialsText) }} />
                </div>
              </div>
            )}
          </div>

          {/* Follow-up Action Chips */}
          <FollowupChips dest={dest} onSelect={onFollowup} />
        </div>
      </article>
    </div>
  )
}
