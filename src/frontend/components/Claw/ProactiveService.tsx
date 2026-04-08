'use client'
import { useState, useEffect } from 'react'

export default function ProactiveService() {
  const [activeTab, setActiveTab] = useState<'reminders' | 'reports' | 'meeting' | 'onboarding'>('reminders')
  const [reminders, setReminders] = useState<any>(null)
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [meetingPreps, setMeetingPreps] = useState<any[]>([])
  const [onboarding, setOnboarding] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetchData() }, [activeTab])

  const fetchData = async () => {
    setLoading(true)
    try {
      if (activeTab === 'reminders') {
        const [rRes, sRes] = await Promise.all([
          fetch('/api/claw/reminders'),
          fetch('/api/claw/suggestions')
        ])
        const rData = await rRes.json()
        const sData = await sRes.json()
        setReminders(rData.data)
        setSuggestions(sData.data?.suggestions || [])
      } else if (activeTab === 'reports') {
        const res = await fetch('/api/claw/weekly-reports')
        const data = await res.json()
        setReports(data.data || [])
      } else if (activeTab === 'meeting') {
        const res = await fetch('/api/claw/meeting-prep')
        const data = await res.json()
        setMeetingPreps(data.data || [])
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const completeReminder = async (id: string) => {
    try {
      await fetch(`/api/claw/reminders/${id}/complete`, { method: 'POST' })
      await fetchData()
    } catch (e) { console.error(e) }
  }

  const generateReport = async () => {
    try {
      setLoading(true)
      await fetch('/api/claw/weekly-reports/generate', { method: 'POST' })
      await fetchData()
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const markSuggestionRead = async (id: string) => {
    try {
      await fetch(`/api/claw/suggestions/${id}/read`, { method: 'POST' })
      setSuggestions(prev => prev.filter(s => s.id !== id))
    } catch (e) { console.error(e) }
  }

  const renderReminders = () => (
    <div className="space-y-6">
      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            💡 Claw主动建议 <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{suggestions.length}</span>
          </h3>
          {suggestions.map(s => (
            <div key={s.id} className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-4 flex items-start gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    s.suggestionType === 'weekly_report' ? 'bg-blue-100 text-blue-700' :
                    s.suggestionType === 'meeting_prep' ? 'bg-green-100 text-green-700' :
                    s.suggestionType === 'onboarding' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {{ weekly_report: '📊 周报', meeting_prep: '📅 会议准备', onboarding: '🎯 入职引导', proactive: '💡 主动建议' }[s.suggestionType] || s.suggestionType}
                  </span>
                  <span className="text-xs text-gray-400">{new Date(s.createdAt).toLocaleDateString('zh')}</span>
                </div>
                <h4 className="font-medium text-gray-900">{s.title}</h4>
                {s.content && <p className="text-sm text-gray-600 mt-1">{s.content}</p>}
              </div>
              <div className="flex gap-2">
                {s.actionUrl && <button className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs hover:bg-indigo-700">查看</button>}
                <button onClick={() => markSuggestionRead(s.id)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs hover:bg-white">忽略</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      {reminders?.stats && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: '待完成', value: reminders.stats.pending, color: 'indigo' },
            { label: '今日完成', value: reminders.stats.todayCompleted, color: 'green' },
            { label: '已逾期', value: reminders.stats.overdue, color: 'red' },
          ].map((stat, i) => (
            <div key={i} className={`bg-${stat.color}-50 border border-${stat.color}-200 rounded-xl p-4 text-center`}>
              <p className={`text-3xl font-bold text-${stat.color}-600`}>{stat.value}</p>
              <p className={`text-sm text-${stat.color}-500`}>{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Reminder List */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">⏰ 我的提醒</h3>
          <button className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs hover:bg-indigo-700">➕ 新建提醒</button>
        </div>
        {reminders?.reminders && reminders.reminders.length > 0 ? (
          <div className="space-y-2">
            {reminders.reminders.map((r: any) => (
              <div key={r.id} className={`flex items-center gap-3 p-3 rounded-lg border ${
                r.isOverdue ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'
              }`}>
                <button onClick={() => completeReminder(r.id)}
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs ${
                    r.isCompleted ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-indigo-400'
                  }`}>
                  {r.isCompleted ? '✓' : ''}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${r.isCompleted ? 'line-through text-gray-400' : 'text-gray-900'}`}>{r.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-xs ${r.isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                      {r.dueAt ? `截止: ${new Date(r.dueAt).toLocaleString('zh')}` : r.triggerAt ? `触发: ${new Date(r.triggerAt).toLocaleString('zh')}` : ''}
                    </span>
                    {r.isRecurring && <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">🔄</span>}
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  { follow_up: 'bg-blue-100 text-blue-700', meeting: 'bg-green-100 text-green-700',
                    habit: 'bg-purple-100 text-purple-700', checkin: 'bg-orange-100 text-orange-700', deadline: 'bg-red-100 text-red-700' }[r.type] || 'bg-gray-100 text-gray-600'
                }`}>
                  {r.type}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">暂无提醒</p>
        )}
      </div>
    </div>
  )

  const renderReports = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">📊 周报自动生成</h3>
        <button onClick={generateReport} disabled={loading}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">
          {loading ? '生成中...' : '🤖 AI生成周报'}
        </button>
      </div>
      {reports.length > 0 ? (
        <div className="space-y-3">
          {reports.map(report => (
            <div key={report.id} className="bg-white rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-medium text-gray-900">
                    {new Date(report.weekStart).toLocaleDateString('zh')} ~ {new Date(report.weekEnd).toLocaleDateString('zh')}
                  </h4>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    report.status === 'published' ? 'bg-green-100 text-green-700' :
                    report.status === 'draft' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {{ published: '已发布', draft: '草稿', revised: '已修订' }[report.status] || report.status}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs hover:bg-gray-50">编辑</button>
                  {report.status === 'draft' && <button className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs">发布</button>}
                </div>
              </div>
              {report.stats && (
                <div className="grid grid-cols-4 gap-3 mb-3">
                  {[
                    { label: '消息', value: report.stats.messagesSent, icon: '💬' },
                    { label: '任务', value: report.stats.tasksCompleted, icon: '✅' },
                    { label: '文档', value: report.stats.docsCreated, icon: '📝' },
                    { label: '会议', value: report.stats.meetingsAttended, icon: '📅' },
                  ].map((s, i) => (
                    <div key={i} className="text-center bg-gray-50 rounded-lg p-2">
                      <span>{s.icon}</span>
                      <p className="text-lg font-bold text-gray-900">{s.value}</p>
                      <p className="text-xs text-gray-500">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}
              {report.highlights?.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs font-medium text-gray-500 mb-1">亮点</p>
                  <div className="flex gap-2 flex-wrap">
                    {report.highlights.map((h: string, i: number) => (
                      <span key={i} className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">{h}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl p-12 shadow-sm text-center">
          <p className="text-4xl mb-4">📊</p>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">还没有周报</h3>
          <p className="text-gray-500 mb-4">让Claw帮您自动生成本周工作周报</p>
          <button onClick={generateReport} className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium">
            生成第一份周报
          </button>
        </div>
      )}
    </div>
  )

  const renderMeetingPrep = () => (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-900">📅 会议准备包</h3>
      {meetingPreps.length > 0 ? (
        <div className="space-y-3">
          {meetingPreps.map(prep => (
            <div key={prep.id} className={`bg-white rounded-xl p-5 shadow-sm border-l-4 ${
              prep.status === 'pending' ? 'border-orange-400' : 'border-green-400'
            }`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">{prep.meetingTitle || '未命名会议'}</h4>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {prep.scheduledAt ? `📅 ${new Date(prep.scheduledAt).toLocaleString('zh')}` : ''}
                    {prep.participants?.length > 0 && ` · 👥 ${prep.participants.length}人`}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  prep.status === 'pending' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                }`}>
                  {prep.status === 'pending' ? '待准备' : '已就绪'}
                </span>
              </div>
              {prep.talkingPoints?.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-gray-500 mb-1">建议话题</p>
                  <div className="space-y-1">
                    {prep.talkingPoints.slice(0, 3).map((p: string, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-gray-700">
                        <span className="w-5 h-5 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center text-xs">{i + 1}</span>
                        {p}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2 mt-3">
                <button className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs">开始准备</button>
                <button className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs hover:bg-gray-50">查看详情</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl p-12 shadow-sm text-center">
          <p className="text-4xl mb-4">📅</p>
          <p className="text-gray-500">暂无即将到来的会议</p>
        </div>
      )}
    </div>
  )

  const renderOnboarding = () => (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-900">🎯 企业入职引导</h3>
      <div className="bg-white rounded-xl p-12 shadow-sm text-center">
        <p className="text-4xl mb-4">🎯</p>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">入职引导</h3>
        <p className="text-gray-500">加入新企业后自动开启引导流程</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">🚀 主动服务</h2>
      </div>

      <div className="flex gap-2 bg-white rounded-lg p-1 shadow-sm">
        {[
          ['reminders', '⏰ 提醒'],
          ['reports', '📊 周报'],
          ['meeting', '📅 会议准备'],
          ['onboarding', '🎯 入职引导'],
        ].map(tab => (
          <button key={tab[0]} onClick={() => setActiveTab(tab[0] as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${activeTab === tab[0] ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            {tab[1]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" /></div>
      ) : (
        <>
          {activeTab === 'reminders' && renderReminders()}
          {activeTab === 'reports' && renderReports()}
          {activeTab === 'meeting' && renderMeetingPrep()}
          {activeTab === 'onboarding' && renderOnboarding()}
        </>
      )}
    </div>
  )
}
