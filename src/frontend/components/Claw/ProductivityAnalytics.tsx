'use client'
import { useState } from 'react'

interface RadarChartProps {
  data: { category: string; label: string; level: number; skills: any[] }[]
  overallScore: number
}

function RadarChart({ data, overallScore }: RadarChartProps) {
  const maxLevel = 5
  const cx = 200, cy = 200, r = 150

  // Generate polygon points
  const points = data.map((item, i) => {
    const angle = (Math.PI * 2 * i) / data.length - Math.PI / 2
    const dist = (item.level / maxLevel) * r
    return `${cx + Math.cos(angle) * dist},${cy + Math.sin(angle) * dist}`
  }).join(' ')

  // Generate label positions
  const labels = data.map((item, i) => {
    const angle = (Math.PI * 2 * i) / data.length - Math.PI / 2
    const dist = r + 25
    const x = cx + Math.cos(angle) * dist
    const y = cy + Math.sin(angle) * dist
    return { ...item, x, y }
  })

  // Generate grid circles
  const grids = [0.2, 0.4, 0.6, 0.8, 1].map(pct => (
    <circle key={pct} cx={cx} cy={cy} r={r * pct} fill="none" stroke="#e5e7eb" strokeDasharray="4,4" />
  ))

  // Generate spokes
  const spokes = data.map((_, i) => {
    const angle = (Math.PI * 2 * i) / data.length - Math.PI / 2
    return <line key={i} x1={cx} y1={cy} x2={cx + Math.cos(angle) * r} y2={cy + Math.sin(angle) * r} stroke="#e5e7eb" strokeDasharray="4,4" />
  })

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
          <span className="text-white text-3xl font-bold">{overallScore}</span>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">综合能力评分</h3>
          <p className="text-gray-500">基于您的使用数据综合评估</p>
        </div>
      </div>
      <svg viewBox="0 0 450 430" className="w-full max-w-md mx-auto">
        {grids}
        {spokes}
        <polygon points={points} fill="rgba(99, 102, 241, 0.2)" stroke="#6366f1" strokeWidth="2" />
        {data.map((item, i) => {
          const angle = (Math.PI * 2 * i) / data.length - Math.PI / 2
          const dist = (item.level / maxLevel) * r
          return <circle key={i} cx={cx + Math.cos(angle) * dist} cy={cy + Math.sin(angle) * dist} r="5" fill="#6366f1" />
        })}
        {labels.map((item, i) => (
          <text key={i} x={item.x} y={item.y + 4} textAnchor="middle" fontSize="12" fill="#6b7280" fontWeight="500">
            {item.label} ({item.level.toFixed(1)})
          </text>
        ))}
      </svg>
    </div>
  )
}

interface TimePattern {
  hour: number
  avgMessages: number
  avgTasks: number
  avgFocus: number
  activityLevel: number
  timeRange: string
  recommendation: string
}

export default function ProductivityAnalytics() {
  const [activeTab, setActiveTab] = useState<'overview' | 'time' | 'skills'>('overview')
  const [productivityData, setProductivityData] = useState<any>(null)
  const [timePatterns, setTimePatterns] = useState<{ peakHours: TimePattern[], bestDays: any[], analysis: string } | null>(null)
  const [skillRadar, setSkillRadar] = useState<{ radar: any[], overallScore: number, topSkills: any[] } | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchProductivity = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/claw/productivity/score?period=week')
      const data = await res.json()
      setProductivityData(data.data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const fetchTimePatterns = async () => {
    try {
      const res = await fetch('/api/claw/productivity/time-patterns')
      const data = await res.json()
      setTimePatterns(data.data)
    } catch (e) { console.error(e) }
  }

  const fetchSkills = async () => {
    try {
      const res = await fetch('/api/claw/skills/radar')
      const data = await res.json()
      setSkillRadar(data.data)
    } catch (e) { console.error(e) }
  }

  const tabs = [
    { id: 'overview', label: '总览', icon: '📊' },
    { id: 'time', label: '时间模式', icon: '⏰' },
    { id: 'skills', label: '技能雷达', icon: '🎯' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">📈 生产力分析</h2>
        <button
          onClick={fetchProductivity}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
        >
          {loading ? '加载中...' : '刷新数据'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-white rounded-lg p-1 shadow-sm">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id as any)
              if (tab.id === 'time') fetchTimePatterns()
              if (tab.id === 'skills') fetchSkills()
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {productivityData ? (
            <>
              {/* Score Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[
                  { label: '综合评分', value: productivityData.overallScore, color: 'indigo' },
                  { label: '沟通协作', value: productivityData.breakdown?.communication || 0, color: 'blue' },
                  { label: '任务完成', value: productivityData.breakdown?.task || 0, color: 'green' },
                  { label: '创意产出', value: productivityData.breakdown?.creativity || 0, color: 'orange' },
                  { label: '团队协作', value: productivityData.breakdown?.collaboration || 0, color: 'purple' },
                ].map((card, i) => (
                  <div key={i} className="bg-white rounded-xl p-4 shadow-sm">
                    <p className="text-gray-500 text-sm">{card.label}</p>
                    <p className={`text-3xl font-bold text-${card.color}-600`}>{card.value}</p>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-4">本周数据摘要</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {[
                    { label: '发送消息', value: productivityData.summary?.totalMessages || 0, icon: '💬' },
                    { label: '完成任务', value: productivityData.summary?.totalTasks || 0, icon: '✅' },
                    { label: '创建文档', value: productivityData.summary?.totalDocs || 0, icon: '📝' },
                    { label: 'AI查询', value: productivityData.summary?.totalAiQueries || 0, icon: '🤖' },
                    { label: '日均评分', value: productivityData.summary?.avgDailyScore || 0, icon: '📈' },
                  ].map((item, i) => (
                    <div key={i} className="text-center">
                      <span className="text-2xl">{item.icon}</span>
                      <p className="text-2xl font-bold text-gray-900">{item.value}</p>
                      <p className="text-xs text-gray-500">{item.label}</p>
                    </div>
                  ))}
                </div>
                {productivityData.tip && (
                  <div className="mt-4 p-3 bg-indigo-50 rounded-lg text-indigo-700 text-sm">
                    💡 {productivityData.tip}
                  </div>
                )}
              </div>

              {/* Trend Chart */}
              {productivityData.trend && productivityData.trend.length > 0 && (
                <div className="bg-white rounded-xl p-6 shadow-sm">
                  <h3 className="font-semibold text-gray-900 mb-4">评分趋势</h3>
                  <div className="flex items-end gap-1 h-32">
                    {productivityData.trend.map((t: any, i: number) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className="w-full bg-indigo-500 rounded-t transition-all hover:bg-indigo-600"
                          style={{ height: `${Math.max(4, t.score)}%` }}
                          title={`${t.date}: ${t.score}分`}
                        />
                        <span className="text-xs text-gray-400">{new Date(t.date).toLocaleDateString('zh', { month: 'numeric', day: 'numeric' })}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-white rounded-xl p-12 shadow-sm text-center">
              <p className="text-gray-500 mb-4">点击「刷新数据」获取您的生产力分析</p>
              <button
                onClick={fetchProductivity}
                className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
              >
                开始分析
              </button>
            </div>
          )}
        </div>
      )}

      {/* Time Patterns Tab */}
      {activeTab === 'time' && (
        <div className="space-y-6">
          {timePatterns ? (
            <>
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-4">⏰ 高效时段</h3>
                {timePatterns.peakHours.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {timePatterns.peakHours.map((hour: TimePattern, i: number) => (
                      <div key={i} className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-200">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                          <span className="font-bold text-green-700">{hour.timeRange}</span>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{hour.recommendation}</p>
                        <div className="flex gap-4 text-xs text-gray-500">
                          <span>📧 均消息 {hour.avgMessages}</span>
                          <span>✅ 均任务 {hour.avgTasks}</span>
                          <span>🎯 专注度 {hour.avgFocus}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">数据不足，需要更多使用记录</p>
                )}
                {timePatterns.analysis && (
                  <p className="mt-4 text-indigo-600 font-medium">💡 {timePatterns.analysis}</p>
                )}
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-4">📅 一周各日效率</h3>
                <div className="grid grid-cols-7 gap-2">
                  {timePatterns.bestDays.map((day: any, i: number) => (
                    <div key={i} className="text-center">
                      <p className="text-xs text-gray-500 mb-1">{day.dayName}</p>
                      <div className="w-full bg-gray-100 rounded-full h-16 flex items-end justify-center pb-1">
                        <div
                          className="w-10 bg-indigo-500 rounded-full transition-all"
                          style={{ height: `${Math.max(4, day.productivityScore)}%` }}
                        />
                      </div>
                      <p className="text-xs font-bold mt-1">{day.productivityScore}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl p-12 shadow-sm text-center">
              <p className="text-gray-500 mb-4">加载时间模式分析...</p>
              <button onClick={fetchTimePatterns} className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium">
                加载分析
              </button>
            </div>
          )}
        </div>
      )}

      {/* Skills Radar Tab */}
      {activeTab === 'skills' && (
        <div className="space-y-6">
          {skillRadar ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <RadarChart data={skillRadar.radar} overallScore={skillRadar.overallScore} />

              <div className="bg-white rounded-xl p-6 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-4">🏆 核心技能</h3>
                {skillRadar.topSkills.length > 0 ? (
                  <div className="space-y-3">
                    {skillRadar.topSkills.map((skill: any, i: number) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                        <div className="flex-1">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">{skill.name}</span>
                            <span className="text-gray-500">Lv.{skill.level}</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2 mt-1">
                            <div
                              className="bg-indigo-500 rounded-full h-2 transition-all"
                              style={{ width: `${(skill.level / 5) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">暂无技能数据</p>
                )}

                <h3 className="font-semibold text-gray-900 mt-6 mb-4">📂 全部能力维度</h3>
                <div className="space-y-2">
                  {skillRadar.radar.map((r: any) => (
                    <div key={r.category} className="flex items-center justify-between py-1">
                      <span className="text-sm text-gray-700">{r.label}</span>
                      <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map(lv => (
                          <div
                            key={lv}
                            className={`w-3 h-3 rounded-full ${lv <= Math.round(r.level) ? 'bg-indigo-500' : 'bg-gray-200'}`}
                          />
                        ))}
                        <span className="text-xs text-gray-500 ml-1">{r.level.toFixed(1)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl p-12 shadow-sm text-center">
              <button onClick={fetchSkills} className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium">
                加载技能雷达
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
