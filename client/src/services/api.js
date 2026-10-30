/**
 * API service for Roamly AI
 * Includes automatic Render cold-start detection, retry, and direct fallback.
 */

// Configurable backend URL via Vercel environment variable (VITE_API_URL)
// e.g. "https://roamly-backend.onrender.com"
const BACKEND_URL = (
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_BACKEND_URL ||
  ''
).replace(/\/+$/, '')

function getApiUrls(endpoint) {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  const urls = []

  // 1. Direct Render Backend URL (if configured in Vercel environment)
  if (BACKEND_URL) {
    urls.push(`${BACKEND_URL}${cleanEndpoint}`)
  }

  // 2. Relative path (for local Vite proxy or Vercel rewrites)
  urls.push(cleanEndpoint)

  return urls
}

async function requestWithFallback(endpoint, options = {}) {
  const urls = getApiUrls(endpoint)
  let lastError = null

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    try {
      const res = await fetch(url, {
        ...options,
        credentials: "include",
      })

      const contentType = res.headers.get("content-type") || ""
      const isJson = contentType.includes("application/json")

      if (!isJson) {
        const text = await res.text()
        // Detect Render free tier cold-start / wake up page
        if (text.includes("<!DOCTYPE") || text.includes("<html") || text.includes("Render")) {
          // If 1st try returned HTML on Vercel, try direct Render URL
          if (i === 0) continue
          const spinError = new Error(
            "The backend server is waking up from idle (Render free tier takes ~30s on cold start). Please wait a moment and try again."
          )
          spinError.isColdStart = true
          throw spinError
        }
        throw new Error(`Server returned a non-JSON response (HTTP ${res.status})`)
      }

      const data = await res.json()

      if (!res.ok || data.success === false) {
        const err = new Error(data.error || `Request failed with HTTP ${res.status}`)
        if (res.status === 428) err.isSetupRequired = true
        throw err
      }

      return data
    } catch (err) {
      lastError = err
      // If setup required, don't fallback, throw immediately
      if (err.isSetupRequired) throw err
      // If it's the last URL, throw
      if (i === urls.length - 1) throw lastError
    }
  }

  throw lastError || new Error("Failed to reach server")
}

export async function fetchConfig() {
  return requestWithFallback("/api/config", { cache: "no-store" })
}

export async function saveConfig(keys) {
  return requestWithFallback("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keys }),
  })
}

export async function resetConfig() {
  return requestWithFallback("/api/config", {
    method: "DELETE",
  })
}

export async function planTravel(message, threadId = null, destination = null) {
  return requestWithFallback("/api/travel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, thread_id: threadId, destination }),
  })
}

export async function checkHealth() {
  const urls = BACKEND_URL ? [`${BACKEND_URL}/health`, '/health'] : ['/health']
  for (const u of urls) {
    try {
      const res = await fetch(u, { cache: "no-store", credentials: "include" })
      if (res.ok) return true
    } catch (e) {
      // continue to next URL
    }
  }
  return false
}
