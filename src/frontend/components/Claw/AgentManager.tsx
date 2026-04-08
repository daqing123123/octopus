'use client'
import { useState } from 'react'

export default function AgentManager() {
  const [clones, setClones] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [actionLogs, setActionLogs] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'clones' | 'store' | 'feedback'>('clones')
  const [loading, setLoading] = useState(false)

  const fetchClones = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/claw/agent-clones')
      const data = await res.json()
      setClones(data.data?.clones || [])
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/claw/agent-templates')
      const data = await res.json()
      setTemplates(data.data?.templates || [])
    } catch (e) { console.error(e) }
  }

  const fetchActionLogs = async (cloneId?: string) => {
    if (!cloneId) return
    try {
      const res = await fetch(`/api/claw/agent-clones/${cloneId}/actions`)
      const data = await res.json()
      setActionLogs(data.data?.logs || [])
    } catch (e) { console.error(e) }
  }

  const toggleClone = async (cloneId: string, isActive: boolean) => {
    try {
      await fetch(`/api/claw/agent-clones/${cloneId}/toggle`, { method: 'POST' })
      await fetchClones()
    } catch (e) { console.error(e) }
  }

  const useTemplate = async (templateId: string) => {
    try {
      const res = await fetch(`/api/claw/agent-templates/${templateId}/use`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        await fetchClones()
        setActiveTab('clones')
      }
    } catch (e) { console.error(e) }
  }

  const submitFeedback = async (type: string, targetType: string, targetId: string) => {
    try {
      await fetch('/api/claw/agent-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedbackType: type, targetType, targetId })
      })
      alert('感谢反馈！')
    } catch (e) { console.error(e) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">🤖 Agent进化</h2>
        <div className="flex gap-2 bg-white rounded-lg p-1 shadow-sm">
          {[['clones', '克隆'], ['store', '商店'], ['feedback', '反馈']].map(tab => (
            <button key={tab[0]} onClick={() => { setActiveTab(tab[0] as any); if (tab[0] === 'clones') fetchClones(); if (tab[0] === 'store') fetchTemplates() }}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${activeTab === tab[0] ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {tab[1]}
            </button>
          ))}
        </div>
      </div>

      {/* Agent Clones */}
      {activeTab === 'clones' && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <button onClick={fetchClones} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm">
              {loading ? '加载中...' : '🔄 刷新'}
            </button>
            <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm">
              ➕ 创建克隆
            </button>
          </div>

          {clones.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {clones.map(clone => (
                <div key={clone.id} className={`bg-white rounded-xl p-5 shadow-sm border-2 ${clone.isActive ? 'border-green-200' : 'border-gray-100'}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        {clone.isActive && <span className="w-2 h-2 bg-green-500 rounded-full" />}
                        {clone.name}
                      </h3>
                      <p className="text-sm text-gray-500 mt-0.5">{clone.description || '无描述'}</p>
                    </div>
                    <button onClick={() => toggleClone(clone.id, clone.isActive)}
                      className={`px-3 py-1 rounded-full text-xs font-medium ${clone.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {clone.isActive ? '运行中' : '已停用'}
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-3 text-center">
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-lg font-bold text-gray-900">{clone.totalRuns}</p>
                      <p className="text-xs text-gray-500">总运行</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-lg font-bold text-indigo-600">{Math.round(clone.successRate * 100)}%</p>
                      <p className="text-xs text-gray-500">成功率</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-lg font-bold text-orange-600">Lv{clone.autonomyLevel}</p>
                      <p className="text-xs text-gray-500">自主度</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => { fetchActionLogs(clone.id); setActionLogs(clone.id as any) }}
                      className="flex-1 px-3 py-1.5 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 text-xs">
                      📋 操作日志
                    </button>
                    <button className="flex-1 px-3 py-1.5 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 text-xs">
                      ⚙️ 配置
                    </button>
                    <button className="px-3 py-1.5 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 text-xs">
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl p-12 shadow-sm text-center">
              <p className="text-4xl mb-4">🤖</p>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">还没有Agent克隆</h3>
              <p className="text-gray-500 mb-4">Agent克隆是您的工作分身，可以自动处理重复任务</p>
              <button className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium">
                创建第一个克隆
              </button>
            </div>
          )}

          {/* Action Logs */}
          {actionLogs.length > 0 && (
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-4">📋 最近操作日志</h3>
              <div className="space-y-2">
                {actionLogs.map(log => (
                  <div key={log.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full ${log.status === 'success' ? 'bg-green-500' : log.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                      <span className="text-sm text-gray-700">{log.actionType}</span>
                      <span className="text-xs text-gray-400 px-2 py-0.5 bg-gray-100 rounded">{log.status}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {log.reviewFeedback === 'pending' && (
                        <>
                          <button onClick={() => submitFeedback('approved', 'agent_action', log.id)}
                            className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">✅ 批准</button>
                          <button onClick={() => submitFeedback('rejected', 'agent_action', log.id)}
                            className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">❌ 拒绝</button>
                        </>
                      )}
                      <span className="text-xs text-gray-400">{new Date(log.executedAt).toLocaleString('zh')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Agent Store */}
      {activeTab === 'store' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input placeholder="搜索模板..." className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm" />
            <select className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option>全部分类</option>
              <option>productivity</option>
              <option>analysis</option>
              <option>creative</option>
              <option>management</option>
            </select>
          </div>

          {templates.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {templates.map(t => (
                <div key={t.id} className="bg-white rounded-xl p-5 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-gray-900">{t.name}</h3>
                      <p className="text-xs text-gray-500">{t.category} {t.isOwn && '· 自有'}</p>
                    </div>
                    {t.isOwn ? null : (
                      <span className="text-yellow-500">⭐ {t.rating.toFixed(1)}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{t.description || '暂无描述'}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">使用 {t.usageCount} 次</span>
                    <button onClick={() => useTemplate(t.id)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium ${t.isOwn ? 'border border-gray-300 text-gray-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                      {t.isOwn ? '编辑' : '使用模板'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl p-12 shadow-sm text-center">
              <button onClick={fetchTemplates} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                加载商店
              </button>
            </div>
          )}
        </div>
      )}

      {/* Feedback */}
      {activeTab === 'feedback' && (
        <div className="bg-white rounded-xl p-6 shadow-sm text-center">
          <p className="text-4xl mb-4">👍👎</p>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">帮助Claw成长</h3>
          <p className="text-gray-500 mb-6">对Claw的建议、提醒和摘要进行评价，帮助AI更好地为您服务</p>
          <div className="flex justify-center gap-4">
            {[['like', '👍 有帮助'], ['dislike', '👎 没帮助'], ['helpful', '💡 好建议'], ['not_helpful', '❌ 建议不好']].map(f => (
              <button key={f[0]} onClick={() => submitFeedback(f[0], 'general', 'feedback-form')}
                className="px-6 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 text-sm">
                {f[1]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
