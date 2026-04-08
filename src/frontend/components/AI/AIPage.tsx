'use client'

import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export default function AIPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string>('')
  const [showTools, setShowTools] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // 快捷工具
  const quickTools = [
    { id: 'write', icon: '✍️', label: '写作助手', prompt: '帮我写一段关于' },
    { id: 'translate', icon: '🌐', label: '翻译', prompt: '翻译以下内容：' },
    { id: 'summarize', icon: '📋', label: '总结', prompt: '总结以下内容：' },
    { id: 'code', icon: '💻', label: '代码助手', prompt: '请帮我写代码：' },
    { id: 'explain', icon: '💡', label: '解释', prompt: '请解释：' },
    { id: 'brainstorm', icon: '🧠', label: '头脑风暴', prompt: '帮我头脑风暴关于' }
  ]

  useEffect(() => {
    // 滚动到底部
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 发送消息
  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const token = localStorage.getItem('token')
      const response = await axios.post(`${API_URL}/api/ai/chat`, {
        message: input.trim(),
        conversationId
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (response.data.success) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response.data.data.content,
          timestamp: new Date()
        }
        setMessages(prev => [...prev, assistantMessage])
        
        if (!conversationId && response.data.data.conversationId) {
          setConversationId(response.data.data.conversationId)
        }
      }
    } catch (error) {
      console.error('AI 对话失败:', error)
      toast.error('AI 助手暂时不可用')
    } finally {
      setLoading(false)
    }
  }

  // 快捷操作
  const handleQuickAction = async (action: string, prompt: string) => {
    setInput(prompt)
    inputRef.current?.focus()
  }

  // 文本生成
  const handleGenerate = async (type: string) => {
    const text = prompt('请输入内容：')
    if (!text) return

    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const response = await axios.post(`${API_URL}/api/ai/generate`, {
        type,
        input: text
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (response.data.success) {
        const assistantMessage: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: response.data.data.content,
          timestamp: new Date()
        }
        setMessages(prev => [...prev, assistantMessage])
      }
    } catch (error) {
      console.error('生成失败:', error)
      toast.error('生成失败')
    } finally {
      setLoading(false)
    }
  }

  // 清空对话
  const clearConversation = () => {
    setMessages([])
    setConversationId('')
  }

  // 复制消息
  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content)
    toast.success('已复制到剪贴板')
  }

  // 渲染消息内容（支持简单的 Markdown）
  const renderContent = (content: string) => {
    // 代码块
    content = content.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-gray-800 text-gray-100 p-4 rounded-lg my-2 overflow-x-auto"><code>$2</code></pre>')
    // 行内代码
    content = content.replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-indigo-600">$1</code>')
    // 粗体
    content = content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // 斜体
    content = content.replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // 列表
    content = content.replace(/^• (.+)$/gm, '<li class="ml-4">$1</li>')
    // 换行
    content = content.replace(/\n/g, '<br>')
    
    return <div dangerouslySetInnerHTML={{ __html: content }} />
  }

  return (
    <div className="h-full flex bg-white">
      {/* 侧边栏 */}
      <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <button
            onClick={clearConversation}
            className="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            + 新对话
          </button>
        </div>

        {/* 历史对话 */}
        <div className="flex-1 overflow-y-auto p-2">
          <p className="px-2 py-1 text-xs text-gray-500 font-medium">今天</p>
          {/* TODO: 加载历史对话 */}
        </div>

        {/* 模型信息 */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>🤖</span>
            <span>GPT-3.5 Turbo</span>
          </div>
        </div>
      </div>

      {/* 主聊天区域 */}
      <div className="flex-1 flex flex-col">
        {/* 快捷工具 */}
        {messages.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-2xl w-full px-8">
              <div className="text-6xl mb-4">🤖</div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">AI 助手</h1>
              <p className="text-gray-500 mb-8">我可以帮你写作、翻译、总结、写代码等</p>
              
              <div className="grid grid-cols-3 gap-4">
                {quickTools.map(tool => (
                  <button
                    key={tool.id}
                    onClick={() => handleQuickAction(tool.id, tool.prompt)}
                    className="p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors text-left"
                  >
                    <div className="text-2xl mb-2">{tool.icon}</div>
                    <div className="font-medium text-gray-900">{tool.label}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 消息列表 */}
        {messages.length > 0 && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={clsx(
                  'flex gap-3',
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                    🤖
                  </div>
                )}
                
                <div
                  className={clsx(
                    'max-w-[70%] rounded-2xl px-4 py-3',
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  )}
                >
                  <div className="prose prose-sm max-w-none">
                    {renderContent(msg.content)}
                  </div>
                  
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200">
                      <button
                        onClick={() => copyMessage(msg.content)}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        📋 复制
                      </button>
                      <button className="text-xs text-gray-500 hover:text-gray-700">
                        ↻ 重新生成
                      </button>
                    </div>
                  )}
                </div>
                
                {msg.role === 'user' && (
                  <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm">
                    我
                  </div>
                )}
              </div>
            ))}
            
            {loading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                  🤖
                </div>
                <div className="bg-gray-100 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* 输入区域 */}
        <div className="border-t border-gray-200 p-4">
          <div className="flex items-end gap-3">
            <button
              onClick={() => setShowTools(!showTools)}
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
            >
              ⚡
            </button>
            
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage()
                  }
                }}
                placeholder="输入消息... (Shift+Enter 换行)"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                rows={1}
              />
            </div>
            
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              发送
            </button>
          </div>
          
          {/* 快捷工具面板 */}
          {showTools && (
            <div className="absolute bottom-full left-4 right-4 mb-2 bg-white border border-gray-200 rounded-xl shadow-lg p-4 grid grid-cols-4 gap-2">
              {quickTools.map(tool => (
                <button
                  key={tool.id}
                  onClick={() => {
                    handleQuickAction(tool.id, tool.prompt)
                    setShowTools(false)
                  }}
                  className="p-3 hover:bg-gray-50 rounded-lg text-center"
                >
                  <div className="text-xl mb-1">{tool.icon}</div>
                  <div className="text-xs text-gray-600">{tool.label}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}