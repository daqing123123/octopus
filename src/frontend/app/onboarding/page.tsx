'use client'

import { useState, useEffect } from 'react'

interface Task {
  id: string
  title: string
  description: string
  category: string
  status: 'pending' | 'completed'
  order: number
  completedAt?: string
}

interface OnboardingData {
  id: string
  startedAt: string
  estimatedEndDate: string
  completedAt?: string
  progress: number
  tasks: Task[]
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  suggestions?: string[]
}

export default function OnboardingPage() {
  const [data, setData] = useState<OnboardingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'tasks' | 'chat'>('tasks')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: '👋 你好！我是你的入职助手。\n\n我可以帮助你：\n• 了解公司规章制度\n• 完成入职任务\n• 认识新同事\n• 解答你的疑问\n\n有什么我可以帮你的吗？',
      suggestions: ['查看我的入职任务', '公司有哪些制度', '怎么请假', '认识团队成员']
    }
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>('')

  useEffect(() => {
    fetchOnboarding()
  }, [])

  const fetchOnboarding = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/${window.__ENTERPRISE_ID__}/onboarding/my-tasks`)
      const result = await res.json()
      if (result.success) {
        setData(result.data)
      }
    } catch (error) {
      console.error('Failed to fetch onboarding:', error)
    } finally {
      setLoading(false)
    }
  }

  const completeTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/${window.__ENTERPRISE_ID__}/onboarding/my-tasks/${taskId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const result = await res.json()
      if (result.success) {
        fetchOnboarding()
      }
    } catch (error) {
      console.error('Failed to complete task:', error)
    }
  }

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return

    const userMessage = chatInput
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setChatLoading(true)

    try {
      const res = await fetch(`/api/${window.__ENTERPRISE_ID__}/onboarding/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage })
      })
      const result = await res.json()
      
      if (result.success) {
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: result.data.reply,
          suggestions: result.data.suggestions
        }])
      }
    } catch (error) {
      console.error('Chat failed:', error)
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: '抱歉，AI助手暂时不可用。请稍后重试。',
        suggestions: ['查看入职任务', '联系HR']
      }])
    } finally {
      setChatLoading(false)
    }
  }

  const categories = data ? [...new Set(data.tasks.map(t => t.category))] : []
  const filteredTasks = selectedCategory
    ? data?.tasks.filter(t => t.category === selectedCategory)
    : data?.tasks

  const pendingTasks = data?.tasks.filter(t => t.status === 'pending') || []
  const completedTasks = data?.tasks.filter(t => t.status === 'completed') || []

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-bounce">🚀</div>
          <p className="text-xl text-gray-600">加载入职任务中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">🎯 入职向导</h1>
              <p className="text-gray-500 mt-1">
                {data?.completedAt ? '🎉 入职任务已完成！' : `预计 ${data?.estimatedEndDate?.split('T')[0]} 前完成`}
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-emerald-600">{data?.progress || 0}%</div>
              <div className="text-sm text-gray-500">完成进度</div>
              <div className="w-32 h-2 bg-gray-200 rounded-full mt-1">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${data?.progress || 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Progress Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl p-4 shadow">
            <div className="text-2xl mb-1">📋</div>
            <div className="text-2xl font-bold text-gray-900">{data?.tasks.length || 0}</div>
            <div className="text-sm text-gray-500">总任务</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow">
            <div className="text-2xl mb-1">⏳</div>
            <div className="text-2xl font-bold text-amber-600">{pendingTasks.length}</div>
            <div className="text-sm text-gray-500">待完成</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow">
            <div className="text-2xl mb-1">✅</div>
            <div className="text-2xl font-bold text-emerald-600">{completedTasks.length}</div>
            <div className="text-sm text-gray-500">已完成</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow">
            <div className="text-2xl mb-1">🏢</div>
            <div className="text-2xl font-bold text-blue-600">{categories.length}</div>
            <div className="text-sm text-gray-500">类别</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('tasks')}
              className={`flex-1 px-6 py-4 text-center font-medium transition-colors ${
                activeTab === 'tasks' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              📋 任务清单
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 px-6 py-4 text-center font-medium transition-colors ${
                activeTab === 'chat' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              💬 入职助手
            </button>
          </div>

          {/* Tasks Tab */}
          {activeTab === 'tasks' && (
            <div className="p-6">
              {/* Category Filter */}
              <div className="flex flex-wrap gap-2 mb-6">
                <button
                  onClick={() => setSelectedCategory('')}
                  className={`px-4 py-2 rounded-full transition-colors ${
                    !selectedCategory ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  全部
                </button>
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-4 py-2 rounded-full transition-colors ${
                      selectedCategory === cat ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Task List */}
              <div className="space-y-4">
                {filteredTasks?.sort((a, b) => a.order - b.order).map(task => (
                  <div
                    key={task.id}
                    className={`border rounded-xl p-4 transition-all ${
                      task.status === 'completed' ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 hover:border-emerald-300'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <button
                        onClick={() => task.status !== 'completed' && completeTask(task.id)}
                        disabled={task.status === 'completed'}
                        className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                          task.status === 'completed'
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : 'border-gray-300 hover:border-emerald-500'
                        }`}
                      >
                        {task.status === 'completed' && '✓'}
                      </button>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className={`font-medium ${
                            task.status === 'completed' ? 'text-emerald-700 line-through' : 'text-gray-900'
                          }`}>
                            {task.title}
                          </h3>
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                            {task.category}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">{task.description}</p>
                        {task.completedAt && (
                          <p className="text-xs text-emerald-600 mt-2">
                            ✅ 完成于 {new Date(task.completedAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                      {task.status !== 'completed' && (
                        <button
                          onClick={() => completeTask(task.id)}
                          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                        >
                          完成
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chat Tab */}
          {activeTab === 'chat' && (
            <div className="h-[500px] flex flex-col">
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        msg.role === 'user'
                          ? 'bg-emerald-600 text-white rounded-br-sm'
                          : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      {msg.suggestions && msg.role === 'assistant' && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {msg.suggestions.map((s, i) => (
                            <button
                              key={i}
                              onClick={() => setChatInput(s)}
                              className="px-3 py-1 bg-white/50 hover:bg-white/80 rounded-full text-sm transition-colors"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="p-4 border-t">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                    placeholder="输入你的问题..."
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    disabled={chatLoading}
                  />
                  <button
                    onClick={sendChat}
                    disabled={!chatInput.trim() || chatLoading}
                    className="px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    发送
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
