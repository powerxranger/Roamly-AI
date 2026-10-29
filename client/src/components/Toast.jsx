import React from 'react'

export default function Toast({ message, visible }) {
  if (!message && !visible) return null

  return (
    <div
      className={`toast ${visible ? 'show' : ''}`}
      role="status"
      aria-live="polite"
      hidden={!visible}
    >
      {message}
    </div>
  )
}
