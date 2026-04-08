'use client'
import { useState, useEffect } from 'react'

export default function PrivacyDashboard() {
  const [dashboard, setDashboard] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchDashboard() }, [])

  const fetchDashboard = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/claw/privacy/dashboard')
      const data = await res.json()
      setDashboard(data.data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const updateSetting = async (key: string, value: any) => {
    setSaving(true)
    try {
      await fetch('/api/claw/privacy/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value })
      })
      await fetchDashboard()
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  const requestExport = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/claw/privacy/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const data = await res.json()
      if (data.success) {
        const blob = new Blob([JSON.stringify(data.data.exportData, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `octopus-data-export-${new Date().toISOString().split('T')[0]}.json`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  if (loading && !dashboard) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" /></div>
  }

  if (!dashboard) return null

  const { privacyScore, settings, dataStats, recentAccess, enterpriseSharing, tips } = dashboard

  const scoreColor = privacyScore >= 80 ? 'green' : privacyScore >= 60 ? 'yellow' : 'red'
  const scoreLabel = privacyScore >= 80 ? '优秀' : privacyScore >= 60 ? '一般' : '需改进'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">🔒 隐私控制</h2>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-sm font-medium bg-${scoreColor}-100 text-${scoreColor}-700`}>
            隐私评分: {privacyScore} ({scoreLabel})
          </span>
          <button
            onClick={requestExport}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm disabled:opacity-50"
          >
            {loading ? '导出中...' : '📥 一键导出数据'}
          </button>
        </div>
      </div>

      {/* Tips */}
      {tips && tips.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
          {tips.map((tip: string, i: number) => (
            <p key={i} className="text-amber-800 text-sm flex items-start gap-2">
              <span>{tip.startsWith('⚠️') ? '⚠️' : tip.startsWith('✅') ? '✅' : '💡'}</span>
              <span>{tip.replace(/^[^\s]+\s/, '')}</span>
            </p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Data Collection */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-4">📊 数据收集</h3>
          <div className="space-y-4">
            {[
              { key: 'collectUsageData', label: '使用行为数据', desc: '记录您使用各功能的情况', value: settings.dataCollection.usageData },
              { key: 'collectHabitData', label: '习惯数据', desc: '学习您的使用习惯', value: settings.dataCollection.habitData },
              { key: 'collectAiConversations', label: 'AI对话记录', desc: '保存与AI的对话内容', value: settings.dataCollection.aiConversations },
              { key: 'collectProductivityData', label: '生产力数据', desc: '记录您的效率指标', value: settings.dataCollection.productivityData },
            ].map(item => (
              <div key={item.key} className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="font-medium text-gray-800 text-sm">{item.label}</p>
                  <p className="text-xs text-gray-500">{item.desc}</p>
                </div>
                <button
                  onClick={() => updateSetting(item.key, !item.value)}
                  disabled={saving}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    item.value ? 'bg-indigo-600' : 'bg-gray-200'
                  }`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    item.value ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Enterprise Sharing */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-4">🏢 企业数据共享</h3>
          <div className="space-y-4">
            <div>
              <p className="font-medium text-gray-800 text-sm mb-2">共享模式</p>
              <select
                value={settings.enterpriseSharing.mode}
                onChange={e => updateSetting('shareWithEnterprise', e.target.value)}
                disabled={saving}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              >
                <option value="none">不共享</option>
                <option value="minimal">最小共享（仅基础信息）</option>
                <option value="full">完整共享</option>
              </select>
            </div>
            {[
              { key: 'shareWorkingStyle', label: '工作风格', desc: '共享您的最佳工作时段等', value: settings.enterpriseSharing.workingStyle },
              { key: 'shareAiPreferences', label: 'AI偏好', desc: '共享AI使用习惯', value: settings.enterpriseSharing.aiPreferences },
              { key: 'shareProductivityStats', label: '生产力统计', desc: '共享效率数据', value: settings.enterpriseSharing.productivityStats },
            ].map(item => (
              <div key={item.key} className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="font-medium text-gray-800 text-sm">{item.label}</p>
                  <p className="text-xs text-gray-500">{item.desc}</p>
                </div>
                <button
                  onClick={() => updateSetting(item.key, !item.value)}
                  disabled={saving}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    item.value ? 'bg-indigo-600' : 'bg-gray-200'
                  }`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    item.value ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Retention */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-4">⏱️ 数据保留策略</h3>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">短期记忆保留</label>
              <p className="text-xs text-gray-500 mb-2">超过此天数自动转为长期记忆</p>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="7"
                  max="365"
                  step="7"
                  value={settings.retention.shortTermMemoryDays}
                  onChange={e => updateSetting('memoryRetentionDays', parseInt(e.target.value))}
                  disabled={saving}
                  className="flex-1"
                />
                <span className="text-sm font-medium w-20 text-right">{settings.retention.shortTermMemoryDays} 天</span>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">自动遗忘</label>
              <p className="text-xs text-gray-500 mb-2">超过此天数自动删除旧数据</p>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="30"
                  max="3650"
                  step="30"
                  value={settings.retention.autoForgetDays}
                  onChange={e => updateSetting('autoForgetDays', parseInt(e.target.value))}
                  disabled={saving}
                  className="flex-1"
                />
                <span className="text-sm font-medium w-20 text-right">{settings.retention.autoForgetDays} 天</span>
              </div>
            </div>
            <div className="flex items-start justify-between gap-3 pt-2">
              <div className="flex-1">
                <p className="font-medium text-gray-800 text-sm">跨企业同步</p>
                <p className="text-xs text-gray-500">允许习惯在企业间同步</p>
              </div>
              <button
                onClick={() => updateSetting('allowCrossEnterpriseSync', !settings.retention.crossEnterpriseSync)}
                disabled={saving}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  settings.retention.crossEnterpriseSync ? 'bg-indigo-600' : 'bg-gray-200'
                }`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  settings.retention.crossEnterpriseSync ? 'translate-x-6' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
            {settings.lastExportAt && (
              <p className="text-xs text-gray-500 pt-2">
                上次导出: {new Date(settings.lastExportAt).toLocaleString('zh')} ({settings.exportCount}次)
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Data Stats */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-gray-900 mb-4">📦 您的数据资产</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: '记忆', value: dataStats.memories, icon: '🧠' },
            { label: '习惯', value: dataStats.habits, icon: '🎯' },
            { label: '知识节点', value: dataStats.knowledgeNodes, icon: '🕸️' },
            { label: '对话记忆', value: dataStats.conversations, icon: '💬' },
            { label: '提醒', value: dataStats.reminders, icon: '⏰' },
            { label: '联系人', value: dataStats.contacts, icon: '👥' },
          ].map((item, i) => (
            <div key={i} className="text-center p-3 bg-gray-50 rounded-lg">
              <span className="text-2xl">{item.icon}</span>
              <p className="text-2xl font-bold text-gray-900 mt-1">{item.value}</p>
              <p className="text-xs text-gray-500">{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Access Log */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-gray-900 mb-4">🔍 访问日志</h3>
        {recentAccess && recentAccess.length > 0 ? (
          <div className="space-y-2">
            {recentAccess.map((log: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-700">{log.accessor || '系统'}</span>
                  <span className="text-xs text-gray-500 px-2 py-0.5 bg-gray-100 rounded">{log.type}</span>
                </div>
                <span className="text-xs text-gray-400">{new Date(log.time).toLocaleString('zh')}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm text-center py-4">暂无访问记录</p>
        )}
      </div>
    </div>
  )
}
