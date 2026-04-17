import { useState, useRef, useEffect } from 'react'

function WelcomeOverlay({ onJoin, roomId }) {
  const [name, setName] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed) {
      onJoin(trimmed)
    }
  }

  return (
    <div className="welcome-overlay">
      <div className="welcome-card">
        <div className="welcome-card__icon">✏️</div>
        <h2>WebBelajar</h2>
        <p>
          Papan tulis kolaboratif real-time.
          <br />
          Gambar, tulis, dan berkreasi bersama!
        </p>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            className="welcome-card__input"
            placeholder="Masukkan nama kamu..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            id="username-input"
          />
          <button
            type="submit"
            className="welcome-card__btn"
            disabled={!name.trim()}
            id="join-btn"
          >
            🚀 Mulai Menggambar
          </button>
        </form>
        <p style={{ marginTop: '12px', fontSize: '12px', opacity: 0.5 }}>
          Room: {roomId}
        </p>
      </div>
    </div>
  )
}

export default WelcomeOverlay
