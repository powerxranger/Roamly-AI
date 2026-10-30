/**
 * Roamly AI — Local Trip History Storage
 * Persists planned itineraries in browser localStorage, strictly isolated
 * per authenticated user account or guest session.
 */
import { getAuthUser } from './auth'

const MAX_HISTORY_ITEMS = 25

export function getUserHistoryKey(user) {
  const active = user !== undefined ? user : getAuthUser()
  if (!active || active.isGuest) {
    return 'roamly_trip_history_guest'
  }
  const id = String(active.email || active.id || 'default').toLowerCase().trim()
  return `roamly_trip_history_${id.replace(/[^a-z0-9_.-]/g, '_')}`
}

export function getTripHistory(user) {
  try {
    const key = getUserHistoryKey(user)
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.error('Failed to read trip history from localStorage:', err)
    return []
  }
}

export function saveTripToHistory(dest, origin, duration, query, data, user) {
  if (!data) return null

  try {
    const key = getUserHistoryKey(user)
    const history = getTripHistory(user)
    const cleanDest = (dest || 'Custom Trip').trim()
    const cleanOrigin = (origin || '').trim()
    const cleanDuration = (duration || '').trim()

    // Deduplicate if a trip with identical query or dest was saved within last 5 minutes
    const now = Date.now()
    const existingIdx = history.findIndex(
      (item) =>
        item.query === query ||
        (item.dest === cleanDest && Math.abs(now - item.date) < 5 * 60 * 1000)
    )

    const newTrip = {
      id: `trip_${now}_${Math.random().toString(36).substr(2, 6)}`,
      dest: cleanDest,
      origin: cleanOrigin,
      duration: cleanDuration,
      query: query || `Trip to ${cleanDest}`,
      date: now,
      data,
    }

    let updated
    if (existingIdx !== -1) {
      history.splice(existingIdx, 1)
      updated = [newTrip, ...history]
    } else {
      updated = [newTrip, ...history].slice(0, MAX_HISTORY_ITEMS)
    }

    localStorage.setItem(key, JSON.stringify(updated))
    return newTrip
  } catch (err) {
    console.error('Failed to save trip to localStorage:', err)
    return null
  }
}

export function deleteTripFromHistory(id, user) {
  try {
    const key = getUserHistoryKey(user)
    const history = getTripHistory(user)
    const filtered = history.filter((item) => item.id !== id)
    localStorage.setItem(key, JSON.stringify(filtered))
    return filtered
  } catch (err) {
    console.error('Failed to delete trip from localStorage:', err)
    return getTripHistory(user)
  }
}

export function clearTripHistory(user) {
  try {
    const key = getUserHistoryKey(user)
    localStorage.removeItem(key)
    return []
  } catch (err) {
    console.error('Failed to clear trip history:', err)
    return []
  }
}

export function clearGuestTripHistory() {
  try {
    localStorage.removeItem('roamly_trip_history_guest')
    localStorage.removeItem('roamly_trip_history')
  } catch (err) {
    console.error('Failed to clear guest trip history:', err)
  }
}
