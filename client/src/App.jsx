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
import Toast from './components/Toast'
import { fetchConfig, planTravel } from './services/api'

const THEME_KEY = 'travelbrain.theme'

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

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch (e) {}
  }, [theme])

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

  // Auto scroll conversation to bottom
  const conversationRef = useRef(null)
  const scrollToBottom = (smooth = true) => {
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
    scrollToBottom(true)
  }, [messages, busy])

  // Handlers
  const handleNewTrip = () => {
    if (busy) {
      showToast('Wait for the current plan to finish.')
      return
    }
    setThreadId(null)
    setMessages([])
    setInput('')
    setIsBuilderOpen(false)
  }

  const handleSend = async (customPrompt) => {
    if (busy) return

    const messageText = String(customPrompt !== undefined ? customPrompt : input).trim()
    if (!messageText) return

    if (!isReady) {
      showToast('No live API — add your keys first.')
      return
    }

    setInput('')
    setMessages((prev) => [...prev, { type: 'user', text: messageText }])
    setBusy(true)

    try {
      const data = await planTravel(messageText, threadId)
      data.__query = messageText
      if (data.thread_id) {
        setThreadId(data.thread_id)
      }

      setMessages((prev) => [...prev, { type: 'assistant', data }])
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
    handleSend(prompt)
  }

  const handleFocusInput = () => {
    if (!isReady) {
      showToast('No live API — add your keys first.')
      setIsSettingsOpen(true)
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
            apiStatus={apiStatus}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onNewTrip={handleNewTrip}
            theme={theme}
            onToggleTheme={toggleTheme}
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
              />
            )}

            {messages.length > 0 && (
              <div className="messages">
                {messages.map((msg, idx) => {
                  if (msg.type === 'user') {
                    return (
                      <div key={idx} className="msg msg-user">
                        <div className="bubble-user">{msg.text}</div>
                      </div>
                    )
                  }

                  if (msg.type === 'assistant') {
                    if (msg.data && msg.data.is_followup) {
                      return (
                        <ConciergeResult
                          key={idx}
                          result={msg.data}
                          onFollowup={handleSend}
                          onToast={showToast}
                        />
                      )
                    }

                    return (
                      <PlanResult
                        key={idx}
                        result={msg.data}
                        onFollowup={handleSend}
                        onToast={showToast}
                      />
                    )
                  }

                  if (msg.type === 'error') {
                    return (
                      <ErrorMessage
                        key={idx}
                        message={msg.message}
                        kind={msg.kind}
                        onOpenSettings={() => setIsSettingsOpen(true)}
                      />
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

      {/* Settings Modal */}
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

      {/* Floating Toast */}
      <Toast message={toastMessage} visible={toastVisible} />
    </>
  )
}
