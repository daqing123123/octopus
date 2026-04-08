'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

// ============================================
// 企业 Claw 管理页面 - 八爪鱼大脑视角
// 管理员管理所有触手（员工）的连接、入职、离职
// ============================================

export default function BrainDashboardPage() {
  const router = useRouter()
  const [dashboard, setDashboard] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [enterpriseId, setEnterpriseId] = useState('')

  useEffect(() => {
    // 从 URL 获取企业 ID 或使用默认
    const eid = new URLSearchParams(window.location.search).get('enterpriseId') || localStorage.getItem('currentEnterpriseId')
    if (eid) {
      setEnterpriseId(eid)
      fetchDashboard(eid)
    } else {
      setLoading(false)
    }
  }, [])

  const fetchDashboard = async (eid: string) => {
    try {
      const res = await fetch(`/api/enterprises/${eid}/claw/dashboard`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      const data = await res.json()
      if (data.success) setDashboard(data.data)
    } catch (e) {
      console.error('获取大脑状态失败', e)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">🦑 加载大脑状态中...</div>
      </div>
    )
  }

  if (!enterpriseId) {
    return (
      <div className="p-6 text-center">
        <div className="text-6xl mb-4">🏢</div>
        <h2 className="text-xl font-bold mb-2">请先选择企业</h2>
        <p className="text-gray-500">在企业列表中选择一个企业来管理其Claw</p>
      </div>
    )
  }

  const { enterpriseClaw, connections, onboarding, pending, todayEvents, recentActivity } = dashboard || {}

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-white text-2xl">
            🐙
          </div>
          <div>
            <h1 className="text-2xl font-bold">🏢 企业 Claw 控制台</h1>
            <p className="text-gray-500">八爪鱼大脑 · 管理所有触手</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 border rounded-lg hover:bg-gray-50">
            🧠 Claw设置
          </button>
          <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
            ⚡ 主动广播
          </button>
        </div>
      </div>

      {/* 核心统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">🔗</span>
            <span className="text-sm text-gray-500">触手连接</span>
          </div>
          <div className="text-3xl font-bold text-purple-600">{connections?.total || 0}</div>
          <div className="flex gap-3 mt-2 text-xs">
            <span className="text-green-600">● {connections?.active || 0} 活跃</span>
            <span className="text-yellow-600">● {connections?.idle || 0} 空闲</span>
            <span className="text-gray-400">● {connections?.disconnected || 0} 断开</span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">💪</span>
            <span className="text-sm text-gray-500">触手健康</span>
          </div>
          <div className="text-3xl font-bold text-green-600">{connections?.health?.healthy || 0}</div>
          <div className="flex gap-3 mt-2 text-xs">
            <span className="text-red-600">⚠ {connections?.health?.error || 0}</span>
            <span className="text-yellow-600">⚠ {connections?.health?.warning || 0}</span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">🎯</span>
            <span className="text-sm text-gray-500">入职进度</span>
          </div>
          <div className="text-3xl font-bold text-blue-600">{onboarding?.completed || 0}/{onboarding?.total || 0}</div>
          <div className="flex gap-3 mt-2 text-xs">
            <span className="text-gray-600">{onboarding?.inProgress || 0} 进行中</span>
            <span className="text-gray-400">{onboarding?.notStarted || 0} 未开始</span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">⏰</span>
            <span className="text-sm text-gray-500">待处理</span>
          </div>
          <div className="text-3xl font-bold text-orange-600">{(pending?.applications || 0) + (pending?.tasks || 0)}</div>
          <div className="flex gap-3 mt-2 text-xs">
            <span className="text-gray-600">申请 {pending?.applications || 0}</span>
            <span className="text-gray-600">任务 {pending?.tasks || 0}</span>
          </div>
        </div>
      </div>

      {/* 触手健康度可视化 */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {Array.from({ length: 6 }).map((_, i) => {
          const health = connections?.health
          const total = (health?.healthy || 0) + (health?.warning || 0) + (health?.error || 0)
          const healthyPct = total > 0 ? ((health?.healthy || 0) / total * 100) : 0
          return (
            <div key={i} className="h-3 rounded-full overflow-hidden bg-gray-100">
              <div
                className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all"
                style={{ width: `${healthyPct}%` }}
              />
            </div>
          )
        })}
        <div className="col-span-3 md:col-span-6 text-center text-xs text-gray-400 mt-1">
          触手健康度 {(connections?.health?.healthy || 0) / Math.max((connections?.health?.healthy || 0) + (connections?.health?.warning || 0) + (connections?.health?.error || 0), 1) * 100).toFixed(0)}%
        </div>
      </div>

      {/* 标签页 */}
      <div className="border-b">
        <div className="flex gap-4 flex-wrap">
          {[
            { key: 'overview', label: '📊 总览' },
            { key: 'tentacles', label: '🦑 触手列表' },
            { key: 'onboarding', label: '🎯 入职管理' },
            { key: 'offboarding', label: '📤 离职管理' },
            { key: 'templates', label: '📋 入职模板' },
            { key: 'insights', label: '🧠 团队洞察' },
            { key: 'announcements', label: '📢 公告' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 标签页内容 */}
      <div className="bg-white rounded-xl shadow-sm p-6 min-h-96">
        {activeTab === 'overview' && <OverviewTab dashboard={dashboard} />}
        {activeTab === 'tentacles' && <TentaclesTab enterpriseId={enterpriseId} />}
        {activeTab === 'onboarding' && <OnboardingTab enterpriseId={enterpriseId} />}
        {activeTab === 'offboarding' && <OffboardingTab enterpriseId={enterpriseId} />}
        {activeTab === 'templates' && <TemplatesTab enterpriseId={enterpriseId} />}
        {activeTab === 'insights' && <InsightsTab enterpriseId={enterpriseId} />}
        {activeTab === 'announcements' && <AnnouncementsTab enterpriseId={enterpriseId} />}
      </div>
    </div>
  )
}

// 子组件

function OverviewTab({ dashboard }: { dashboard: any }) {
  const { todayEvents, recentActivity } = dashboard || {}
  return (
    <div className="space-y-6">
      {/* 今日事件 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: '🎉', label: '今日入职', value: todayEvents?.onboarding_day || 0, color: 'text-green-600' },
          { icon: '👋', label: '今日离职', value: todayEvents?.offboarding_initiated || 0, color: 'text-red-600' },
          { icon: '📝', label: '新申请', value: todayEvents?.apply_request || 0, color: 'text-blue-600' },
          { icon: '🔄', label: '同步记录', value: todayEvents?.synced || 0, color: 'text-purple-600' },
        ].map((item, i) => (
          <div key={i} className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-3xl mb-1">{item.icon}</div>
            <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
            <div className="text-sm text-gray-500">{item.label}</div>
          </div>
        ))}
      </div>

      {/* 最近活动 */}
      <div>
        <h3 className="font-semibold mb-3">📋 最近活动</h3>
        <div className="space-y-2">
          {recentActivity?.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <div className="text-4xl mb-2">📭</div>
              <p>还没有活动记录</p>
            </div>
          )}
          {recentActivity?.map((activity: any, i: number) => (
            <div key={i} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg">
              <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-sm">
                {activity.employee?.avatarUrl ? (
                  <img src={activity.employee.avatarUrl} className="w-full h-full rounded-full" />
                ) : (
                  '👤'
                )}
              </div>
              <div className="flex-1">
                <div className="font-medium text-sm">{activity.employee?.name || '未知'}</div>
                <div className="text-xs text-gray-500">
                  {activity.eventName} · {new Date(activity.createdAt).toLocaleString()}
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded text-xs ${
                activity.actionTaken === 'connected' ? 'bg-green-100 text-green-700' :
                activity.actionTaken === 'disconnected' ? 'bg-red-100 text-red-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {activity.actionTaken}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TentaclesTab({ enterpriseId }: { enterpriseId: string }) {
  const [tentacles, setTentacles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (enterpriseId) fetchTentacles()
  }, [enterpriseId])

  const fetchTentacles = async () => {
    try {
      const res = await fetch(`/api/enterprises/${enterpriseId}/claw/tentacles`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      const data = await res.json()
      if (data.success) setTentacles(data.data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const filtered = tentacles.filter(t =>
    t.userName?.includes(search) || t.department?.includes(search)
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">🦑 所有触手 ({tentacles.length})</h3>
        <input
          type="text"
          placeholder="搜索触手..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-1 border rounded-lg text-sm"
        />
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">加载中...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-gray-400">还没有连接任何触手</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3">触手（员工）</th>
                <th className="text-left py-2 px-3">部门/职位</th>
                <th className="text-left py-2 px-3">Claw状态</th>
                <th className="text-left py-2 px-3">健康度</th>
                <th className="text-left py-2 px-3">入职进度</th>
                <th className="text-left py-2 px-3">最近活跃</th>
                <th className="text-left py-2 px-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.userId} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-sm">
                        {t.avatarUrl ? <img src={t.avatarUrl} className="w-full h-full rounded-full" /> : '🦑'}
                      </div>
                      <div>
                        <div className="font-medium">{t.userName}</div>
                        <div className="text-xs text-gray-400">{t.realName || t.userName}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    <div className="text-sm">{t.department || '未分配'}</div>
                    <div className="text-xs text-gray-400">{t.jobTitle || ''}</div>
                  </td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      t.claw.connectionStatus === 'connected' ? 'bg-green-100 text-green-700' :
                      t.claw.connectionStatus === 'idle' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {t.claw.connectionStatus === 'connected' ? '🟢 连接' :
                       t.claw.connectionStatus === 'idle' ? '🟡 空闲' : '⚫ 断开'}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      t.claw.health === 'healthy' ? 'bg-green-100 text-green-700' :
                      t.claw.health === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {t.claw.health || 'unknown'}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-600 rounded-full" style={{ width: `${t.onboarding.rate}%` }} />
                      </div>
                      <span className="text-xs">{t.onboarding.rate}%</span>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-xs text-gray-400">
                    {t.claw.lastActive ? new Date(t.claw.lastActive).toLocaleDateString() : '从未'}
                  </td>
                  <td className="py-2 px-3">
                    <button className="text-purple-600 text-xs hover:underline">查看详情 →</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function OnboardingTab({ enterpriseId }: { enterpriseId: string }) {
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (enterpriseId) fetchRequests()
  }, [enterpriseId])

  const fetchRequests = async () => {
    try {
      const res = await fetch(`/api/enterprises/${enterpriseId}/join-requests?status=pending`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      const data = await res.json()
      if (data.success) setRequests(data.data?.requests || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const handleProcess = async (requestId: string, approved: boolean, rejectReason?: string) => {
    try {
      const res = await fetch(`/api/enterprises/${enterpriseId}/join-requests/${requestId}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ approved, rejectReason })
      })
      if (res.ok) {
        fetchRequests()
      }
    } catch (e) { console.error(e) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">🎯 待审批加入申请 ({requests.length})</h3>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">加载中...</div>
      ) : requests.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <div className="text-4xl mb-2">✅</div>
          <p>没有待处理的申请</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <div key={req.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                    {req.applicant?.avatarUrl ? (
                      <img src={req.applicant.avatarUrl} className="w-full h-full rounded-full" />
                    ) : (
                      <span className="text-xl">👤</span>
                    )}
                  </div>
                  <div>
                    <div className="font-semibold">{req.applicant?.name}</div>
                    <div className="text-sm text-gray-500">{req.applicant?.email}</div>
                    <div className="flex gap-2 mt-1">
                      {req.applicant?.skills?.slice(0, 3).map((s: string, i: number) => (
                        <span key={i} className="px-2 py-0.5 bg-gray-100 rounded text-xs">{s}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleProcess(req.id, true)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                  >
                    ✅ 批准
                  </button>
                  <button
                    onClick={() => {
                      const reason = prompt('请输入拒绝原因（可选）：')
                      handleProcess(req.id, false, reason || undefined)
                    }}
                    className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 text-sm"
                  >
                    ❌ 拒绝
                  </button>
                </div>
              </div>
              {req.message && (
                <div className="mt-3 p-2 bg-gray-50 rounded text-sm text-gray-600">
                  申请留言：{req.message}
                </div>
              )}
              <div className="text-xs text-gray-400 mt-2">
                申请时间：{new Date(req.createdAt).toLocaleString()} · 申请角色：{req.applyRole}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function OffboardingTab({ enterpriseId }: { enterpriseId: string }) {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (enterpriseId) fetchItems()
  }, [enterpriseId])

  const fetchItems = async () => {
    try {
      const res = await fetch(`/api/enterprises/${enterpriseId}/offboarding/items?status=not_returned`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      const data = await res.json()
      if (data.success) setItems(data.data || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const handleReturn = async (itemId: string) => {
    try {
      await fetch(`/api/enterprises/${enterpriseId}/offboarding/items/${itemId}/return`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({})
      })
      fetchItems()
    } catch (e) { console.error(e) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">📤 离职物品管理</h3>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">加载中...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <div className="text-4xl mb-2">📦</div>
          <p>没有待归还的物品</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((employee: any) => (
            <div key={employee.employeeId} className="border rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  {employee.employeeAvatar ? (
                    <img src={employee.employeeAvatar} className="w-full h-full rounded-full" />
                  ) : '👤'}
                </div>
                <div className="font-semibold">{employee.employeeName}</div>
              </div>
              <div className="space-y-2">
                {employee.items?.map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <div>
                      <div className="font-medium text-sm">{item.itemName}</div>
                      <div className="text-xs text-gray-400">{item.serialNumber || item.itemType}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        item.returnStatus === 'returned' ? 'bg-green-100 text-green-700' :
                        item.returnStatus === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {item.returnStatus === 'returned' ? '✅ 已归还' :
                         item.returnStatus === 'pending' ? '⏳ 待归还' : '❌ 未归还'}
                      </span>
                      {item.returnStatus !== 'returned' && (
                        <button
                          onClick={() => handleReturn(item.id)}
                          className="px-2 py-1 border rounded text-xs hover:bg-white"
                        >
                          标记归还
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TemplatesTab({ enterpriseId }: { enterpriseId: string }) {
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (enterpriseId) fetchTemplates()
  }, [enterpriseId])

  const fetchTemplates = async () => {
    try {
      const res = await fetch(`/api/enterprises/${enterpriseId}/onboarding/templates`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      const data = await res.json()
      if (data.success) setTemplates(data.data || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">📋 入职模板库</h3>
        <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm">
          ➕ 创建模板
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">加载中...</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <div className="text-4xl mb-2">📋</div>
          <p>还没有入职模板</p>
          <p className="text-xs mt-1">创建模板后可为新员工批量分配入职任务</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map(t => (
            <div key={t.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{t.icon || '📋'}</span>
                <div>
                  <div className="font-semibold">{t.name}</div>
                  {t.isDefault && <span className="text-xs bg-purple-100 text-purple-700 px-2 rounded">默认</span>}
                </div>
              </div>
              <div className="text-sm text-gray-500 mb-3">{t.description || '无描述'}</div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">{t.items?.length || 0} 个任务 · 已使用 {t.usedCount} 次</span>
                <button className="text-sm text-purple-600 hover:underline">编辑 →</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function InsightsTab({ enterpriseId }: { enterpriseId: string }) {
  const [insights, setInsights] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (enterpriseId) fetchInsights()
  }, [enterpriseId])

  const fetchInsights = async () => {
    try {
      const res = await fetch(`/api/enterprises/${enterpriseId}/claw/insights`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      const data = await res.json()
      if (data.success) setInsights(data.data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  if (loading) return <div className="text-center py-8 text-gray-400">加载中...</div>

  const { teamComposition, skills, clawHealth, onboarding } = insights || {}

  return (
    <div className="space-y-6">
      {/* 团队组成 */}
      <div>
        <h3 className="font-semibold mb-3">👥 团队组成</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {teamComposition?.byDepartment?.slice(0, 4).map((d: any, i: number) => (
            <div key={i} className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{d.count}</div>
              <div className="text-sm text-gray-600">{d.department}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 技能分布 */}
      <div>
        <h3 className="font-semibold mb-3">🎯 技能分布（Top 10）</h3>
        <div className="flex flex-wrap gap-2">
          {skills?.top?.slice(0, 10).map((s: any, i: number) => (
            <div key={i} className="flex items-center gap-1 px-3 py-1 bg-purple-50 rounded-full">
              <span className="text-sm text-purple-700">{s.skill}</span>
              <span className="text-xs bg-purple-200 text-purple-800 px-1.5 rounded-full">{s.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 入职完成率 */}
      <div>
        <h3 className="font-semibold mb-3">📊 入职完成率</h3>
        <div className="flex items-center gap-4">
          <div className="w-full h-6 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-end pr-2"
              style={{ width: `${onboarding?.avgCompletionRate || 0}%` }}
            >
              <span className="text-xs text-white font-medium">{(onboarding?.avgCompletionRate || 0).toFixed(0)}%</span>
            </div>
          </div>
        </div>
        <div className="flex gap-4 mt-2 text-sm text-gray-500">
          <span>✅ 完全入职：{onboarding?.fullyOnboarded || 0} 人</span>
          <span>⚠️ 需要关注：{onboarding?.needsAttention || 0} 人</span>
        </div>
      </div>
    </div>
  )
}

function AnnouncementsTab({ enterpriseId }: { enterpriseId: string }) {
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (enterpriseId) fetchAnnouncements()
  }, [enterpriseId])

  const fetchAnnouncements = async () => {
    try {
      const res = await fetch(`/api/enterprises/${enterpriseId}/announcements`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      const data = await res.json()
      if (data.success) setAnnouncements(data.data?.announcements || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const handlePublish = () => {
    // TODO: 打开发布公告弹窗
    alert('发布公告功能开发中...')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">📢 公告管理</h3>
        <button
          onClick={handlePublish}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
        >
          📝 发布公告
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">加载中...</div>
      ) : announcements.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <div className="text-4xl mb-2">📢</div>
          <p>还没有发布公告</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map(a => (
            <div key={a.id} className={`p-4 border rounded-lg ${a.pinned ? 'bg-yellow-50 border-yellow-300' : ''}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {a.pinned && <span className="text-yellow-500">📌</span>}
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      a.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                      a.priority === 'important' ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {a.priority === 'urgent' ? '🔥 紧急' :
                       a.priority === 'important' ? '⭐ 重要' : '普通'}
                    </span>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 rounded">{a.category}</span>
                  </div>
                  <div className="font-semibold mt-1">{a.title}</div>
                  <div className="text-sm text-gray-500 mt-1 line-clamp-2">{a.content}</div>
                </div>
                <div className="text-right text-xs text-gray-400 ml-4">
                  <div>{a.author?.name}</div>
                  <div>{new Date(a.createdAt).toLocaleDateString()}</div>
                  <div>👁 {a.readCount}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
