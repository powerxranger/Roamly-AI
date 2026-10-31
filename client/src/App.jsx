import React, { useState, useEffect, useRef } from 'react'
import Header from './components/Header'
import Hero from './components/Hero'
import SetupGate from './components/SetupGate'
import Composer from './components/Composer'
import AgentPipeline from './components/AgentPipeline'
import PlanResult from './components/PlanResult'
import ConciergeResult from './components/ConciergeResult'
import ErrorMessage from './components/ErrorMessage'
import SettingsModal from './components/SettingsModal'
import PreferencesModal from './components/PreferencesModal'
import TripHistoryModal from './components/TripHistoryModal'
import AuthModal from './components/AuthModal'
import Toast from './components/Toast'
import { fetchConfig, planTravel } from './services/api'
import { getAuthUser } from './utils/auth'
import { getTripHistory, saveTripToHistory, clearGuestTripHistory } from './utils/historyStorage'

const THEME_KEY = 'roamly.theme'
const ACCENT_KEY = 'roamly.accent'
const CURRENCY_KEY = 'roamly.currency'
const PACE_KEY = 'roamly.pace'

export default function App() {
  // Theme state
  const [theme, setTheme] = useState(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY)
      if (stored) return stored
    } catch (e) {}
    const prefersLight =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
    return prefersLight ? 'light' : 'dark'
  })

  // Accent theme color (World-class Electric Iris by default)
  const [themeColor, setThemeColor] = useState(() => {
    try {
      const stored = localStorage.getItem(ACCENT_KEY)
      if (stored) return stored
    } catch (e) {}
    return 'iris'
  })

  // User preferences: currency & trip pace
  const [currency, setCurrency] = useState(() => {
    try {
      const stored = localStorage.getItem(CURRENCY_KEY)
      if (stored) return stored
    } catch (e) {}
    return 'INR'
  })

  const [pace, setPace] = useState(() => {
    try {
      const stored = localStorage.getItem(PACE_KEY)
      if (stored) return stored
    } catch (e) {}
    return 'balanced'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch (e) {}
  }, [theme])

  useEffect(() => {
    document.documentElement.setAttribute('data-accent', themeColor)
    try {
      localStorage.setItem(ACCENT_KEY, themeColor)
    } catch (e) {}
  }, [themeColor])

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  // Config & API status
  const [config, setConfig] = useState(null)
  const [apiStatus, setApiStatus] = useState('checking') // 'checking' | 'ok' | 'setup' | 'down'

  const refreshConfig = async () => {
    try {
      const data = await fetchConfig()
      setConfig(data)
      if (data && data.ready) {
        setApiStatus('ok')
      } else {
        setApiStatus('setup')
      }
    } catch (err) {
      setConfig(null)
      setApiStatus('down')
    }
  }

  useEffect(() => {
    refreshConfig()
    const interval = setInterval(refreshConfig, 60000)
    return () => clearInterval(interval)
  }, [])

  const isReady = !!(config && config.ready)

  // Conversation state
  const [messages, setMessages] = useState([])
  const [threadId, setThreadId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState('')
  const [isBuilderOpen, setIsBuilderOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false)

  // User Authentication State
  const [user, setUser] = useState(() => getAuthUser())
  const [isAuthOpen, setIsAuthOpen] = useState(false)

  // Local Trip History State (Scoped to current authenticated user or guest)
  const [tripHistory, setTripHistory] = useState(() => getTripHistory(getAuthUser()))
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)

  const handleAuthSuccess = (authenticatedUser) => {
    const prevUser = user
    const isDifferentAccount =
      !prevUser ||
      prevUser.isGuest !== authenticatedUser.isGuest ||
      (prevUser.email && authenticatedUser.email && prevUser.email.toLowerCase() !== authenticatedUser.email.toLowerCase()) ||
      prevUser.id !== authenticatedUser.id

    if (isDifferentAccount) {
      // 1. Remove previous plan from screen (reset conversation & thread)
      setMessages([])
      setThreadId(null)
      setInput('')
      setIsBuilderOpen(false)

      // 2. If previous session was guest and is now logging into an account, wipe guest history
      if (prevUser && prevUser.isGuest) {
        clearGuestTripHistory()
      }

      // 3. Load isolated history for the newly authenticated account
      const newUserHistory = getTripHistory(authenticatedUser)
      setTripHistory(newUserHistory)
    }

    setUser(authenticatedUser)
    setIsAuthOpen(false)
  }

  const handleLogout = () => {
    // When logging out, clear previous active plan and reset history
    setMessages([])
    setThreadId(null)
    setInput('')
    setIsBuilderOpen(false)
    setUser(null)
    setTripHistory([])
    setIsAuthOpen(false)
  }

  // Toast state
  const [toastMessage, setToastMessage] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const toastTimerRef = useRef(null)

  const showToast = (msg) => {
    setToastMessage(msg)
    setToastVisible(true)
    clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => {
      setToastVisible(false)
    }, 2800)
  }

  // Auto scroll conversation
  const conversationRef = useRef(null)
  const lastMessageRef = useRef(null)
  const prevMessagesCountRef = useRef(messages.length)

  const scrollToBottom = (smooth = false) => {
    requestAnimationFrame(() => {
      if (conversationRef.current) {
        conversationRef.current.scrollTo({
          top: conversationRef.current.scrollHeight,
          behavior: smooth ? 'smooth' : 'auto',
        })
      }
    })
  }

  useEffect(() => {
    if (messages.length === 0) {
      prevMessagesCountRef.current = 0
      return
    }

    if (messages.length > prevMessagesCountRef.current) {
      const lastMsg = messages[messages.length - 1]
      if (lastMsg.type === 'user') {
        // Show user query and active pipeline immediately
        scrollToBottom(false)
      } else if (lastMsg.type === 'assistant') {
        // Bring the top of the newly generated plan into view smoothly
        requestAnimationFrame(() => {
          if (lastMessageRef.current) {
            lastMessageRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        })
      }
    }
    prevMessagesCountRef.current = messages.length
  }, [messages])

  // Handlers
  const handleNewTrip = () => {
    if (busy) {
      showToast('Wait for the current plan to finish.')
      return
    }
    setIsHistoryOpen(false)
    setIsAuthOpen(false)
    setIsPreferencesOpen(false)
    setIsSettingsOpen(false)
    setThreadId(null)
    setMessages([])
    setInput('')
    setIsBuilderOpen(false)
  }

  const handleLoadTrip = (trip) => {
    if (busy) {
      showToast('Wait for the current plan to finish.')
      return
    }
    setIsHistoryOpen(false)
    setIsAuthOpen(false)
    setIsPreferencesOpen(false)
    setIsSettingsOpen(false)
    setThreadId(trip.data && trip.data.thread_id ? trip.data.thread_id : null)
    setMessages([
      { type: 'user', text: trip.query || `Trip to ${trip.dest}` },
      { type: 'assistant', data: trip.data },
    ])
    setInput('')
    setIsBuilderOpen(false)
    showToast(`Loaded ${trip.dest || 'trip'} from history`)
  }

  const handleSend = async (customPrompt) => {
    if (busy) return

    // Ensure all modals are closed when starting planning
    setIsHistoryOpen(false)
    setIsPreferencesOpen(false)
    setIsSettingsOpen(false)

    // Requirement 5: User authentication check
    if (!user) {
      setIsAuthOpen(true)
      showToast('Please sign in or continue as guest to start planning.')
      return
    }
    setIsAuthOpen(false)

    const messageText = String(customPrompt !== undefined ? customPrompt : input).trim()
    if (!messageText) return

    if (!isReady) {
      showToast('No live API — add your keys first.')
      return
    }

    // Resolve active destination from previous messages if available
    let activeDest = null
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg && msg.data && msg.data.destination && !/your destination/i.test(msg.data.destination)) {
        activeDest = msg.data.destination
        break
      }
    }

    setInput('')
    setMessages((prev) => [...prev, { type: 'user', text: messageText }])
    setBusy(true)

    try {
      const data = await planTravel(messageText, threadId, activeDest)
      data.__query = messageText
      if (data.thread_id) {
        setThreadId(data.thread_id)
      }

      setMessages((prev) => [...prev, { type: 'assistant', data }])

      // Auto-archive completed itinerary to localStorage history
      if (!data.is_followup) {
        let dest = data.destination || ''
        if (!dest || /your destination/i.test(dest) || dest.length > 30 || /\b(?:chaos|wanna|free time|locate)\b/i.test(dest)) {
          const mCalm = messageText.match(/\b(?:calm|peaceful|quiet|scenic|relaxing|hidden)\s+(?:place|places|spot|spots|retreat)\s+(?:in|around|at|of)\s+([A-Za-z\s,-]{2,30})/i)
          if (mCalm && mCalm[1]) dest = mCalm[1].trim()
        }
        if (!dest || /your destination/i.test(dest) || dest.length > 30 || /\b(?:chaos|wanna|free time|locate)\b/i.test(dest)) {
          const mFromTo = messageText.match(/\bfrom\s+[A-Za-z\s,-]{2,25}?\s+to\s+([A-Za-z\s,-]{2,25})/i)
          if (mFromTo && mFromTo[1]) dest = mFromTo[1].trim()
        }
        if (!dest || /your destination/i.test(dest) || dest.length > 30 || /\b(?:chaos|wanna|free time|locate)\b/i.test(dest)) {
          const mDestFrom = messageText.match(/\b([A-Za-z\s,-]{2,25}?)\s+(?:trip|getaway|vacation)\s+from\b/i)
          if (mDestFrom && mDestFrom[1]) dest = mDestFrom[1].replace(/^(?:plan|create|a|an|the|\d+|day|days)\s+/i, '').trim()
        }
        if (!dest || /your destination/i.test(dest) || dest.length > 30 || /\b(?:chaos|wanna|free time|locate)\b/i.test(dest)) {
          const qm = messageText.match(/(?:(?:plan|create)\s+(?:a\s+)?(?:\d+\s*(?:day|days|night|nights)\s+)?)?([A-Za-z\s]{2,25})\s+trip\b/i)
          if (qm && qm[1]) dest = qm[1].trim()
        }
        if (!dest || /your destination/i.test(dest) || dest.length > 30 || /\b(?:chaos|wanna|free time|locate)\b/i.test(dest)) {
          const qm = messageText.match(/(?:to|visit|explore|travel to)\s+([A-Za-z\s,-]{2,30}?)(?=\s+(?:in\b|during\b|from\b|for\b|with\b|on\b|departing\b|under\b|budget\b|\.|\,|$))/i)
          if (qm) dest = qm[1].trim()
        }
        if (!dest || /your destination/i.test(dest) || dest.length > 30 || /\b(?:chaos|wanna|free time|locate)\b/i.test(dest)) {
          const am = String(data.answer || data.itinerary || '').match(/(?:trip\s+to|itinerary\s+for|welcome\s+to|destination:)\s+([A-Za-z\s,-]{2,35})/i)
          if (am) dest = am[1].trim()
        }
        if (!dest || /your destination/i.test(dest) || dest.length > 30 || /\b(?:chaos|wanna|free time|locate)\b/i.test(dest)) {
          dest = /saudi/i.test(messageText) ? 'Saudi Arabia' : 'Dubai'
        }

        let origin = ''
        const om = messageText.match(/(?:from)\s+([A-Za-z\s,-]{2,30}?)(?=\s+(?:to\b|in\b|for\b|\.|\,|$))/i)
        if (om) origin = om[1].trim()

        let duration = ''
        const dm = messageText.match(/(\d+)\s*(?:day|days|night|nights)/i)
        if (dm) duration = `${dm[1]} Days`

        saveTripToHistory(dest, origin, duration, messageText, data, user)
        setTripHistory(getTripHistory(user))
      }
    } catch (err) {
      let kind = 'server'
      if (err.isSetupRequired) kind = 'setup'
      else if (err.message && err.message.includes('Failed to fetch')) kind = 'network'

      setMessages((prev) => [
        ...prev,
        {
          type: 'error',
          message: err.message || 'An error occurred during planning.',
          kind,
        },
      ])
      refreshConfig()
    } finally {
      setBusy(false)
    }
  }

  const handleSelectPrompt = (prompt) => {
    if (!user) {
      setIsAuthOpen(true)
      showToast('Please sign in or continue as guest to start planning.')
      return
    }
    handleSend(prompt)
  }

  const handleFocusInput = () => {
    if (!user) {
      setIsAuthOpen(true)
      showToast('Please sign in or continue as guest to start planning.')
      return
    }
    if (!isReady) {
      showToast('No live API — add your keys first.')
      setIsPreferencesOpen(true)
      return
    }
    const inputEl = document.querySelector('.composer textarea')
    if (inputEl) {
      inputEl.focus()
      inputEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  return (
    <>
      {/* Ambient background */}
      <div className="aurora" aria-hidden="true">
        <span className="blob blob-1"></span>
        <span className="blob blob-2"></span>
        <span className="blob blob-3"></span>
        <span className="grid"></span>
      </div>

      <div className="layout">
        <main className="main">
          {/* Header */}
          <Header
            onOpenPreferences={() => setIsPreferencesOpen(true)}
            onOpenHistory={() => setIsHistoryOpen(true)}
            onOpenAuth={() => setIsAuthOpen(true)}
            onNewTrip={handleNewTrip}
            theme={theme}
            onToggleTheme={toggleTheme}
            currency={currency}
            tripCount={tripHistory.length}
            user={user}
          />

          {/* Conversation container */}
          <div className="conversation" ref={conversationRef}>
            {messages.length === 0 && !isReady && (
              <SetupGate
                config={config}
                onConfigUpdated={(newConfig) => {
                  setConfig(newConfig)
                  if (newConfig && newConfig.ready) setApiStatus('ok')
                }}
                onToast={showToast}
              />
            )}

            {messages.length === 0 && isReady && (
              <Hero
                onSelectPrompt={handleSelectPrompt}
                onFocusInput={handleFocusInput}
                history={tripHistory}
                onLoadTrip={handleLoadTrip}
              />
            )}

            {messages.length > 0 && (
              <div className="messages">
                {messages.map((msg, idx) => {
                  const isLatest = idx === messages.length - 1
                  const itemRef = isLatest ? lastMessageRef : null

                  if (msg.type === 'user') {
                    return (
                      <div key={idx} ref={itemRef} className="msg msg-user">
                        <div className="bubble-user">{msg.text}</div>
                      </div>
                    )
                  }

                  if (msg.type === 'assistant') {
                    return (
                      <div key={idx} ref={itemRef} className="msg-assistant-wrapper">
                        {msg.data && msg.data.is_followup ? (
                          <ConciergeResult
                            result={msg.data}
                            onFollowup={handleSend}
                            onToast={showToast}
                          />
                        ) : (
                          <PlanResult
                            result={msg.data}
                            onFollowup={handleSend}
                            onToast={showToast}
                          />
                        )}
                      </div>
                    )
                  }

                  if (msg.type === 'error') {
                    return (
                      <div key={idx} ref={itemRef}>
                        <ErrorMessage
                          message={msg.message}
                          kind={msg.kind}
                          onOpenSettings={() => setIsSettingsOpen(true)}
                        />
                      </div>
                    )
                  }

                  return null
                })}

                {busy && <AgentPipeline />}
              </div>
            )}
          </div>

          {/* Composer */}
          <Composer
            input={input}
            setInput={setInput}
            isReady={isReady}
            busy={busy}
            isBuilderOpen={isBuilderOpen}
            setIsBuilderOpen={setIsBuilderOpen}
            onSubmit={() => handleSend()}
            onToast={showToast}
          />
        </main>
      </div>

      {/* Interactive Trip Preferences & Style Customizer Modal */}
      <PreferencesModal
        isOpen={isPreferencesOpen}
        onClose={() => setIsPreferencesOpen(false)}
        currency={currency}
        onSelectCurrency={(c) => {
          setCurrency(c)
          try {
            localStorage.setItem(CURRENCY_KEY, c)
          } catch (e) {}
          showToast(`Currency set to ${c}`)
        }}
        pace={pace}
        onSelectPace={(p) => {
          setPace(p)
          try {
            localStorage.setItem(PACE_KEY, p)
          } catch (e) {}
          showToast(`Trip pacing set to ${p}`)
        }}
        themeColor={themeColor}
        onSelectThemeColor={(col) => {
          setThemeColor(col)
          try {
            localStorage.setItem(ACCENT_KEY, col)
          } catch (e) {}
          showToast(`Theme accent updated`)
        }}
        theme={theme}
        onToggleTheme={toggleTheme}
        config={config}
        onOpenDevSettings={() => setIsSettingsOpen(true)}
      />

      {/* Developer Settings Modal (Accessible via Preferences if keys needed) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onConfigUpdated={(newConfig) => {
          setConfig(newConfig)
          if (newConfig && newConfig.ready) setApiStatus('ok')
        }}
        onToast={showToast}
      />

      {/* Saved Trip History Modal */}
      <TripHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onLoadTrip={handleLoadTrip}
        onToast={showToast}
        currentUser={user}
      />

      {/* User Authentication Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        currentUser={user}
        onAuthSuccess={handleAuthSuccess}
        onLogout={handleLogout}
        onToast={showToast}
      />

      {/* Floating Toast */}
      <Toast message={toastMessage} visible={toastVisible} />
    </>
  )
}
