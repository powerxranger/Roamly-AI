import React, { useState, useEffect } from 'react'

export const AGENT_STEPS = [
  {
    id: "flight",
    label: "Flight Agent",
    sub: "Finding airports & routes",
    icon: "M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2a.8.8 0 0 0-.8 1.3L8 11l-2 2-2.2-.5a.6.6 0 0 0-.6 1L5 16l2.5 1.8a.6.6 0 0 0 1-.6L8 15l2-2 3.5 4a.8.8 0 0 0 1.3-.8Z"
  },
  {
    id: "hotel",
    label: "Hotel Agent",
    sub: "Searching stays for your destination",
    icon: "M3 7v13M21 20V11a2 2 0 0 0-2-2h-6V4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v16M7 11h4M7 15h4"
  },
  {
    id: "weather",
    label: "Weather Agent",
    sub: "Checking forecast & conditions",
    icon: "M3 15a4 4 0 0 0 4 4h9a5 5 0 1 0-.1-9.999 5.002 5.002 0 1 0-9.78 2.096A4.001 4.001 0 0 0 3 15Z"
  },
  {
    id: "itinerary",
    label: "Itinerary Agent",
    sub: "Building a realistic day-by-day plan",
    icon: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
  },
  {
    id: "final",
    label: "Final Agent",
    sub: "Polishing everything into one clean plan",
    icon: "M9 12l2 2 4-4M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Z"
  }
]

const ESTIMATED_MS = 65000

export default function AgentPipeline() {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const start = Date.now()
    const interval = setInterval(() => {
      setElapsed(Date.now() - start)
    }, 250)
    return () => clearInterval(interval)
  }, [])

  const ratio = Math.min(elapsed / ESTIMATED_MS, 0.97)

  let activeIdx = Math.floor(ratio * AGENT_STEPS.length)
  if (activeIdx >= AGENT_STEPS.length) activeIdx = AGENT_STEPS.length - 1
  if (activeIdx < 0) activeIdx = 0

  const currentStep = AGENT_STEPS[activeIdx]

  return (
    <div className="msg msg-assistant">
      <article className="card agent-stepper-card">
        <div className="agent-stepper-head">
          <div className="agent-stepper-title">
            <strong>Autonomous Agents at Work</strong>
            <small>Researching flights, boutique stays, climate & day-by-day itineraries</small>
          </div>
          <div className="pipeline-telemetry">
            <span className="pipeline-phase-pill">
              Phase {activeIdx + 1} of {AGENT_STEPS.length}
            </span>
            <span className="pipeline-agent-live">
              <span className="pipeline-live-dot"></span>
              {currentStep.label}
            </span>
          </div>
        </div>

        <div className="progress-track">
          <div
            className="progress-fill shimmer-fill"
            style={{ width: `${Math.min(96, Math.max(12, ((activeIdx + 0.65) / AGENT_STEPS.length) * 100))}%` }}
          ></div>
        </div>

        <div className="agent-stepper-list">
          {AGENT_STEPS.map((step, idx) => {
            let status = 'is-pending'
            let pillText = 'Pending'

            if (idx < activeIdx) {
              status = 'is-done'
              pillText = 'Done'
            } else if (idx === activeIdx) {
              status = 'is-active'
              pillText = 'In progress'
            }

            return (
              <div key={step.id} className={`agent-step ${status}`} data-step={step.id}>
                <div className="agent-step-rail">
                  <div className="agent-step-dot">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="agent-step-ico"
                    >
                      <path d={step.icon} />
                    </svg>
                  </div>
                  {idx < AGENT_STEPS.length - 1 && <div className="agent-step-line"></div>}
                </div>

                <div className="agent-step-body">
                  <div className="agent-step-label">{step.label}</div>
                  <div className="agent-step-sub">{step.sub}</div>
                </div>

                <div className="agent-step-status">
                  <span className="agent-step-pill">{pillText}</span>
                </div>
              </div>
            )
          })}
        </div>
      </article>
    </div>
  )
}
