'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  PageHeader, Card, Badge, ProgressRing, StatCard,
  EmptyState, Button, Drawer, TabSwitch,
  MobileTabBar, Divider, Toast, useBreakpoint, ListItem
} from '../Shared/ResponsiveComponents'

// ============================================
// 档案完善度评分页面 - 触手视角 + 大脑视角
// ============================================

export default function ProfileCompletenessPage({ enterpriseId, view = 'tentacle' }: { enterpriseId?: string; view?: 'tentacle' | 'brain' }) {
  const bp = useBreakpoint()
  const isMobile = bp === 'mobile'

  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [toast, setToast] = useState<any>(null)

  const fetchData = useCallback(async () => {
    try {
      const endpoint = view === 'brain' && enterpriseId
        ? `/api/enterprises/${enterpriseId}/profile-completeness/stats`
        : `/api/me/profile-completeness${enterpriseId ? `?enterpriseId=${enterpriseId}` : ''}`

      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      const result = await res.json()
      if (result.success) setData(result.data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [enterpriseId, view])

  useEffect(() => { fetchData() }, [fetchData])

  const gradeColors: Record<string, { bg: string; text: string; label: string }> = {
    S: { bg: 'from-yellow-400 to-orange-500', text: 'text-orange-600', label: '完美' },
    A: { bg: 'from-green-400 to-green-600', text: 'text-green-600', label: '优秀' },
    B: { bg: 'from-blue-400 to-blue-600', text: 'text-blue-600', label: '良好' },
    C: { bg: 'from-yellow-400 to-yellow-600', text: 'text-yellow-600', label: '一般' },
    D: { bg: 'from-red-400 to-red-600', text: 'text-red-600', label: '待完善' },
  }

  if (loading) return <div className="p-6 text-center text-gray-400">{view === 'brain' ? '加载团队统计...' : '加载档案评分...'}</div>

  // ===== 触手视角 =====
  if (view === 'tentacle') {
    const gradeInfo = gradeColors[data?.grade || 'D']

    if (!data) {
      return <EmptyState icon="📋" title="暂无评分数据" description="请完善您的档案信息" />
    }

    if (!isMobile) {
      // PC端
      return (
        <div className="max-w-5xl mx-auto p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">📋</span>
              <div>
                <h1 className="text-2xl font-bold">档案完善度</h1>
                <p className="text-gray-500">触手档案评分 · {data.completedFields}/{data.totalFields} 项已完善</p>
              </div>
            </div>
            <Badge label={`${data.grade}级`} color="purple" size="md" />
          </div>

          {/* 总分卡片 */}
          <Card>
            <div className="flex items-center gap-8">
              <ProgressRing percent={data.percent} size={120} color="#8b5cf6" label="总分" />
              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-4">
                  <div className={`text-5xl font-bold bg-gradient-to-r ${gradeInfo.bg} bg-clip-text text-transparent`}>
                    {data.grade}
                  </div>
                  <div>
                    <div className={`text-2xl font-bold ${gradeInfo.text}`}>{gradeInfo.label}</div>
                    <div className="text-sm text-gray-500">档案评级</div>
                  </div>
                </div>
                <div className="flex gap-4">
                  <StatCard icon="✅" label="已完善" value={data.completedFields} color="green" />
                  <StatCard icon="⏳" label="待完善" value={data.totalFields - data.completedFields} color="orange" />
                  <StatCard icon="🎯" label="完成率" value={`${data.percent}%`} color="purple" />
                </div>
              </div>
            </div>
          </Card>

          {/* 完善建议 */}
          {data.suggestedNext?.length > 0 && (
            <Card title="💡 快速完善" icon="💡">
              <div className="grid grid-cols-2 gap-3">
                {data.suggestedNext.map((s: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 p-3 bg-purple-50 rounded-lg">
                    <span className="text-lg">📝</span>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{s.field}</div>
                      <div className="text-xs text-gray-500">+{s.weight}分</div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setActiveTab('detail')}>
                      完善 →
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* 必填缺失 */}
          {data.missingRequired?.length > 0 && (
            <Card title="⚠️ 必填项未完善" icon="⚠️">
              <div className="space-y-2">
                {data.missingRequired.map((m: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-red-50 rounded-lg">
                    <span className="text-red-500">❌</span>
                    <span className="text-sm">{m.field}</span>
                    <Badge label="必填" color="red" />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* 分组详情 */}
          <TabSwitch
            tabs={[
              { id: 'overview', label: '📊 概览' },
              { id: 'detail', label: '📋 详情' },
            ]}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />

          {activeTab === 'detail' && (
            <div className="space-y-4">
              {data.groups?.map((group: any) => (
                <Card key={group.label} title={group.label} padding={false}>
                  <div className="divide-y">
                    {group.items.map((item: any, i: number) => (
                      <div key={i} className="flex items-center justify-between px-6 py-3">
                        <div className="flex items-center gap-3">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                            item.filled ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                          }`}>
                            {item.filled ? '✅' : '○'}
                          </span>
                          <span className={item.filled ? '' : 'text-gray-400'}>
                            {item.field}
                          </span>
                          {item.isRequired && <Badge label="必填" color="red" size="sm" />}
                        </div>
                        <div className="flex items-center gap-3">
                          {item.value && <span className="text-sm text-gray-500">{item.value}</span>}
                          <span className="text-sm font-medium text-purple-600">+{item.score}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="px-6 py-2 bg-gray-50 flex justify-between text-sm">
                    <span>小计</span>
                    <span className="font-medium">{group.score}/{group.maxScore} ({group.percent}%)</span>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* 提升建议 */}
          {activeTab === 'overview' && data.tips?.length > 0 && (
            <Card title="💡 提升建议" icon="💡">
              <ul className="space-y-2">
                {data.tips.map((tip: string, i: number) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="text-purple-500">•</span> {tip}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )
    }

    // 手机端
    return (
      <div className="flex flex-col h-full bg-gray-50">
        <PageHeader title="档案完善度" icon="📋" />

        <div className="flex-1 overflow-y-auto pb-16">
          {/* 进度环 */}
          <div className="bg-white p-6 text-center">
            <ProgressRing percent={data.percent} size={140} color="#8b5cf6" label={`${data.percent}%`} />
            <div className={`mt-3 text-4xl font-bold bg-gradient-to-r ${gradeInfo.bg} bg-clip-text text-transparent`}>
              {data.grade}级
            </div>
            <div className="text-sm text-gray-500">{gradeInfo.label} · 已完善 {data.completedFields}/{data.totalFields} 项</div>
          </div>

          {/* 快速完善 */}
          {data.suggestedNext?.length > 0 && (
            <div className="px-4 mt-4">
              <h3 className="text-sm font-semibold text-gray-500 mb-2">💡 快速完善</h3>
              <div className="space-y-2">
                {data.suggestedNext.map((s: any, i: number) => (
                  <div key={i} className="bg-white rounded-xl p-4 flex items-center gap-3">
                    <span className="text-2xl">📝</span>
                    <div className="flex-1">
                      <div className="font-medium text-sm">{s.field}</div>
                      <div className="text-xs text-gray-400">+{s.weight}分</div>
                    </div>
                    <Badge label={`+${s.weight}`} color="purple" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 必填缺失 */}
          {data.missingRequired?.length > 0 && (
            <div className="px-4 mt-4">
              <h3 className="text-sm font-semibold text-red-500 mb-2">⚠️ 必填项</h3>
              <div className="space-y-2">
                {data.missingRequired.map((m: any, i: number) => (
                  <div key={i} className="bg-red-50 rounded-xl p-4 flex items-center gap-2">
                    <span>❌</span>
                    <span className="text-sm">{m.field}</span>
                    <Badge label="必填" color="red" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 分组详情 */}
          <div className="px-4 mt-4">
            <h3 className="text-sm font-semibold text-gray-500 mb-2">📊 各项完善度</h3>
            <div className="space-y-3">
              {data.groups?.map((group: any) => (
                <div key={group.label} className="bg-white rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 flex justify-between text-sm">
                    <span className="font-medium">{group.label}</span>
                    <span className="text-purple-600">{group.percent}%</span>
                  </div>
                  <div className="p-4 space-y-2">
                    {group.items.map((item: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span>{item.filled ? '✅' : '⭕'}</span>
                        <span className={item.filled ? '' : 'text-gray-400'}>{item.field}</span>
                        <span className="ml-auto text-xs text-gray-400">+{item.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <MobileTabBar
          tabs={[
            { id: 'overview', icon: '📊', label: '概览' },
            { id: 'detail', icon: '📋', label: '详情' },
          ]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </div>
    )
  }

  // ===== 大脑视角 =====
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">📊 团队档案完善度</h1>
          <p className="text-gray-500">查看团队成员档案完善情况</p>
        </div>
        <Button
          icon="📬"
          onClick={async () => {
            await fetch(`/api/enterprises/${enterpriseId}/profile-completeness/remind`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({})
            })
            setToast({ message: '已发送提醒', type: 'success' })
          }}
        >
          批量提醒
        </Button>
      </div>

      {/* 统计数据 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon="👥" label="团队成员" value={data?.totalMembers || 0} color="blue" />
        <StatCard icon="📈" label="平均完善度" value={`${data?.averageScore || 0}%`} color="purple" />
        <StatCard icon="⭐" label="优秀(S/A)" value={(data?.distribution?.S || 0) + (data?.distribution?.A || 0)} color="green" />
        <StatCard icon="⚠️" label="待关注" value={(data?.distribution?.C || 0) + (data?.distribution?.D || 0)} color="orange" />
      </div>

      {/* 评级分布 */}
      <Card title="🏆 评级分布" icon="🏆">
        <div className="flex items-center gap-6">
          {(['S', 'A', 'B', 'C', 'D'] as const).map(grade => {
            const count = data?.distribution?.[grade] || 0
            const total = data?.totalMembers || 1
            const pct = Math.round((count / total) * 100)
            return (
              <div key={grade} className="flex-1 text-center">
                <div className={`text-3xl font-bold bg-gradient-to-r ${gradeColors[grade].bg} bg-clip-text text-transparent`}>
                  {grade}
                </div>
                <div className="text-sm font-medium text-gray-700">{count}人</div>
                <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${gradeColors[grade].bg} rounded-full`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-xs text-gray-400 mt-1">{pct}%</div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* 需要关注的成员 */}
      {data?.needsAttention?.length > 0 && (
        <Card title="⚠️ 需要关注的成员" icon="⚠️" padding={false}>
          <div className="divide-y">
            {data.needsAttention.map((member: any, i: number) => (
              <div key={i} className="flex items-center gap-3 px-6 py-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white font-bold">
                  {member.avatarUrl ? (
                    <img src={member.avatarUrl} className="w-full h-full rounded-full" />
                  ) : member.name?.charAt(0)}
                </div>
                <div className="flex-1">
                  <div className="font-medium">{member.name}</div>
                  <div className="text-sm text-gray-500">
                    完善度 {member.percent}% · {gradeColors[member.grade]?.label}
                  </div>
                </div>
                <Badge label={`${member.grade}级`} color={
                  member.grade === 'C' ? 'orange' :
                  member.grade === 'D' ? 'red' : 'green'
                } />
                <Button size="sm" variant="secondary" onClick={async () => {
                  await fetch(`/api/enterprises/${enterpriseId}/profile-completeness/remind`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
                    body: JSON.stringify({ userIds: [member.userId] })
                  })
                  setToast({ message: `已提醒 ${member.name}`, type: 'success' })
                }}>
                  提醒
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 所有成员列表 */}
      <Card title="👥 所有成员" icon="👥" padding={false}>
        <div className="divide-y max-h-96 overflow-y-auto">
          {data?.members?.map((member: any, i: number) => (
            <div key={i} className="flex items-center gap-3 px-6 py-3 hover:bg-gray-50">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm">
                {member.avatarUrl ? (
                  <img src={member.avatarUrl} className="w-full h-full rounded-full" />
                ) : member.name?.charAt(0)}
              </div>
              <div className="flex-1">
                <div className="font-medium text-sm">{member.name}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      member.grade === 'S' || member.grade === 'A' ? 'bg-green-500' :
                      member.grade === 'B' ? 'bg-blue-500' : 'bg-yellow-500'
                    }`}
                    style={{ width: `${member.percent}%` }}
                  />
                </div>
                <span className="text-xs font-medium w-10 text-right">{member.percent}%</span>
              </div>
              <span className={`text-sm font-bold w-5 text-center ${
                { S: 'text-orange-600', A: 'text-green-600', B: 'text-blue-600', C: 'text-yellow-600', D: 'text-red-600' }[member.grade]
              }`}>
                {member.grade}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  )
}
