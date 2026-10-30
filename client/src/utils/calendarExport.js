/**
 * Utility to generate standard RFC 5545 iCalendar (.ics) files from Roamly AI itineraries.
 * Compatible with Apple Calendar, Google Calendar, Microsoft Outlook, and iOS / macOS.
 */

function formatICSDate(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  )
}

function escapeICS(str) {
  if (!str) return ''
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

export function parseItineraryEvents(itineraryText, destName) {
  const source = String(itineraryText || '').trim()
  if (!source) return []

  const dayRegex = /(?:^|\n)\s*(?:#{1,6}\s*)?(day\s*\d+|day\s*[ivxlcdm]+)/gi
  const matches = []
  let match
  while ((match = dayRegex.exec(source)) !== null) {
    matches.push({ index: match.index, value: match[0] })
  }

  // Base starting date: Next Monday at 09:00 UTC
  const startDate = new Date()
  const daysUntilNextMonday = (8 - startDate.getDay()) % 7 || 7
  startDate.setDate(startDate.getDate() + daysUntilNextMonday)
  startDate.setHours(9, 0, 0, 0)

  const events = []

  if (matches.length > 0) {
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index
      const end = i + 1 < matches.length ? matches[i + 1].index : source.length
      const chunk = source.slice(start, end).trim()
      if (!chunk) continue

      const lines = chunk.split(/\r?\n/)
      const dayLabel = lines[0].replace(/^#+\s*/i, '').trim().replace(/:$/, '')
      const bodyText = lines.slice(1).join('\n').trim()

      const eventStart = new Date(startDate)
      eventStart.setDate(eventStart.getDate() + i)

      const eventEnd = new Date(eventStart)
      eventEnd.setHours(19, 0, 0, 0) // Full day itinerary

      events.push({
        summary: `${destName ? destName + ' - ' : ''}${dayLabel}`,
        description: bodyText.slice(0, 1000) || `Planned itinerary for ${dayLabel}`,
        location: destName || 'Travel Destination',
        start: eventStart,
        end: eventEnd,
      })
    }
  } else {
    // Single general trip event
    const eventEnd = new Date(startDate)
    eventEnd.setDate(eventEnd.getDate() + 3)
    events.push({
      summary: `Trip to ${destName || 'Destination'}`,
      description: source.slice(0, 1000),
      location: destName || 'Travel Destination',
      start: startDate,
      end: eventEnd,
    })
  }

  return events
}

export function generateICSContent(events, tripTitle = 'Travel Itinerary') {
  const now = formatICSDate(new Date())

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Roamly AI//Travel Itinerary Planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICS(tripTitle)}`,
  ]

  events.forEach((ev, idx) => {
    const uid = `roamly-${Date.now()}-${idx}@roamly.ai`
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${formatICSDate(ev.start)}`,
      `DTEND:${formatICSDate(ev.end)}`,
      `SUMMARY:${escapeICS(ev.summary)}`,
      `DESCRIPTION:${escapeICS(ev.description)}`,
      `LOCATION:${escapeICS(ev.location)}`,
      'STATUS:CONFIRMED',
      'TRANSP:OPAQUE',
      'END:VEVENT'
    )
  })

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export function downloadCalendarFile(itineraryText, dest, durationStr) {
  const safeDest = (dest || 'Travel').trim().replace(/[^a-zA-Z0-9\s]/g, '')
  const safeDuration = (durationStr || '').trim().replace(/[^a-zA-Z0-9\s]/g, '')
  const title = `${safeDest}${safeDuration ? ' - ' + safeDuration : ''} Itinerary`

  const events = parseItineraryEvents(itineraryText, safeDest)
  const icsData = generateICSContent(events, title)

  const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeDest.toLowerCase().replace(/\s+/g, '-')}-itinerary.ics`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
