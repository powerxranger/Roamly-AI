/**
 * API service for Roamly AI
 */

const API_BASE = ""; // Relative path works for both same-origin (Render) and Vercel rewrites

export async function fetchConfig() {
  const res = await fetch(`${API_BASE}/api/config`, {
    cache: "no-store",
    credentials: "include"
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function saveConfig(keys) {
  const res = await fetch(`${API_BASE}/api/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ keys })
  });
  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

export async function resetConfig() {
  const res = await fetch(`${API_BASE}/api/config`, {
    method: "DELETE",
    credentials: "include"
  });
  return res.json();
}

export async function planTravel(message, threadId = null) {
  const res = await fetch(`${API_BASE}/api/travel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ message, thread_id: threadId })
  });

  const data = await res.json().catch(() => {
    throw new Error(`Server returned a non-JSON response (HTTP ${res.status})`);
  });

  if (!res.ok || data.success === false) {
    const err = new Error(data.error || `Request failed with HTTP ${res.status}`);
    if (res.status === 428) err.isSetupRequired = true;
    throw err;
  }

  return data;
}

export async function checkHealth() {
  const res = await fetch(`${API_BASE}/health`, {
    cache: "no-store",
    credentials: "include"
  });
  return res.ok;
}
