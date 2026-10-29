/**
 * API service for Roamly AI
 * Includes automatic Render cold-start detection, retry, and direct fallback.
 */

const RENDER_DIRECT_URL = "https://roamly-ai-v6kv.onrender.com"

// When deployed on Vercel, the primary route is /api (proxied via vercel.json)
// with direct fallback to Render if Vercel's proxy returns non-JSON/HTML.
function getApiUrls(endpoint) {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  return [
    cleanEndpoint, // 1st try: same-origin or Vercel rewrite
    `${RENDER_DIRECT_URL}${cleanEndpoint}` // 2nd try: direct Render backend with CORS
  ]
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

export async function planTravel(message, threadId = null) {
  return requestWithFallback("/api/travel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, thread_id: threadId }),
  })
}

export async function checkHealth() {
  try {
    const res = await fetch("/health", { cache: "no-store", credentials: "include" })
    return res.ok
  } catch (e) {
    try {
      const res2 = await fetch(`${RENDER_DIRECT_URL}/health`, { cache: "no-store", credentials: "include" })
      return res2.ok
    } catch (e2) {
      return false
    }
  }
}
