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
  const excalidrawAPIRef = useRef(null)
  const pendingSceneRef = useRef(null)
  const [excalidrawAPI, setExcalidrawAPI] = useState(null)
  const [connected, setConnected] = useState(false)

  const setExcalidrawAPICallback = useCallback((api) => {
    excalidrawAPIRef.current = api
    setExcalidrawAPI(api)
    if (pendingSceneRef.current) {
      api.updateScene({ elements: pendingSceneRef.current })
      pendingSceneRef.current = null
    }
  }, [])
  const [users, setUsers] = useState([])
  const [selfId, setSelfId] = useState(null)
  const [selfColor, setSelfColor] = useState('#6c5ce7')
  const socketRef = useRef(null)
  const isRemoteUpdate = useRef(false)
  const lastSceneVersion = useRef(0)

  // Collaborator pointers for Excalidraw
  const [collaborators, setCollaborators] = useState(new Map())

  // Initialize socket connection — does NOT depend on excalidrawAPI
  useEffect(() => {
    const socket = io(window.location.origin, {
      query: { userName, roomId },
    })
    socketRef.current = socket

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))

    socket.on('user:self', ({ id, color }) => {
      setSelfId(id)
      setSelfColor(color)
    })

    socket.on('users:update', (usersList) => setUsers(usersList))

    const applyScene = (elements) => {
      if (excalidrawAPIRef.current) {
        isRemoteUpdate.current = true
        excalidrawAPIRef.current.updateScene({ elements })
        setTimeout(() => { isRemoteUpdate.current = false }, 100)
      } else {
        pendingSceneRef.current = elements
      }
    }

    socket.on('scene:init', ({ elements }) => applyScene(elements || []))
    socket.on('scene:update', ({ elements }) => applyScene(elements || []))
    socket.on('canvas:clear', () => applyScene([]))

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

    return () => socket.disconnect()
  }, [userName, roomId])

  // When excalidrawAPI is ready, request initial scene
  useEffect(() => {
    if (excalidrawAPI && socketRef.current?.connected) {
      socketRef.current.emit('scene:request')
    }
  }, [excalidrawAPI])

  // Also request scene when socket connects (handles reconnect case)
  useEffect(() => {
    if (!socketRef.current) return
    const onConnect = () => {
      if (excalidrawAPIRef.current) {
        socketRef.current.emit('scene:request')
      }
    }
    socketRef.current.on('connect', onConnect)
    return () => socketRef.current?.off('connect', onConnect)
  }, [])

  // Handle scene changes (send to server)
  const handleChange = useCallback(
    debounce((elements, appState) => {
      if (isRemoteUpdate.current) return
      if (!socketRef.current?.connected) return

      const sceneVersion = elements.reduce((acc, el) => acc + (el.version || 0), 0)
      if (sceneVersion === lastSceneVersion.current) return
      lastSceneVersion.current = sceneVersion

      socketRef.current.emit('scene:update', {
        elements,
        version: sceneVersion,
        roomId,
      })
    }, 100),
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

      {/* Excalidraw Canvas */}
      <div className="excalidraw-wrapper">
        <Excalidraw
          excalidrawAPI={setExcalidrawAPICallback}
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

    </>
  )
}

export default ExcalidrawBoard
