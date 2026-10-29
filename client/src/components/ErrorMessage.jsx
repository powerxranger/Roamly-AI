import React from 'react'

const COPY = {
  server: {
    title: 'The planner could not finish',
    detail: 'The request reached the server but the agent run failed. Check the uvicorn console for the full traceback.',
  },
  network: {
    title: 'Could not reach the server',
    detail: 'The request never completed. Check that the server is still running.',
  },
  render: {
    title: 'The plan came back, but could not be displayed',
    detail: 'The agents returned data in an unexpected shape. This is a frontend issue, not an agent failure.',
  },
  setup: {
    title: 'Missing credentials',
    detail: "Add the required keys in Settings, or set them in the server's .env file.",
  },
}

export default function ErrorMessage({ message, kind = 'server', onOpenSettings }) {
  const info = COPY[kind] || COPY.server

  return (
    <div className="msg msg-assistant">
      <article className="card error-card">
        <div className="error-body">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="error-ico"
          >
            <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>

          <div>
            <strong>{info.title}</strong>
            <p>{info.detail}</p>
            <code>{message}</code>

            {kind === 'setup' && (
              <button
                type="button"
                className="btn btn-soft btn-sm"
                onClick={onOpenSettings}
                style={{ marginTop: '0.75rem', display: 'inline-flex' }}
              >
                Open settings
              </button>
            )}
          </div>
        </div>
      </article>
    </div>
  )
}
