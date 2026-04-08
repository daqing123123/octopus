'use client'
import { useState } from 'react'

export default function MemoryEnhancement() {
  const [activeTab, setActiveTab] = useState<'contacts' | 'milestones' | 'conversation' | 'review'>('contacts')
  const [contacts, setContacts] = useState<any[]>([])
  const [milestones, setMilestones] = useState<any[]>([])
  const [convMemories, setConvMemories] = useState<any[]>([])
  const [reviewSchedule, setReviewSchedule] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const fetchContacts = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/claw/contacts')
      const data = await res.json()
      setContacts(data.data?.contacts || [])
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const fetchMilestones = async () => {
    try {
      const res = await fetch('/api/claw/milestones')
      const data = await res.json()
      setMilestones(data.data?.milestones || [])
    } catch (e) { console.error(e) }
  }

  const fetchConvMemories = async () => {
    try {
      const res = await fetch('/api/claw/conversation-memories')
      const data = await res.json()
      setConvMemories(data.data?.memories || [])
    } catch (e) { console.error(e) }
  }

  const fetchReviewSchedule = async () => {
    try {
      const res = await fetch('/api/claw/memory-review/schedule')
      const data = await res.json()
      setReviewSchedule(data.data)
    } catch (e) { console.error(e) }
  }

  const submitReview = async (scheduleId: string, quality: number) => {
    try {
      const res = await fetch(`/api/claw/memory-review/${scheduleId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quality })
      })
      const data = await res.json()
      if (data.success) {
        alert(`下次复习: ${data.data.intervalDays}天后 | ${data.data.tip}`)
        fetchReviewSchedule()
      }
    } catch (e) { console.error(e) }
  }

  const tabConfig = [
    { id: 'contacts', label: '👥 人物', fetch: fetchContacts },
    { id: 'milestones', label: '⭐ 重要时刻', fetch: fetchMilestones },
    { id: 'conversation', label: '💬 对话记忆', fetch: fetchConvMemories },
    { id: 'review', label: '🧠 遗忘曲线', fetch: fetchReviewSchedule },
  ]

  const renderContacts = () => (
    <div className="space-y-4">
      <div className="flex gap-3">
        <input placeholder="搜索联系人..." className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm" />
        <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm">➕ 添加</button>
      </div>
      {contacts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {contacts.map(c => (
            <div key={c.id} className="bg-white rounded-xl p-4 shadow-sm flex items-start gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold">
                {c.name?.charAt(0) || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-gray-900 truncate">{c.name}</h4>
                <p className="text-xs text-gray-500">{c.relationType} · 互动{c.interactionCount}次</p>
                {c.tags?.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {c.tags.slice(0, 3).map((tag: string, i: number) => (
                      <span key={i} className="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
              <button className="text-gray-400 hover:text-gray-600">›</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-xl">
          <p className="text-gray-400 mb-3">👥</p>
          <p className="text-gray-500">还没有联系人</p>
        </div>
      )}
    </div>
  )

  const renderMilestones = () => (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {['decision', 'promise', 'achievement', 'learning', 'event'].map(type => (
          <button key={type} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs hover:bg-gray-50">
            {type === 'decision' ? '🎯' : type === 'promise' ? '🤝' : type === 'achievement' ? '🏆' : type === 'learning' ? '📚' : '📅' } {' '}
            {{ decision: '重要决策', promise: '承诺', achievement: '成就', learning: '学习', event: '事件' }[type]}
          </button>
        ))}
      </div>
      {milestones.length > 0 ? (
        <div className="space-y-3">
          {milestones.map(m => (
            <div key={m.id} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${
                  m.importance >= 8 ? 'bg-amber-50' : m.importance >= 5 ? 'bg-blue-50' : 'bg-gray-50'
                }`}>
                  {m.type === 'decision' ? '🎯' : m.type === 'promise' ? '🤝' : m.type === 'achievement' ? '🏆' : m.type === 'learning' ? '📚' : '📅'}
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">{m.title}</h4>
                  {m.description && <p className="text-sm text-gray-500 mt-0.5">{m.description}</p>}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-gray-400">{new Date(m.occurredAt).toLocaleDateString('zh')}</span>
                    <div className="flex items-center gap-1">
                      {[1,2,3,4,5,6,7,8,9,10].map(i => (
                        <span key={i} className={`w-1.5 h-1.5 rounded-full ${i <= m.importance ? 'bg-amber-500' : 'bg-gray-200'}`} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-xl">
          <p className="text-gray-400 mb-3">⭐</p>
          <p className="text-gray-500 mb-3">还没有记录重要时刻</p>
          <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">记录第一个时刻</button>
        </div>
      )}
    </div>
  )

  const renderConversationMemories = () => (
    <div className="space-y-4">
      {convMemories.length > 0 ? (
        <div className="space-y-3">
          {convMemories.map(m => (
            <div key={m.id} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    m.sentiment === 'positive' ? 'bg-green-100 text-green-700' :
                    m.sentiment === 'negative' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {{ positive: '积极', neutral: '中性', negative: '消极' }[m.sentiment] || '中性'}
                  </span>
                  <span className="text-xs text-gray-400">重要性 {m.importance}/10</span>
                </div>
                <button className="text-indigo-600 text-xs hover:underline">引用</button>
              </div>
              <p className="text-sm text-gray-800">{m.summary}</p>
              {m.keyPoints?.length > 0 && (
                <div className="mt-2 flex gap-2 flex-wrap">
                  {m.keyPoints.map((p: string, i: number) => (
                    <span key={i} className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded">{p}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-xl">
          <p className="text-gray-400 mb-3">💬</p>
          <p className="text-gray-500">暂无对话记忆</p>
        </div>
      )}
    </div>
  )

  const renderReviewSchedule = () => (
    <div className="space-y-4">
      {reviewSchedule ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-4 text-white text-center">
              <p className="text-3xl font-bold">{reviewSchedule.dueToday}</p>
              <p className="text-sm opacity-80">今日待复习</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm text-center">
              <p className="text-2xl font-bold text-gray-900">{reviewSchedule.schedule?.length || 0}</p>
              <p className="text-sm text-gray-500">总复习项</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm text-center">
              <p className="text-2xl font-bold text-green-600">
                {Math.round((reviewSchedule.schedule?.filter((s: any) => s.retentionScore > 0.7).length / Math.max(1, reviewSchedule.schedule?.length || 1)) * 100)}%
              </p>
              <p className="text-sm text-gray-500">平均记忆保留</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm text-center">
              <p className="text-2xl font-bold text-blue-600">{reviewSchedule.history?.length || 0}</p>
              <p className="text-sm text-gray-500">复习历史</p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-4">📚 复习计划 (艾宾浩斯遗忘曲线)</h3>
            {reviewSchedule.schedule && reviewSchedule.schedule.length > 0 ? (
              <div className="space-y-3">
                {reviewSchedule.schedule.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-800">记忆 #{s.memoryId?.slice(0, 8)}</p>
                      <p className="text-xs text-gray-500">类型: {s.memoryType} | 间隔: {s.intervalDays}天 | 已复习: {s.repetitions}次</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-xs text-gray-500">保留度</p>
                        <p className={`text-sm font-bold ${s.retentionScore > 0.7 ? 'text-green-600' : s.retentionScore > 0.4 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {Math.round((s.retentionScore || 0) * 100)}%
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map(q => (
                          <button key={q} onClick={() => submitReview(s.id, q)}
                            className="w-7 h-7 rounded border border-gray-200 text-xs hover:bg-indigo-50 hover:border-indigo-300"
                            title={`评价${q}`}>{q}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">暂无复习计划</p>
            )}
            <p className="text-xs text-gray-400 mt-3 text-center">
              💡 评价标准: 1=完全忘记, 3=模糊, 5=完美记住。Claw会根据您的评价自动调整复习间隔。
            </p>
          </div>
        </>
      ) : (
        <div className="text-center py-12 bg-white rounded-xl">
          <button onClick={fetchReviewSchedule} className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            加载复习计划
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">🧠 记忆增强</h2>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-white rounded-lg p-1 shadow-sm overflow-x-auto">
        {tabConfig.map(tab => (
          <button key={tab.id} onClick={() => { setActiveTab(tab.id as any); tab.fetch() }}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${activeTab === tab.id ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'contacts' && renderContacts()}
      {activeTab === 'milestones' && renderMilestones()}
      {activeTab === 'conversation' && renderConversationMemories()}
      {activeTab === 'review' && renderReviewSchedule()}
    </div>
  )
}
