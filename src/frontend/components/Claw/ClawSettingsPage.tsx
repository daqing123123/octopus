'use client'

import React, { useState, useEffect } from 'react'

interface ClawInfo {
  id: string
  name: string
  userName: string
  userEmail: string
  config: any
  storage: {
    used: number
    quota: number
    percent: number
    usedFormatted: string
    quotaFormatted: string
  }
  stats: {
    connectedEnterprises: number
    activeAgents: number
    habits: number
    totalActions: number
  }
  createdAt: string
  updatedAt: string
}

interface Connection {
  id: string
  enterprise_id: string
  enterprise_name: string
  logo_url: string
  plan: string
  role: string
  status: string
  connected_at: string
  disconnected_at: string
  learned_habits: number
}

interface HabitSyncStatus {
  connectionId: string
  personalHabitCount: number
  totalActions: number
  syncedToEnterprise: boolean
  lastSyncTime: string | null
  syncStatus: string
}

export default function ClawSettingsPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'memories' | 'agents' | 'connections' | 'habits'>('overview')
  const [clawInfo, setClawInfo] = useState<ClawInfo | null>(null)
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadClawData()
  }, [])

  const loadClawData = async () => {
    try {
      const [clawRes, connRes] = await Promise.all([
        fetch('/api/claw/personal/me'),
        fetch('/api/claw/personal/connections')
      ])
      const clawData = await clawRes.json()
      const connData = await connRes.json()
      if (clawData.success) setClawInfo(clawData.data)
      if (connData.success) setConnections(connData.data.connections)
    } catch (error) {
      console.error('Failed to load Claw data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (!clawInfo) {
    return <div className="p-8 text-center text-gray-500">无法加载Claw信息</div>
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* 头部 */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-2xl">
            🐙
          </div>
          <div>
            <h1 className="text-2xl font-bold">{clawInfo.name}</h1>
            <p className="text-gray-500">{clawInfo.userName} · {clawInfo.userEmail}</p>
          </div>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard icon="🏢" label="连接企业" value={clawInfo.stats.connectedEnterprises} color="blue" />
        <StatCard icon="🤖" label="活跃Agent" value={clawInfo.stats.activeAgents} color="purple" />
        <StatCard icon="📊" label="习惯数量" value={clawInfo.stats.habits} color="green" />
        <StatCard icon="⚡" label="累计操作" value={clawInfo.stats.totalActions} color="orange" />
      </div>

      {/* 存储进度 */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h3 className="font-semibold mb-4">存储空间</h3>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all"
                style={{ width: `${clawInfo.storage.percent}%` }}
              />
            </div>
          </div>
          <span className="text-sm text-gray-600">
            {clawInfo.storage.usedFormatted} / {clawInfo.storage.quotaFormatted}
          </span>
        </div>
      </div>

      {/* 标签页 */}
      <div className="border-b mb-6">
        <nav className="flex gap-6">
          {[
            { id: 'overview', label: '概览' },
            { id: 'memories', label: '记忆' },
            { id: 'agents', label: 'Agent' },
            { id: 'connections', label: '企业连接' },
            { id: 'habits', label: '习惯分析' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-3 px-1 border-b-2 transition-colors ${
                activeTab === tab.id 
                  ? 'border-blue-500 text-blue-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 标签页内容 */}
      {activeTab === 'overview' && <OverviewTab clawInfo={clawInfo} />}
      {activeTab === 'memories' && <MemoriesTab />}
      {activeTab === 'agents' && <AgentsTab />}
      {activeTab === 'connections' && <ConnectionsTab connections={connections} onRefresh={loadClawData} />}
      {activeTab === 'habits' && <HabitsTab />}
    </div>
  )
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    green: 'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-orange-600'
  }
  
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  )
}

function OverviewTab({ clawInfo }: { clawInfo: ClawInfo }) {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="font-semibold mb-4">基本信息</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Claw ID</p>
            <p className="font-mono text-sm">{clawInfo.id}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">创建时间</p>
            <p>{new Date(clawInfo.createdAt).toLocaleDateString()}</p>
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="font-semibold mb-4">连接流程</h3>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-2xl">🧠</div>
          <div className="flex-1">
            <p className="font-medium">个人Claw</p>
            <p className="text-sm text-gray-500">记录您的习惯、记忆和偏好</p>
          </div>
        </div>
        <div className="flex justify-center my-4">
          <span className="text-2xl">→</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-2xl">🏢</div>
          <div className="flex-1">
            <p className="font-medium">企业Claw</p>
            <p className="text-sm text-gray-500">学习您的习惯，提供企业级服务</p>
          </div>
        </div>
        <div className="mt-4 p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
          <p>💡 您的个人Claw会随您到任何企业。加入新企业时，可选择同步部分习惯；离职时一键断开，企业数据留在企业。</p>
        </div>
      </div>
    </div>
  )
}

function MemoriesTab() {
  const [memories, setMemories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/claw/personal/memories')
      .then(res => res.json())
      .then(data => {
        if (data.success) setMemories(data.data.memories)
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold">记忆列表</h3>
        <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
          + 添加记忆
        </button>
      </div>
      
      {loading ? (
        <div className="text-center py-8 text-gray-500">加载中...</div>
      ) : memories.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p className="text-4xl mb-4">🧠</p>
          <p>暂无记忆</p>
          <p className="text-sm">开始使用平台，Claw会自动记录重要信息</p>
        </div>
      ) : (
        <div className="space-y-3">
          {memories.map(memory => (
            <div key={memory.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-start mb-2">
                <span className={`px-2 py-1 rounded text-xs ${
                  memory.memory_type === 'long_term' ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-600'
                }`}>
                  {memory.memory_type === 'long_term' ? '长期记忆' : '短期记忆'}
                </span>
                <span className="text-xs text-gray-400">
                  访问 {memory.access_count} 次
                </span>
              </div>
              <p className="text-gray-700">{memory.content_preview}...</p>
              <p className="text-xs text-gray-400 mt-2">
                {new Date(memory.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AgentsTab() {
  const [agents, setAgents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/claw/personal/agents')
      .then(res => res.json())
      .then(data => {
        if (data.success) setAgents(data.data)
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold">个人Agent</h3>
        <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
          + 创建Agent
        </button>
      </div>
      
      {loading ? (
        <div className="text-center py-8 text-gray-500">加载中...</div>
      ) : agents.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p className="text-4xl mb-4">🤖</p>
          <p>暂无Agent</p>
          <p className="text-sm">创建专属AI助手</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {agents.map(agent => (
            <div key={agent.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center text-white">
                  🤖
                </div>
                <div>
                  <p className="font-medium">{agent.name}</p>
                  <p className="text-xs text-gray-500">{agent.model_id}</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-3">{agent.description || '暂无描述'}</p>
              <div className="flex justify-between items-center">
                <span className={`px-2 py-1 rounded text-xs ${
                  agent.is_active ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'
                }`}>
                  {agent.is_active ? '运行中' : '已停止'}
                </span>
                <button className="text-blue-500 text-sm hover:underline">编辑</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ConnectionsTab({ connections, onRefresh }: { connections: Connection[]; onRefresh: () => void }) {
  const [syncing, setSyncing] = useState<string | null>(null)
  const [syncResults, setSyncResults] = useState<Record<string, any>>({})

  const handleSync = async (enterpriseId: string) => {
    setSyncing(enterpriseId)
    try {
      const res = await fetch(`/api/enterprises/${enterpriseId}/habit-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          minFrequency: 3,
          includeWorkingStyle: true,
          includeAiPreferences: true
        })
      })
      const data = await res.json()
      setSyncResults(prev => ({ ...prev, [enterpriseId]: data }))
      onRefresh()
    } catch (error) {
      console.error('Sync failed:', error)
    } finally {
      setSyncing(null)
    }
  }

  const handleDisconnect = async (enterpriseId: string, enterpriseName: string) => {
    if (!confirm(`确定退出 ${enterpriseName} 吗？\n\n您的个人数据将保留，企业数据将留在企业。`)) {
      return
    }
    try {
      const res = await fetch(`/api/enterprises/${enterpriseId}/disconnect`, {
        method: 'POST'
      })
      const data = await res.json()
      if (data.success) {
        alert('已成功退出企业')
        onRefresh()
      } else if (data.code === 'OWNER_CANNOT_DISCONNECT') {
        alert('企业所有者不能直接退出，请先转让所有权')
      }
    } catch (error) {
      console.error('Disconnect failed:', error)
    }
  }

  const activeConnections = connections.filter(c => c.status === 'active')
  const inactiveConnections = connections.filter(c => c.status === 'inactive')

  return (
    <div className="space-y-6">
      {/* 活跃连接 */}
      <div>
        <h3 className="font-semibold mb-4">活跃连接 ({activeConnections.length})</h3>
        {activeConnections.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            <p className="text-4xl mb-4">🏢</p>
            <p>暂未连接任何企业</p>
            <p className="text-sm">加入企业，开始您的协作之旅</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeConnections.map(conn => (
              <div key={conn.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center text-white">
                    {conn.logo_url ? (
                      <img src={conn.logo_url} className="w-full h-full rounded-full" />
                    ) : (
                      <span className="text-xl">{conn.enterprise_name[0]}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{conn.enterprise_name}</p>
                    <p className="text-sm text-gray-500">
                      {conn.role} · 已连接 {new Date(conn.connected_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">
                      已学习 {conn.learned_habits} 项习惯
                    </p>
                    <p className={`text-xs ${conn.plan === 'free' ? 'text-gray-400' : 'text-blue-500'}`}>
                      {conn.plan.toUpperCase()}
                    </p>
                  </div>
                </div>
                
                {/* 同步结果提示 */}
                {syncResults[conn.enterprise_id] && (
                  <div className="mt-3 p-3 bg-green-50 rounded-lg text-sm text-green-700">
                    ✅ {syncResults[conn.enterprise_id].message}
                  </div>
                )}
                
                <div className="flex gap-2 mt-4">
                  <button 
                    onClick={() => handleSync(conn.enterprise_id)}
                    disabled={syncing === conn.enterprise_id}
                    className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50"
                  >
                    {syncing === conn.enterprise_id ? '同步中...' : '🔄 同步习惯'}
                  </button>
                  <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                    查看详情
                  </button>
                  {conn.role !== 'owner' && (
                    <button 
                      onClick={() => handleDisconnect(conn.enterprise_id, conn.enterprise_name)}
                      className="px-4 py-2 border border-red-300 text-red-500 rounded-lg hover:bg-red-50"
                    >
                      🚪 退出
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 历史连接 */}
      {inactiveConnections.length > 0 && (
        <div>
          <h3 className="font-semibold mb-4 text-gray-500">历史连接 ({inactiveConnections.length})</h3>
          <div className="space-y-3">
            {inactiveConnections.map(conn => (
              <div key={conn.id} className="bg-gray-50 rounded-lg p-4 opacity-75">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-gray-500">
                    {conn.enterprise_name[0]}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{conn.enterprise_name}</p>
                    <p className="text-sm text-gray-400">
                      已断开 · {conn.disconnected_at ? new Date(conn.disconnected_at).toLocaleDateString() : '未知'}
                    </p>
                  </div>
                  <button className="px-3 py-1 text-blue-500 text-sm hover:underline">
                    重新加入
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function HabitsTab() {
  const [analysis, setAnalysis] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/claw/personal/habits/analysis')
      .then(res => res.json())
      .then(data => {
        if (data.success) setAnalysis(data.data)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="text-center py-8 text-gray-500">加载中...</div>
  }

  if (!analysis) {
    return <div className="text-center py-8 text-gray-500">无法加载分析</div>
  }

  return (
    <div className="space-y-6">
      {/* 概览 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <p className="text-3xl font-bold text-purple-500">{analysis.totalHabits}</p>
          <p className="text-gray-500">习惯类型</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <p className="text-3xl font-bold text-blue-500">{analysis.totalActions}</p>
          <p className="text-gray-500">累计操作</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <p className="text-3xl font-bold text-green-500">{analysis.categories.length}</p>
          <p className="text-gray-500">功能分类</p>
        </div>
      </div>

      {/* 分类分布 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="font-semibold mb-4">功能使用分布</h3>
        <div className="space-y-3">
          {analysis.categoryDistribution.map((cat: any) => (
            <div key={cat.category} className="flex items-center gap-4">
              <div className="w-20 text-sm text-gray-600">{cat.category}</div>
              <div className="flex-1">
                <div className="h-6 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-purple-500 to-blue-500"
                    style={{ width: `${cat.percent}%` }}
                  />
                </div>
              </div>
              <div className="w-20 text-sm text-gray-500 text-right">{cat.percent}%</div>
            </div>
          ))}
        </div>
      </div>

      {/* Top 习惯 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="font-semibold mb-4">高频习惯 Top 10</h3>
        <div className="space-y-2">
          {analysis.topHabits.map((habit: any, index: number) => (
            <div key={index} className="flex items-center gap-4 py-2 border-b last:border-0">
              <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 text-center text-sm">
                {index + 1}
              </span>
              <span className="flex-1 font-mono text-sm">{habit.type}</span>
              <span className="text-gray-500">{habit.frequency}次</span>
              <span className="text-xs text-gray-400">
                {habit.lastUsed ? new Date(habit.lastUsed).toLocaleDateString() : '从未'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 建议 */}
      <div className="bg-purple-50 rounded-lg p-6">
        <h3 className="font-semibold mb-4">💡 Claw建议</h3>
        <ul className="space-y-2">
          {analysis.suggestions.map((suggestion: string, index: number) => (
            <li key={index} className="flex items-start gap-2 text-purple-700">
              <span>•</span>
              <span>{suggestion}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
