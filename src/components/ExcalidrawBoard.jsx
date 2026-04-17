import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Excalidraw, exportToBlob } from '@excalidraw/excalidraw'
import { io } from 'socket.io-client'

// Throttle helper
function throttle(fn, delay) {
  let last = 0
  return (...args) => {
    const now = Date.now()
    if (now - last >= delay) {
      last = now
      fn(...args)
    }
  }
}

// Debounce helper
function debounce(fn, delay) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

function ExcalidrawBoard({ userName, roomId }) {
  const [excalidrawAPI, setExcalidrawAPI] = useState(null)
  const [connected, setConnected] = useState(false)
  const [users, setUsers] = useState([])
  const [selfId, setSelfId] = useState(null)
  const [selfColor, setSelfColor] = useState('#6c5ce7')
  const socketRef = useRef(null)
  const isRemoteUpdate = useRef(false)
  const lastSceneVersion = useRef(0)

  // Collaborator pointers for Excalidraw
  const [collaborators, setCollaborators] = useState(new Map())

  // Initialize socket connection
  useEffect(() => {
    const socket = io(window.location.origin, {
      query: { userName, roomId },
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
    })

    socket.on('disconnect', () => {
      setConnected(false)
    })

    socket.on('user:self', ({ id, color, name }) => {
      setSelfId(id)
      setSelfColor(color)
    })

    socket.on('users:update', (usersList) => {
      setUsers(usersList)
    })

    // Receive full scene from server (initial load or sync)
    socket.on('scene:init', ({ elements, appState }) => {
      if (excalidrawAPI) {
        isRemoteUpdate.current = true
        excalidrawAPI.updateScene({
          elements: elements || [],
        })
        setTimeout(() => {
          isRemoteUpdate.current = false
        }, 100)
      }
    })

    // Receive scene update from other users
    socket.on('scene:update', ({ elements }) => {
      if (excalidrawAPI) {
        isRemoteUpdate.current = true
        excalidrawAPI.updateScene({
          elements: elements || [],
        })
        setTimeout(() => {
          isRemoteUpdate.current = false
        }, 100)
      }
    })

    // Receive cursor/pointer update
    socket.on('cursor:update', ({ id, pointer, button, name, color, selectedElementIds }) => {
      setCollaborators((prev) => {
        const next = new Map(prev)
        next.set(id, {
          username: name,
          color: { brand: color, background: color },
          pointer,
          button: button || 'up',
          selectedElementIds: selectedElementIds || {},
          id,
        })
        return next
      })
    })

    socket.on('cursor:remove', (id) => {
      setCollaborators((prev) => {
        const next = new Map(prev)
        next.delete(id)
        return next
      })
    })

    // Canvas clear
    socket.on('canvas:clear', () => {
      if (excalidrawAPI) {
        isRemoteUpdate.current = true
        excalidrawAPI.updateScene({ elements: [] })
        setTimeout(() => {
          isRemoteUpdate.current = false
        }, 100)
      }
    })

    return () => {
      socket.disconnect()
    }
  }, [userName, roomId, excalidrawAPI])

  // When excalidrawAPI is ready, request initial scene
  useEffect(() => {
    if (excalidrawAPI && socketRef.current?.connected) {
      socketRef.current.emit('scene:request')
    }
  }, [excalidrawAPI])

  // Handle scene changes (send to server)
  const handleChange = useCallback(
    debounce((elements, appState) => {
      if (isRemoteUpdate.current) return
      if (!socketRef.current?.connected) return

      // Only send if elements actually changed
      const sceneVersion = elements.reduce((acc, el) => acc + el.version, 0)
      if (sceneVersion === lastSceneVersion.current) return
      lastSceneVersion.current = sceneVersion

      socketRef.current.emit('scene:update', {
        elements: elements,
        roomId,
      })
    }, 300),
    [roomId]
  )

  // Handle pointer/cursor movement
  const handlePointerUpdate = useCallback(
    throttle((payload) => {
      if (!socketRef.current?.connected) return
      socketRef.current.emit('cursor:move', {
        pointer: payload.pointer,
        button: payload.button,
        selectedElementIds: payload.pointersMap ? {} : {},
      })
    }, 50),
    []
  )

  // Clear canvas
  const handleClear = useCallback(() => {
    if (!excalidrawAPI) return
    if (confirm('Hapus semua gambar?')) {
      excalidrawAPI.updateScene({ elements: [] })
      socketRef.current?.emit('canvas:clear')
    }
  }, [excalidrawAPI])

  // Export as PNG
  const handleExport = useCallback(async () => {
    if (!excalidrawAPI) return
    try {
      const elements = excalidrawAPI.getSceneElements()
      if (elements.length === 0) {
        alert('Tidak ada gambar untuk di-export')
        return
      }
      const blob = await exportToBlob({
        elements: excalidrawAPI.getSceneElements(),
        appState: {
          ...excalidrawAPI.getAppState(),
          exportWithDarkMode: true,
        },
        files: excalidrawAPI.getFiles(),
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `webbelajar-${Date.now()}.png`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
    }
  }, [excalidrawAPI])

  // Share room link
  const handleShare = useCallback(() => {
    const url = `${window.location.origin}?room=${roomId}`
    navigator.clipboard.writeText(url).then(() => {
      alert(`Link room telah disalin!\n${url}`)
    }).catch(() => {
      prompt('Salin link room ini:', url)
    })
  }, [roomId])

  return (
    <>
      {/* Top Bar */}
      <div className="top-bar">
        <div className="top-bar__logo">
          <div className="top-bar__logo-icon">✏️</div>
          <span className="top-bar__logo-text">WebBelajar</span>
        </div>
        <div className="top-bar__users">
          {users.map((user) => (
            <div
              key={user.id}
              className={`user-avatar ${user.id === selfId ? 'user-avatar--self' : ''}`}
              style={{ backgroundColor: user.color }}
            >
              {user.name.charAt(0).toUpperCase()}
              <div className="user-avatar__tooltip">
                {user.name} {user.id === selfId ? '(kamu)' : ''}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Excalidraw Canvas */}
      <div className="excalidraw-wrapper">
        <Excalidraw
          excalidrawAPI={(api) => setExcalidrawAPI(api)}
          onChange={handleChange}
          onPointerUpdate={handlePointerUpdate}
          theme="dark"
          name="WebBelajar"
          UIOptions={{
            canvasActions: {
              loadScene: true,
              export: { saveFileToDisk: true },
              saveToActiveFile: false,
            },
          }}
          langCode="en"
          isCollaborating={true}
          collaborators={collaborators}
        />
      </div>

      {/* Status Bar */}
      <div className="status-bar">
        <span
          className={`status-bar__dot ${connected ? 'status-bar__dot--online' : 'status-bar__dot--offline'}`}
        />
        <span>{connected ? 'Terhubung' : 'Terputus'}</span>
        <span>|</span>
        <span>{users.length} pengguna online</span>
        <span>|</span>
        <span>Room: {roomId}</span>
      </div>

      {/* Action Buttons */}
      <div className="action-buttons">
        <button className="action-btn" onClick={handleShare} title="Bagikan Room" id="share-btn">
          🔗 Share
        </button>
        <button className="action-btn" onClick={handleExport} title="Export PNG" id="export-btn">
          📥 Export
        </button>
        <button className="action-btn action-btn--danger" onClick={handleClear} title="Hapus Semua" id="clear-btn">
          🗑️ Clear
        </button>
      </div>
    </>
  )
}

export default ExcalidrawBoard
