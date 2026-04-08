'use client'

import { useState, useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

interface Message {
  id: string
  conversationId: string
  senderId: string
  sender: { id: string; name: string; avatar_url?: string }
  content: string
  type: 'text' | 'image' | 'file' | 'audio'
  replyTo?: string
  createdAt: Date
}

interface Conversation {
  id: string
  name: string
  type: 'direct' | 'group'
  avatar_url?: string
  lastMessage?: Message
  unreadCount: number
}

export default function MessagePage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())
  
  const socketRef = useRef<Socket | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // 初始化 WebSocket
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return

    socketRef.current = io(API_URL, {
      auth: { token },
      transports: ['websocket', 'polling']
    })

    socketRef.current.on('connect', () => {
      console.log('WebSocket 已连接')
    })

    socketRef.current.on('new-message', (message: Message) => {
      setMessages(prev => [...prev, message])
      scrollToBottom()
    })

    socketRef.current.on('user-typing', (data: { userId: string; isTyping: boolean }) => {
      setTypingUsers(prev => {
        if (data.isTyping) {
          return [...prev.filter(id => id !== data.userId), data.userId]
        }
        return prev.filter(id => id !== data.userId)
      })
    })

    socketRef.current.on('message-read', (data: { userId: string; messageId: string }) => {
      // 更新消息已读状态
    })

    socketRef.current.on('user-status', (data: { userId: string; status: string }) => {
      setOnlineUsers(prev => {
        const newSet = new Set(prev)
        if (data.status === 'online') {
          newSet.add(data.userId)
        } else {
          newSet.delete(data.userId)
        }
        return newSet
      })
    })

    return () => {
      socketRef.current?.disconnect()
    }
  }, [])

  // 加载会话列表
  useEffect(() => {
    loadConversations()
  }, [])

  // 加载消息
  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation.id)
      
      // 加入会话房间
      socketRef.current?.emit('join-conversation', selectedConversation.id)
      
      return () => {
        socketRef.current?.emit('leave-conversation', selectedConversation.id)
      }
    }
  }, [selectedConversation])

  const loadConversations = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/api/messages/conversations`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await response.json()
      if (data.success) {
        setConversations(data.data)
      }
    } catch (error) {
      console.error('加载会话失败:', error)
    }
  }

  const loadMessages = async (conversationId: string) => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/api/messages/conversations/${conversationId}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await response.json()
      if (data.success) {
        setMessages(data.data)
        scrollToBottom()
      }
    } catch (error) {
      console.error('加载消息失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const sendMessage = () => {
    if (!newMessage.trim() || !selectedConversation || !socketRef.current) return

    socketRef.current.emit('send-message', {
      conversationId: selectedConversation.id,
      content: newMessage.trim(),
      type: 'text'
    })

    setNewMessage('')
    
    // 停止输入状态
    socketRef.current.emit('typing', {
      conversationId: selectedConversation.id,
      isTyping: false
    })
  }

  const handleTyping = () => {
    if (!selectedConversation || !socketRef.current) return

    socketRef.current.emit('typing', {
      conversationId: selectedConversation.id,
      isTyping: true
    })

    // 3秒后自动停止输入状态
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit('typing', {
        conversationId: selectedConversation.id,
        isTyping: false
      })
    }, 3000)
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const formatTime = (date: Date | string) => {
    const d = new Date(date)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
    if (diff < 86400000) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="h-full flex">
      {/* 会话列表 */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        {/* 搜索 */}
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <input
              type="text"
              placeholder="搜索会话..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          </div>
        </div>

        {/* 会话列表 */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              暂无会话
            </div>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                onClick={() => setSelectedConversation(conv)}
                className={`p-4 flex items-center gap-3 cursor-pointer hover:bg-gray-50 ${
                  selectedConversation?.id === conv.id ? 'bg-indigo-50' : ''
                }`}
              >
                {/* 头像 */}
                <div className="relative">
                  <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-lg font-medium text-indigo-600">
                    {conv.name?.[0] || '?'}
                  </div>
                  {onlineUsers.has(conv.id) && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                  )}
                </div>

                {/* 信息 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900 truncate">{conv.name}</span>
                    {conv.lastMessage && (
                      <span className="text-xs text-gray-500">
                        {formatTime(conv.lastMessage.createdAt)}
                      </span>
                    )}
                  </div>
                  {conv.lastMessage && (
                    <p className="text-sm text-gray-500 truncate">
                      {conv.lastMessage.content}
                    </p>
                  )}
                </div>

                {/* 未读数 */}
                {conv.unreadCount > 0 && (
                  <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-xs text-white">
                    {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* 新建会话 */}
        <div className="p-4 border-t border-gray-200">
          <button className="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
            + 新建会话
          </button>
        </div>
      </div>

      {/* 消息区域 */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {selectedConversation ? (
          <>
            {/* 会话头部 */}
            <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
              <div className="flex items-center gap-3">
                <h2 className="font-semibold text-gray-900">{selectedConversation.name}</h2>
                <span className="text-sm text-gray-500">
                  {selectedConversation.type === 'group' ? '群聊' : '私聊'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button className="p-2 hover:bg-gray-100 rounded-lg">📞</button>
                <button className="p-2 hover:bg-gray-100 rounded-lg">📹</button>
                <button className="p-2 hover:bg-gray-100 rounded-lg">⋮</button>
              </div>
            </div>

            {/* 消息列表 */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {loading ? (
                <div className="text-center text-gray-500">加载中...</div>
              ) : (
                messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.senderId === localStorage.getItem('user') ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`flex items-end gap-2 max-w-[70%] ${msg.senderId === localStorage.getItem('user') ? 'flex-row-reverse' : ''}`}>
                      {/* 头像 */}
                      <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-sm flex-shrink-0">
                        {msg.sender?.name?.[0] || '?'}
                      </div>
                      
                      {/* 消息内容 */}
                      <div className={`rounded-2xl px-4 py-2 ${
                        msg.senderId === localStorage.getItem('user')
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white border border-gray-200'
                      }`}>
                        <p>{msg.content}</p>
                        <p className={`text-xs mt-1 ${
                          msg.senderId === localStorage.getItem('user') ? 'text-indigo-200' : 'text-gray-400'
                        }`}>
                          {formatTime(msg.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
              
              {/* 正在输入提示 */}
              {typingUsers.length > 0 && (
                <div className="flex items-center gap-2 text-gray-500 text-sm">
                  <span className="animate-pulse">💬</span>
                  <span>正在输入...</span>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* 输入区域 */}
            <div className="h-20 bg-white border-t border-gray-200 flex items-center px-6 gap-4">
              <button className="p-2 hover:bg-gray-100 rounded-lg text-xl">📎</button>
              <button className="p-2 hover:bg-gray-100 rounded-lg text-xl">😊</button>
              <button className="p-2 hover:bg-gray-100 rounded-lg text-xl">🖼️</button>
              
              <input
                type="text"
                value={newMessage}
                onChange={(e) => {
                  setNewMessage(e.target.value)
                  handleTyping()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage()
                  }
                }}
                placeholder="输入消息..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              
              <button
                onClick={sendMessage}
                disabled={!newMessage.trim()}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                发送
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <div className="text-6xl mb-4">💬</div>
              <p>选择一个会话开始聊天</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}