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
import TravelGuideModal from './TravelGuideModal'
import CurrencyModal from './CurrencyModal'

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
    .replace(/\b(?:like|maybe|please|just|want|wanna|plan|trip|vacation|getaway|explore|visit|looking for|help me|going to|travel to|freshest|dishes|chaos|free time|locate me to|locate me|calm place in|calm places in|peaceful place in|quiet place in|some place in|place in|spots in|places in|away from)\b/gi, '')
    .replace(/\b(?:airport|international|intl|aeroporto|flughafen)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  // Remove leading prepositions (e.g. "in Italy" -> "Italy")
  s = s.replace(/^(?:the|a|an|in|to|from|at|near|for|around|of)\s+/i, '')
  // Remove trailing prepositions and conjunctions (e.g. "Italy in" -> "Italy", "Rome for" -> "Rome")
  s = s.replace(/\s+(?:in|to|from|for|on|at|during|with|and|or|by|the|a|an)$/i, '')
  // Remove trailing and leading punctuation
  s = s.replace(/^[,.\s-]+|[,.\s-]+$/g, '')
  if (
    s.length < 2 ||
    s.length > 30 ||
    /[?!]/.test(s) ||
    /\b(?:chaos|wanna|free time|locate|how|its|it's|going|bro|hey|hello|doing|asking|what|where)\b/i.test(s)
  ) return ''
  return s.trim()
}

function extractDestination(queryText, flightText, answerText, explicitDest) {
  const q = String(queryText || '').trim()

  // First detect Origin so it can never be mistaken for Destination
  let origin = null
  const mOrigin = q.match(
    /\b(?:from|departing\s+from|departing|leaving\s+from|leaving|out\s+of|origin[:\s]+)\s+([A-Za-z\s,-]{2,25}?)(?=[.,;!?]|\s+(?:to\b|in\b|for\b|with\b|during\b|departing\b|under\b|budget\b|find\b|flights?\b|hotels?\b|weather\b|and\b|$)|$)/i
  )
  if (mOrigin) {
    const rawO = cleanLocation(mOrigin[1]).toLowerCase()
    if (rawO && !/^(?:chaos|scratch|home|now|here|me|there)$/i.test(rawO)) {
      origin = rawO
    }
  }

  // If explicit destination is provided, check that it's NOT the departure origin
  if (explicitDest && explicitDest.trim() && !/your destination|destination/i.test(explicitDest)) {
    const cleaned = cleanLocation(explicitDest)
    if (
      cleaned &&
      cleaned.length <= 35 &&
      (!origin || (cleaned.toLowerCase() !== origin && !origin.includes(cleaned.toLowerCase()) && !cleaned.toLowerCase().includes(origin))) &&
      !/\b(?:wanna|want|chaos|locate|free time|some calm|place in|how|its|going|bro|hey|hello)\b/i.test(cleaned)
    ) {
      return cleaned
    }
  }

  // 1. "from [origin] to [destination]"
  const mFromTo = q.match(/\bfrom\s+[A-Za-z\s,-]{2,25}?\s+to\s+([A-Za-z\s,-]{2,25})/i)
  if (mFromTo && mFromTo[1]) {
    const cand = cleanLocation(mFromTo[1])
    if (cand && (!origin || cand.toLowerCase() !== origin)) return cand
  }

  // 2. "[destination] (?:trip|vacation|getaway|tour|holiday|itinerary)" e.g. "5 day Paris trip" -> "Paris"
  const mTripPattern = q.match(/\b([A-Za-z\s]{2,25}?)\s+(?:trip|getaway|vacation|tour|holiday|itinerary)\b/i)
  if (mTripPattern && mTripPattern[1]) {
    const rawCand = mTripPattern[1].replace(/\b(?:want|wanna|plan|create|build|need|book|a|an|the|\d+|day|days|night|nights|beach|scenic|rail|short|long|budget|luxury|solo|family|custom)\b/gi, '').trim()
    const cand = cleanLocation(rawCand)
    if (cand && cand.length >= 2 && (!origin || (cand.toLowerCase() !== origin && !origin.includes(cand.toLowerCase()) && !cand.toLowerCase().includes(origin)))) {
      return cand
    }
  }

  // 3. "calm place in [destination]"
  const mCalm = q.match(/\b(?:calm|peaceful|quiet|scenic|relaxing|hidden)\s+(?:place|places|spot|spots|retreat|retreats|getaway)\s+(?:in|around|at|of)\s+([A-Za-z\s,-]{2,30})/i)
  if (mCalm && mCalm[1]) {
    const cand = cleanLocation(mCalm[1])
    if (cand && (!origin || cand.toLowerCase() !== origin)) return cand
  }

  // 4. "to/visit/explore/getaway to [destination]"
  const mTo = q.match(/\b(?:to|visit|explore|travel to|going to|getaway to|locate me to)\s+([A-Za-z\s,-]{2,25}?)(?=[.,;!?]|\s+(?:from|in|for|with|during|departing|under|budget|\.|\,|$)|$)/i)
  if (mTo && mTo[1]) {
    const cand = cleanLocation(mTo[1])
    if (cand && (!origin || cand.toLowerCase() !== origin) && !/\b(?:chaos|free time|some calm)\b/i.test(cand)) return cand
  }

  const commonDestinations = [
    "Saudi Arabia", "Riyadh", "Jeddah", "AlUla", "Abha", "Farasan Islands", "Dammam",
    "Japan", "Tokyo", "Kyoto", "Osaka", "Hokkaido", "Nara", "Hakone", "Hiroshima",
    "Italy", "Rome", "Milan", "Florence", "Venice", "Naples", "Amalfi",
    "France", "Paris", "Nice", "Lyon", "Bordeaux",
    "Spain", "Barcelona", "Madrid", "Seville", "Ibiza",
    "United Kingdom", "London", "Edinburgh", "Scotland",
    "Switzerland", "Zurich", "Geneva", "Lucerne", "Interlaken", "Zermatt",
    "Thailand", "Bangkok", "Phuket", "Chiang Mai",
    "Bali", "Indonesia", "Singapore", "Malaysia", "Kuala Lumpur",
    "Greece", "Santorini", "Athens", "Mykonos", "Crete",
    "Germany", "Berlin", "Munich", "Frankfurt",
    "Netherlands", "Amsterdam", "Portugal", "Lisbon", "Porto",
    "Austria", "Vienna", "Czech Republic", "Prague", "Hungary", "Budapest",
    "Turkey", "Istanbul", "Cappadocia",
    "Dubai", "UAE", "Abu Dhabi", "Qatar", "Doha", "Oman", "Muscat",
    "USA", "New York", "San Francisco", "Los Angeles", "Hawaii",
    "Australia", "Sydney", "Melbourne", "New Zealand",
    "India", "Goa", "Kerala", "Jaipur", "Rajasthan", "Ladakh", "Kashmir",
    "Maldives", "Sri Lanka", "Vietnam", "South Korea", "Seoul"
  ]

  const fullText = `${queryText || ''} ${answerText || ''} ${flightText || ''}`
  for (const c of commonDestinations) {
    if (origin && (c.toLowerCase() === origin || origin.includes(c.toLowerCase()) || c.toLowerCase().includes(origin))) {
      continue
    }
    if (new RegExp(`\\b${c}\\b`, 'i').test(fullText)) {
      return c
    }
  }

  // From flight text: "Likely arrival airport: [Airport] in [City]" or "Arrival: [City]"
  if (flightText) {
    const arrMatch = String(flightText).match(/(?:likely\s+arrival\s+airport|arrival\s+airport|destination)[:\s]+([^,\n.(]+)/i)
    if (arrMatch) {
      const cleaned = cleanLocation(arrMatch[1])
      if (cleaned && cleaned.length > 2 && cleaned.length < 35 && (!origin || cleaned.toLowerCase() !== origin) && !/destination|dishes|transit|food/i.test(cleaned)) {
        return cleaned
      }
    }
  }

  // From answer/itinerary: "Trip to [Destination]"
  if (answerText) {
    const headMatch = String(answerText).match(/(?:trip\s+to|itinerary\s+for|welcome\s+to|destination:)\s+([A-Za-z\s,-]{2,35})/i)
    if (headMatch) {
      const cleaned = cleanLocation(headMatch[1])
      if (cleaned && cleaned.length > 2 && cleaned.length < 35 && (!origin || cleaned.toLowerCase() !== origin) && !/destination|dishes|transit|food/i.test(cleaned)) {
        return cleaned
      }
    }
  }

  return 'Paris'
}

function extractOrigin(queryText, flightText) {
  if (queryText) {
    const m = String(queryText).match(
      /\b(?:from|departing\s+from|departing|leaving\s+from|leaving|out\s+of|origin[:\s]+)\s+([A-Za-z\s,-]{2,30}?)(?=[.,;!?]|\s+(?:to\b|in\b|for\b|with\b|on\b|during\b|departing\b|under\b|budget\b|find\b|flights?\b|hotels?\b|weather\b|and\b|$)|$)/i
    )
    if (m) {
      const cleaned = cleanLocation(m[1])
      if (cleaned && cleaned.length >= 2 && !/^(?:chaos|scratch|home|now|here|me|there|airport|centre|center)$/i.test(cleaned)) {
        return cleaned
      }
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
  // 1. Explicit user request duration takes primary precedence (e.g. 11 days, 7 days, 14 days)
  if (queryText) {
    const q = String(queryText)
    const m = q.match(/(\d+)\s*(?:day|days)/i) || q.match(/(\d+)\s*(?:night|nights)/i)
    if (m) return `${m[1]} Days`
    if (/weekend/i.test(q)) return '3 Days (Weekend)'
    if (/one\s+week|1\s+week/i.test(q)) return '7 Days (1 Week)'
    if (/two\s+weeks|2\s+weeks/i.test(q)) return '14 Days (2 Weeks)'
  }

  // 2. Count day sections in the generated itinerary
  if (itineraryText) {
    const dayMatches = String(itineraryText).match(/(?:^|\n)\s*#{0,6}\s*Day\s*\d+/gi)
    if (dayMatches && dayMatches.length > 0) {
      return `${dayMatches.length} Days`
    }
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
  // 1. User's explicit query budget amount & currency takes primary precedence
  // e.g. "budget of 80000 euro", "€80,000", "$5,000", "£4,500", "¥500,000", "1.5 lakh", "₹1,60,000"
  if (queryText) {
    const q = String(queryText)

    // A. Lakhs / Lacs
    const mLakh = q.match(/(?:budget|cost|under|max)?\s*(?:of\s*)?([₹$€£¥])?\s*(\d+(?:\.\d+)?)\s*(?:lakhs?|lacs?)\b/i)
    if (mLakh) {
      const sym = mLakh[1] || '₹'
      return `${sym}${mLakh[2]} Lakh`
    }

    // B. Prefix symbol e.g. €80,000, $5,000, £4,500, ¥500,000, ₹1,60,000
    const mSym = q.match(/(?:budget|cost|under|max)?\s*(?:of\s*)?([₹$€£¥])\s*([\d,]+(?:\.\d+)?)\s*(k|thousand)?/i)
    if (mSym) {
      const sym = mSym[1]
      let num = mSym[2]
      if (mSym[3] && !num.includes(',')) {
        num = (parseFloat(num.replace(/,/g, '')) * 1000).toLocaleString()
      }
      return `${sym}${num}`
    }

    // C. Number + Currency name or code e.g. "80000 euro", "80,000 EUR", "5000 usd", "4500 gbp", "500000 yen"
    const mNamed = q.match(/(?:budget|cost|under|max)?\s*(?:of\s*)?([\d,]+(?:\.\d+)?)\s*(?:k\s*)?(euro|euros|eur|gbp|pounds?|usd|dollars?|jpy|yen|inr|rupees?|rs\.?|aed|sar|aud|cad|sgd|chf)\b/i)
    if (mNamed) {
      const numRaw = mNamed[1].replace(/,/g, '')
      const curr = mNamed[2].toLowerCase()
      let sym = ''
      if (/euro|eur/i.test(curr)) sym = '€'
      else if (/gbp|pound/i.test(curr)) sym = '£'
      else if (/usd|dollar/i.test(curr)) sym = '$'
      else if (/jpy|yen/i.test(curr)) sym = '¥'
      else if (/inr|rupee|rs/i.test(curr)) sym = '₹'
      else if (/aed/i.test(curr)) sym = 'AED '
      else if (/sar/i.test(curr)) sym = 'SAR '
      else sym = curr.toUpperCase() + ' '

      const val = parseInt(numRaw, 10)
      const formattedNum = val ? val.toLocaleString() : mNamed[1]
      return `${sym}${formattedNum}`
    }
  }

  // 2. Dedicated Budget Breakdown generated by agent
  if (budgetText) {
    const bMatch = String(budgetText).match(/(?:total(?:\s+estimated)?\s+cost|estimated\s+total|total\s+budget)[:\s]*([₹$€£¥]\s*[\d,]+|\d{3,8}\s*(?:euro|euros|eur|gbp|pounds?|usd|dollars?|jpy|yen|inr|rupees?|rs\.?))/i)
    if (bMatch) return bMatch[1].trim()
    const anyPrice = String(budgetText).match(/([₹$€£¥]\s*[\d,]+)/)
    if (anyPrice) return anyPrice[1].trim()
  }

  if (flightText) {
    const fMatch = String(flightText).match(/estimated(?:\s+airfare)?[:\s]*([₹$€£¥][\d,]+(?:\s*-\s*[₹$€£¥]?[\d,]+)?)/i)
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
  const dest = extractDestination(queryText, flightText, result.answer, result.destination)
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

  const [isGuideOpen, setIsGuideOpen] = useState(false)
  const [isFxOpen, setIsFxOpen] = useState(false)

  const handlePrint = () => {
    const originalTitle = document.title
    const safeDest = (dest || 'Travel').trim().replace(/[^a-zA-Z0-9\s]/g, '')
    const safeDuration = (durationStr || '').trim().replace(/[^a-zA-Z0-9\s]/g, '')
    const autoDocTitle = `${safeDest}${safeDuration ? ' - ' + safeDuration : ''} - Roamly Travel Dossier`
    document.title = autoDocTitle
    window.print()
    setTimeout(() => {
      document.title = originalTitle
    }, 1500)
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
            <button
              className="btn btn-soft btn-sm card-tool-pill"
              type="button"
              title="Destination Culture, Emergency Contacts & Audio Phrases"
              onClick={() => setIsGuideOpen(true)}
            >
              <span className="card-tool-emoji">🌐</span>
              <span className="card-tool-text">Travel Guide</span>
            </button>

            <button
              className="btn btn-soft btn-sm card-tool-pill"
              type="button"
              title="Live Currency Converter & Dining Tip Calculator"
              onClick={() => setIsFxOpen(true)}
            >
              <span className="card-tool-emoji">💱</span>
              <span className="card-tool-text">Currency & Tips</span>
            </button>

            <button
              className="btn btn-soft btn-sm card-tool-pill"
              type="button"
              title="Jump to Smart Packing & Luggage Checklist"
              onClick={() => scrollToSection('packing-section')}
            >
              <span className="card-tool-emoji">🧳</span>
              <span className="card-tool-text">Packing</span>
            </button>

            <button className="icon-btn sm" type="button" title="Copy itinerary markdown to clipboard" onClick={handleCopy}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 4h10a2 2 0 0 1 2 2v10M16 8H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2Z" />
              </svg>
            </button>

            <button className="icon-btn sm" type="button" title="Print / Save as PDF (Auto-named)" onClick={handlePrint}>
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

      {/* Destination Culture, Emergency & Spoken Audio Guide Modal */}
      <TravelGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        dest={dest}
        onToast={onToast}
      />

      {/* Live Currency Converter & Dining Tip Calculator Modal */}
      <CurrencyModal
        isOpen={isFxOpen}
        onClose={() => setIsFxOpen(false)}
        defaultCurrency="INR"
      />
    </div>
  )
}
