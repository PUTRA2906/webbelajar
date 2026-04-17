import { useState, useCallback } from 'react'
import ExcalidrawBoard from './components/ExcalidrawBoard'
import WelcomeOverlay from './components/WelcomeOverlay'

function App() {
  const [userName, setUserName] = useState(null)
  const [roomId] = useState(() => {
    // Check URL for room ID, otherwise use default
    const params = new URLSearchParams(window.location.search)
    return params.get('room') || 'default-room'
  })

  const handleJoin = useCallback((name) => {
    setUserName(name)
  }, [])

  if (!userName) {
    return <WelcomeOverlay onJoin={handleJoin} roomId={roomId} />
  }

  return (
    <div className="app-container">
      <ExcalidrawBoard userName={userName} roomId={roomId} />
    </div>
  )
}

export default App
