/**
 * Roamly AI — Client Authentication & Session Management
 * Persists registered accounts and user authentication sessions across browser visits.
 */

const AUTH_KEY = 'roamly_user_session'
const USERS_REGISTRY_KEY = 'roamly_registered_users'

/**
 * Retrieve the persistent registry of registered user accounts from localStorage.
 * @returns {Record<string, { id: string, name: string, email: string, password: string, avatar: string, registeredAt: number }>}
 */
export function getRegisteredUsers() {
  try {
    const raw = localStorage.getItem(USERS_REGISTRY_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (err) {
    console.error('Failed to parse registered users registry:', err)
    return {}
  }
}

/**
 * Persist the registry of registered user accounts.
 */
function saveRegisteredUsers(registry) {
  try {
    localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(registry))
  } catch (err) {
    console.error('Failed to save registered users registry:', err)
  }
}

export function getAuthUser() {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (err) {
    console.error('Failed to parse auth user session:', err)
    return null
  }
}

export function loginUser(email, password) {
  const cleanEmail = String(email || '').trim().toLowerCase()
  const cleanPassword = String(password || '')

  if (!cleanEmail || !cleanPassword) {
    throw new Error('Please provide both an email and password.')
  }

  const registry = getRegisteredUsers()
  const account = registry[cleanEmail]

  // Enforce account creation before allowing sign in
  if (!account) {
    throw new Error('No account found with this email. Please create an account first.')
  }

  // Validate exact password match
  if (account.password !== cleanPassword) {
    throw new Error('Incorrect password. Please try again.')
  }

  const user = {
    id: account.id,
    name: account.name,
    email: account.email,
    avatar: account.avatar || account.name.charAt(0).toUpperCase() || '👤',
    authenticatedAt: Date.now(),
    isGuest: false,
  }

  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(user))
    return user
  } catch (err) {
    console.error('Failed to save user session:', err)
    return user
  }
}

export function registerUser(name, email, password) {
  const cleanName = String(name || '').trim()
  const cleanEmail = String(email || '').trim().toLowerCase()
  const cleanPassword = String(password || '')

  if (!cleanName || !cleanEmail || !cleanPassword) {
    throw new Error('Please fill in your name, email, and password.')
  }

  if (cleanPassword.length < 6) {
    throw new Error('Password must be at least 6 characters long.')
  }

  const registry = getRegisteredUsers()

  if (registry[cleanEmail]) {
    throw new Error('An account with this email already exists. Please sign in instead.')
  }

  const account = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    name: cleanName,
    email: cleanEmail,
    password: cleanPassword,
    avatar: cleanName.charAt(0).toUpperCase() || '👤',
    registeredAt: Date.now(),
  }

  registry[cleanEmail] = account
  saveRegisteredUsers(registry)

  const sessionUser = {
    id: account.id,
    name: account.name,
    email: account.email,
    avatar: account.avatar,
    authenticatedAt: Date.now(),
    isGuest: false,
  }

  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(sessionUser))
    return sessionUser
  } catch (err) {
    console.error('Failed to save user registration session:', err)
    return sessionUser
  }
}

export function continueAsGuest(guestName = 'Guest Traveler') {
  const user = {
    id: `guest_${Date.now()}`,
    name: guestName.trim() || 'Guest Traveler',
    email: 'traveler@roamly.ai',
    avatar: '🧭',
    authenticatedAt: Date.now(),
    isGuest: true,
  }

  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(user))
    return user
  } catch (err) {
    console.error('Failed to save guest session:', err)
    return user
  }
}

export function logoutUser() {
  try {
    localStorage.removeItem(AUTH_KEY)
  } catch (err) {
    console.error('Failed to clear user session:', err)
  }
}
