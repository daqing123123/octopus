'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'

interface Participant {
  id: string
  userId: string
  userName: string
  userAvatar?: string
  isMuted: boolean
  isVideoOff: boolean
  isScreenSharing: boolean
}

interface ChatMessage {
  userId: string
  userName: string
  userAvatar?: string
  content: string
  sentAt: string
}

export default function MeetingPage() {
  const params = useParams()
  const meetingId = params.meetingId as string
  
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [isHost, setIsHost] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [showParticipants, setShowParticipants] = useState(false)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map())

  // 初始化媒体流
  const initMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      })
      setLocalStream(stream)
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }
      return stream
    } catch (err) {
      console.error('Failed to get media:', err)
      return null
    }
  }, [])

  // 连接WebSocket
  useEffect(() => {
    initMedia().then(stream => {
      const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/meeting/${meetingId}?userId=${window.__USER_ID__}&userName=${encodeURIComponent(window.__USER_NAME__ || 'User')}`
      
      const socket = new WebSocket(wsUrl)
      
      socket.onopen = () => {
        console.log('WebSocket connected')
        setWs(socket)
      }
      
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data)
        handleMessage(message)
      }
      
      socket.onclose = () => {
        console.log('WebSocket disconnected')
        setWs(null)
      }
    })

    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop())
      }
      if (ws) {
        ws.close()
      }
    }
  }, [meetingId])

  const handleMessage = (message: any) => {
    switch (message.type) {
      case 'joined':
        setParticipants(message.participants || [])
        setIsHost(message.isHost)
        break
      
      case 'participant_joined':
        setParticipants(prev => [...prev, message.participant])
        break
      
      case 'participant_left':
        setParticipants(prev => prev.filter(p => p.userId !== message.userId))
        break
      
      case 'participant_updated':
        setParticipants(prev => prev.map(p => 
          p.userId === message.participant.userId 
            ? { ...p, ...message.participant }
            : p
        ))
        break
      
      case 'screen_share_started':
        setParticipants(prev => prev.map(p =>
          p.userId === message.userId
            ? { ...p, isScreenSharing: true }
            : p
        ))
        break
      
      case 'screen_share_stopped':
        setParticipants(prev => prev.map(p =>
          p.userId === message.userId
            ? { ...p, isScreenSharing: false }
            : p
        ))
        break
      
      case 'chat':
        setChatMessages(prev => [...prev, {
          userId: message.userId,
          userName: message.userName,
          userAvatar: message.userAvatar,
          content: message.content,
          sentAt: message.sentAt
        }])
        break
      
      case 'meeting_ended':
        alert('会议已结束')
        window.location.href = '/meetings'
        break
      
      case 'kicked':
        alert('你已被移出会议')
        window.location.href = '/meetings'
        break
    }
  }

  const sendMessage = (type: string, data: any) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, ...data }))
    }
  }

  const toggleAudio = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled
      })
      setIsMuted(!isMuted)
      sendMessage('toggle_audio', { muted: !isMuted })
    }
  }

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled
      })
      setIsVideoOff(!isVideoOff)
      sendMessage('toggle_video', { off: !isVideoOff })
    }
  }

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      // 停止屏幕共享
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop())
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      setLocalStream(stream)
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }
      setIsScreenSharing(false)
      sendMessage('stop_screen_share', {})
    } else {
      // 开始屏幕共享
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream
        }
        setIsScreenSharing(true)
        sendMessage('start_screen_share', {})
        
        screenStream.getVideoTracks()[0].onended = () => {
          toggleScreenShare()
        }
      } catch (err) {
        console.error('Screen share failed:', err)
      }
    }
  }

  const sendChat = () => {
    if (chatInput.trim()) {
      sendMessage('chat', { content: chatInput })
      setChatMessages(prev => [...prev, {
        userId: window.__USER_ID__,
        userName: window.__USER_NAME__,
        content: chatInput,
        sentAt: new Date().toISOString()
      }])
      setChatInput('')
    }
  }

  const leaveMeeting = () => {
    sendMessage('leave', {})
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop())
    }
    window.location.href = '/meetings'
  }

  const endMeeting = () => {
    if (confirm('确定要结束会议吗？')) {
      sendMessage('end', {})
    }
  }

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      {/* Main Video Area */}
      <div className="flex-1 p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-auto">
        {/* Local Video */}
        <div className="relative aspect-video bg-gray-800 rounded-xl overflow-hidden">
          {isVideoOff ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-semibold">
                {(window.__USER_NAME__ || 'U')[0]}
              </div>
            </div>
          ) : (
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
          )}
          <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-white text-sm">
            你 {isMuted && '🔇'}
          </div>
          {isScreenSharing && (
            <div className="absolute top-2 left-2 bg-red-600 px-2 py-1 rounded text-white text-sm">
              🖥️ 屏幕共享中
            </div>
          )}
        </div>

        {/* Remote Videos */}
        {participants.filter(p => p.userId !== window.__USER_ID__).map(p => (
          <div key={p.id} className="relative aspect-video bg-gray-800 rounded-xl overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-semibold">
                {p.userName[0]}
              </div>
            </div>
            <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-white text-sm">
              {p.userName} {p.isMuted && '🔇'}
            </div>
            {p.isScreenSharing && (
              <div className="absolute top-2 left-2 bg-red-600 px-2 py-1 rounded text-white text-sm">
                🖥️ 共享中
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="bg-gray-800 border-t border-gray-700 px-4 py-3">
        <div className="flex items-center justify-center gap-4">
          {/* Audio */}
          <button
            onClick={toggleAudio}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
            } text-white text-xl`}
          >
            {isMuted ? '🔇' : '🎤'}
          </button>

          {/* Video */}
          <button
            onClick={toggleVideo}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              isVideoOff ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
            } text-white text-xl`}
          >
            {isVideoOff ? '📵' : '📹'}
          </button>

          {/* Screen Share */}
          <button
            onClick={toggleScreenShare}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              isScreenSharing ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-700 hover:bg-gray-600'
            } text-white text-xl`}
          >
            🖥️
          </button>

          {/* Chat */}
          <button
            onClick={() => { setShowChat(true); setShowParticipants(false) }}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              showChat ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-700 hover:bg-gray-600'
            } text-white text-xl`}
          >
            💬
            {chatMessages.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 rounded-full text-xs flex items-center justify-center">
                {chatMessages.length}
              </span>
            )}
          </button>

          {/* Participants */}
          <button
            onClick={() => { setShowParticipants(true); setShowChat(false) }}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              showParticipants ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-700 hover:bg-gray-600'
            } text-white text-xl`}
          >
            👥
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 rounded-full text-xs flex items-center justify-center">
              {participants.length}
            </span>
          </button>

          {/* Leave */}
          <button
            onClick={leaveMeeting}
            className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white text-xl"
          >
            📴
          </button>

          {/* End (Host only) */}
          {isHost && (
            <button
              onClick={endMeeting}
              className="px-4 h-12 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white"
            >
              结束会议
            </button>
          )}
        </div>
      </div>

      {/* Chat Sidebar */}
      {showChat && (
        <div className="absolute right-0 top-0 bottom-16 w-80 bg-white shadow-xl flex flex-col">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-semibold">聊天</h2>
            <button onClick={() => setShowChat(false)} className="text-gray-500 hover:text-gray-700">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={msg.userId === window.__USER_ID__ ? 'text-right' : 'text-left'}>
                <div className="text-xs text-gray-500 mb-1">{msg.userName}</div>
                <div className={`inline-block px-3 py-2 rounded-lg ${
                  msg.userId === window.__USER_ID__ 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 border-t">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                placeholder="输入消息..."
                className="flex-1 px-3 py-2 border rounded-lg"
              />
              <button onClick={sendChat} className="px-4 py-2 bg-blue-600 text-white rounded-lg">发送</button>
            </div>
          </div>
        </div>
      )}

      {/* Participants Sidebar */}
      {showParticipants && (
        <div className="absolute right-0 top-0 bottom-16 w-72 bg-white shadow-xl flex flex-col">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-semibold">参与者 ({participants.length})</h2>
            <button onClick={() => setShowParticipants(false)} className="text-gray-500 hover:text-gray-700">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {participants.map(p => (
              <div key={p.id} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                  {p.userName[0]}
                </div>
                <div className="flex-1">
                  <div className="font-medium">{p.userName}</div>
                  <div className="text-xs text-gray-500">
                    {p.isMuted ? '🔇 静音' : '🎤'} {p.isVideoOff ? '📵 关闭视频' : '📹'}
                  </div>
                </div>
                {isHost && p.userId !== window.__USER_ID__ && (
                  <button className="text-red-600 text-sm">踢出</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
