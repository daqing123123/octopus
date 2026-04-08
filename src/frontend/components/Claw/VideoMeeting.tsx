'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  PageHeader, Card, Badge, Button, EmptyState,
  Drawer, TabSwitch, MobileTabBar, Toast,
  SearchBar, StatCard, Divider, useBreakpoint, ListItem
} from '../Shared/ResponsiveComponents'

// ============================================
// 视频会议页面 - 触手视角 + 大脑视角
// PC端：日历视图+列表 | 手机端：卡片列表+底部Sheet
// ============================================

export default function VideoMeetingPage({ enterpriseId, view = 'tentacle' }: { enterpriseId?: string; view?: 'tentacle' | 'brain' }) {
  const bp = useBreakpoint()
  const isMobile = bp === 'mobile'

  const [tab, setTab] = useState('upcoming')
  const [meetings, setMeetings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null)
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false)
  const [toast, setToast] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)

  const tabs = [
    { id: 'upcoming', label: '📅 即将开始' },
    { id: 'ongoing', label: '🔴 正在进行' },
    { id: 'past', label: '📋 历史会议' },
    ...(view === 'brain' ? [{ id: 'create', label: '➕ 创建会议' }] : []),
  ]

  const fetchMeetings = useCallback(async () => {
    if (view === 'create') return
    try {
      const endpoint = view === 'brain' && enterpriseId
        ? `/api/enterprises/${enterpriseId}/meetings?status=${tab}`
        : `/api/me/meetings?status=${tab}`

      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      const data = await res.json()
      if (data.success) setMeetings(data.data.meetings || data.data || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [tab, enterpriseId, view])

  const fetchStats = useCallback(async () => {
    if (!enterpriseId || view !== 'brain') return
    try {
      const res = await fetch(`/api/enterprises/${enterpriseId}/meetings/stats`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      const data = await res.json()
      if (data.success) setStats(data.data)
    } catch (e) { console.error(e) }
  }, [enterpriseId, view])

  useEffect(() => {
    fetchMeetings()
    fetchStats()
  }, [fetchMeetings, fetchStats])

  const handleJoin = async (meetingId: string) => {
    try {
      const res = await fetch(`/api/me/meetings/${meetingId}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      const data = await res.json()
      if (data.success && data.data.joinUrl) {
        window.open(data.data.joinUrl, '_blank')
        setToast({ message: `正在加入: ${data.data.meetingTitle}`, type: 'success' })
      }
    } catch (e) { console.error(e) }
  }

  if (!enterpriseId && view === 'tentacle') {
    return <div className="p-6 text-center text-gray-500">请先选择一个企业</div>
  }

  // ===== PC端布局 =====
  if (!isMobile) {
    return (
      <div className="flex flex-col h-full">
        {/* 顶部工具栏 */}
        <div className="bg-white border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">📹</span>
                <h2 className="text-lg font-semibold">{view === 'brain' ? '视频会议管理' : '我的会议'}</h2>
              </div>
              <TabSwitch tabs={tabs} activeTab={tab} onTabChange={setTab} />
            </div>
            {view === 'brain' && (
              <Button icon="➕" onClick={() => setCreateDrawerOpen(true)}>
                创建会议
              </Button>
            )}
          </div>
        </div>

        {/* 大脑视角：统计卡片 */}
        {view === 'brain' && stats && (
          <div className="bg-white border-b px-6 py-4">
            <div className="grid grid-cols-4 gap-4">
              <StatCard icon="📅" label="本周会议" value={stats.weekMeetings} color="blue" />
              <StatCard icon="📆" label="本月会议" value={stats.monthMeetings} color="purple" />
              <StatCard icon="⏱️" label="平均时长" value={`${stats.avgDurationMinutes}分钟`} color="orange" />
              <StatCard icon="🔴" label="正在开会" value={stats.ongoingMeetings} color="red" />
            </div>
          </div>
        )}

        {/* 会议列表 */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-16 text-gray-400">加载中...</div>
          ) : tab === 'create' ? (
            <CreateMeetingForm
              enterpriseId={enterpriseId!}
              onSuccess={() => { setCreateDrawerOpen(false); fetchMeetings() }}
              onClose={() => setCreateDrawerOpen(false)}
            />
          ) : meetings.length === 0 ? (
            <EmptyState
              icon={tab === 'upcoming' ? '📅' : tab === 'ongoing' ? '🔴' : '📋'}
              title={tab === 'upcoming' ? '没有即将开始的会议' : tab === 'ongoing' ? '目前没有会议在进行' : '暂无历史会议'}
              description={tab === 'upcoming' ? '创建一个新会议，或等待主持人邀请' : undefined}
              action={view === 'brain' && tab === 'upcoming' ? { label: '创建会议', onClick: () => setCreateDrawerOpen(true) } : undefined}
            />
          ) : (
            <div className="space-y-4 max-w-4xl">
              {meetings.map(meeting => (
                <MeetingCard
                  key={meeting.id}
                  meeting={meeting}
                  view={view}
                  onJoin={() => handleJoin(meeting.id)}
                  onClick={() => setSelectedMeeting(meeting)}
                />
              ))}
            </div>
          )}
        </div>

        {/* 会议详情抽屉 */}
        <MeetingDrawer
          meeting={selectedMeeting}
          onClose={() => setSelectedMeeting(null)}
          view={view}
          enterpriseId={enterpriseId}
          onRefresh={fetchMeetings}
        />

        {/* 创建会议抽屉 */}
        <Drawer
          open={createDrawerOpen}
          onClose={() => setCreateDrawerOpen(false)}
          title="📹 创建视频会议"
          height="85vh"
        >
          <CreateMeetingForm
            enterpriseId={enterpriseId!}
            onSuccess={() => { setCreateDrawerOpen(false); fetchMeetings() }}
            onClose={() => setCreateDrawerOpen(false)}
          />
        </Drawer>

        {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      </div>
    )
  }

  // ===== 手机端布局 =====
  const mobileTabs = [
    { id: 'upcoming', icon: '📅', label: '会议' },
    { id: 'ongoing', icon: '🔴', label: '进行中', badge: stats?.ongoingMeetings || 0 },
    { id: 'past', icon: '📋', label: '历史' },
    ...(view === 'brain' ? [{ id: 'create', icon: '➕', label: '创建' }] : []),
  ]

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <PageHeader
        title="视频会议"
        icon="📹"
        subtitle={stats ? `本周${stats.weekMeetings}场` : undefined}
      />

      {/* 标签切换 */}
      <div className="bg-white">
        <TabSwitch tabs={tabs} activeTab={tab} onTabChange={setTab} />
      </div>

      {/* 会议列表 */}
      <div className="flex-1 overflow-y-auto pb-16">
        {loading ? (
          <div className="text-center py-16 text-gray-400">加载中...</div>
        ) : tab === 'create' && view === 'brain' ? (
          <div className="p-4">
            <CreateMeetingForm
              enterpriseId={enterpriseId!}
              onSuccess={() => setTab('upcoming')}
              onClose={() => setTab('upcoming')}
              mobile
            />
          </div>
        ) : meetings.length === 0 ? (
          <EmptyState
            icon="📹"
            title="暂无会议"
            description={tab === 'upcoming' ? '没有即将开始的会议' : undefined}
          />
        ) : (
          <div className="divide-y bg-white">
            {meetings.map(meeting => (
              <MeetingListItem
                key={meeting.id}
                meeting={meeting}
                onJoin={() => handleJoin(meeting.id)}
                onClick={() => setSelectedMeeting(meeting)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 会议详情 */}
      <MeetingDrawer
        meeting={selectedMeeting}
        onClose={() => setSelectedMeeting(null)}
        view={view}
        enterpriseId={enterpriseId}
        onRefresh={fetchMeetings}
        mobile
      />

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <MobileTabBar tabs={mobileTabs} activeTab={tab} onTabChange={setTab} />
    </div>
  )
}

// ===== 子组件 =====

function MeetingCard({ meeting, view, onJoin, onClick }: { meeting: any; view: 'tentacle' | 'brain'; onJoin: () => void; onClick: () => void }) {
  const startTime = new Date(meeting.startTime)
  const now = new Date()
  const isStarting = startTime.getTime() - now.getTime() < 15 * 60 * 1000 && startTime > now
  const isOngoing = meeting.status === 'in_progress'

  const statusConfig = {
    scheduled: { label: '已安排', color: 'blue', bg: 'bg-blue-100 text-blue-700' },
    in_progress: { label: '进行中', color: 'red', bg: 'bg-red-100 text-red-700' },
    ended: { label: '已结束', color: 'gray', bg: 'bg-gray-100 text-gray-600' },
    cancelled: { label: '已取消', color: 'gray', bg: 'bg-gray-100 text-gray-400' },
  }
  const status = statusConfig[meeting.status] || statusConfig.scheduled

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-all cursor-pointer" onClick={onClick}>
      <div className="flex items-start gap-4">
        {/* 时间块 */}
        <div className={`w-16 text-center rounded-xl p-3 flex-shrink-0 ${
          isOngoing ? 'bg-red-50 border border-red-200' :
          isStarting ? 'bg-orange-50 border border-orange-200' : 'bg-gray-50'
        }`}>
          <div className={`text-2xl font-bold ${isOngoing ? 'text-red-600' : isStarting ? 'text-orange-600' : 'text-gray-700'}`}>
            {startTime.getDate()}
          </div>
          <div className="text-xs text-gray-500">
            {['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'][startTime.getMonth()]}
          </div>
          {(isOngoing || isStarting) && (
            <div className={`mt-1 text-xs font-medium ${isOngoing ? 'text-red-600' : 'text-orange-600'}`}>
              {isOngoing ? '🔴' : '⏰'}
            </div>
          )}
        </div>

        {/* 内容 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold truncate">{meeting.title}</h3>
            <span className={`px-2 py-0.5 rounded text-xs ${status.bg}`}>{status.label}</span>
          </div>

          <div className="flex items-center gap-4 text-sm text-gray-500 mb-2">
            <span>⏰ {startTime.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            <span>⏱️ {meeting.duration || 60}分钟</span>
            {meeting.creator?.name && <span>👤 {meeting.creator.name}</span>}
          </div>

          {meeting.description && (
            <p className="text-sm text-gray-500 line-clamp-1">{meeting.description}</p>
          )}

          <div className="flex items-center gap-3 mt-3">
            {meeting.totalParticipants !== undefined && (
              <span className="text-xs text-gray-400">👥 {meeting.totalParticipants}人</span>
            )}
            {meeting.currentParticipants !== undefined && meeting.currentParticipants > 0 && (
              <span className="text-xs text-green-600">🟢 {meeting.currentParticipants}人在会</span>
            )}
          </div>
        </div>

        {/* 操作 */}
        <div className="flex-shrink-0 flex flex-col gap-2">
          {(meeting.status === 'scheduled' || meeting.status === 'in_progress') && (
            <Button size="sm" onClick={(e) => { e.stopPropagation(); onJoin() }}>
              {meeting.status === 'in_progress' ? '🔴 加入' : '📹 加入'}
            </Button>
          )}
          {meeting.status === 'scheduled' && isStarting && (
            <Badge label="即将开始" color="orange" />
          )}
        </div>
      </div>
    </div>
  )
}

function MeetingListItem({ meeting, onJoin, onClick }: { meeting: any; onJoin: () => void; onClick: () => void }) {
  const startTime = new Date(meeting.startTime)
  const isOngoing = meeting.status === 'in_progress'
  const isStarting = startTime.getTime() - new Date().getTime() < 15 * 60 * 1000 && startTime > new Date()

  return (
    <div onClick={onClick} className="px-4 py-3 active:bg-gray-50">
      <div className="flex items-start gap-3">
        <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${
          isOngoing ? 'bg-red-100' : isStarting ? 'bg-orange-100' : 'bg-purple-100'
        }`}>
          <div className={`text-lg font-bold ${isOngoing ? 'text-red-600' : 'text-purple-600'}`}>
            {startTime.getDate()}
          </div>
          <div className="text-xs text-gray-500">
            {['日','一','二','三','四','五','六'][startTime.getDay()]}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{meeting.title}</span>
            {(isOngoing || isStarting) && (
              <span className={`px-1.5 py-0.5 rounded text-xs ${isOngoing ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
                {isOngoing ? '进行中' : '即将开始'}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {startTime.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            {meeting.creator?.name && ` · ${meeting.creator.name}`}
          </div>
        </div>
        {(meeting.status === 'scheduled' || meeting.status === 'in_progress') && (
          <Button size="sm" variant={meeting.status === 'in_progress' ? 'primary' : 'secondary'} onClick={(e) => { e.stopPropagation(); onJoin() }}>
            加入
          </Button>
        )}
      </div>
    </div>
  )
}

function MeetingDrawer({ meeting, onClose, view, enterpriseId, onRefresh, mobile }: {
  meeting: any; onClose: () => void; view: 'tentacle' | 'brain'; enterpriseId?: string; onRefresh: () => void; mobile?: boolean
}) {
  const [meetingDetail, setMeetingDetail] = useState<any>(null)
  const [loading, setLoading] = useState(!!meeting)

  useEffect(() => {
    if (meeting) {
      fetchDetail()
    }
  }, [meeting])

  const fetchDetail = async () => {
    if (!meeting) return
    setLoading(true)
    try {
      const res = await fetch(`/api/me/meetings/${meeting.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      const data = await res.json()
      if (data.success) setMeetingDetail(data.data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const handleJoin = async () => {
    if (!meeting) return
    try {
      const res = await fetch(`/api/me/meetings/${meeting.id}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      const data = await res.json()
      if (data.success) window.open(data.data.joinUrl, '_blank')
    } catch (e) { console.error(e) }
  }

  return (
    <Drawer
      open={!!meeting}
      onClose={onClose}
      title={meeting?.title || '会议详情'}
      height={mobile ? '90vh' : '80vh'}
    >
      {loading ? (
        <div className="text-center py-8 text-gray-400">加载中...</div>
      ) : meetingDetail ? (
        <div className="space-y-6">
          {/* 会议基本信息 */}
          <div className="text-center">
            <h2 className="text-xl font-bold mb-2">{meetingDetail.title}</h2>
            <div className="flex items-center justify-center gap-3 text-sm text-gray-500">
              <span>📅 {new Date(meetingDetail.startTime).toLocaleString('zh-CN')}</span>
              <span>⏱️ {meetingDetail.duration || 60}分钟</span>
            </div>
            {meetingDetail.password && (
              <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full text-sm">
                🔒 密码会议
              </div>
            )}
          </div>

          <Divider />

          {/* 操作按钮 */}
          {(meetingDetail.status === 'scheduled' || meetingDetail.status === 'in_progress') && (
            <div className="flex gap-3">
              <Button block icon="📹" onClick={handleJoin} size="lg">
                {meetingDetail.status === 'in_progress' ? '🔴 加入会议' : '📹 加入会议'}
              </Button>
            </div>
          )}

          {/* 会议描述 */}
          {meetingDetail.description && (
            <div>
              <div className="text-sm font-medium text-gray-500 mb-2">📝 会议描述</div>
              <p className="text-sm text-gray-600">{meetingDetail.description}</p>
            </div>
          )}

          {/* 议程 */}
          {meetingDetail.agenda?.length > 0 && (
            <div>
              <div className="text-sm font-medium text-gray-500 mb-2">📋 议程</div>
              <div className="space-y-2">
                {meetingDetail.agenda.map((item: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                    <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-medium">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{item.title}</div>
                      {item.duration && <div className="text-xs text-gray-400">{item.duration}分钟</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 参与者 */}
          {meetingDetail.participants?.length > 0 && (
            <div>
              <div className="text-sm font-medium text-gray-500 mb-2">
                👥 参会者 ({meetingDetail.participants.length})
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {meetingDetail.participants.map((p: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 text-sm font-bold">
                      {p.name?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="text-xs text-gray-400">{p.role === 'host' ? '主持人' : p.role === 'co_host' ? '联席主持人' : '参会者'}</div>
                    </div>
                    <span className={`w-2 h-2 rounded-full ${
                      p.status === 'joined' ? 'bg-green-500' :
                      p.status === 'left' ? 'bg-gray-400' : 'bg-yellow-400'
                    }`} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 行动项 */}
          {meetingDetail.actionItems?.length > 0 && (
            <div>
              <div className="text-sm font-medium text-gray-500 mb-2">
                ✅ 行动项 ({meetingDetail.actionItems.filter((a: any) => a.status === 'open').length} 待完成)
              </div>
              <div className="space-y-2">
                {meetingDetail.actionItems.map((item: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                    <span className={item.status === 'completed' ? 'text-green-500' : 'text-gray-400'}>
                      {item.status === 'completed' ? '✅' : '○'}
                    </span>
                    <div className="flex-1">
                      <div className={`text-sm ${item.status === 'completed' ? 'line-through text-gray-400' : ''}`}>{item.title}</div>
                      {item.assigneeName && <div className="text-xs text-gray-400">负责人: {item.assigneeName}</div>}
                    </div>
                    {item.dueDate && (
                      <span className="text-xs text-gray-400">📅 {item.dueDate}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 录制 */}
          {meetingDetail.recordings?.length > 0 && (
            <div>
              <div className="text-sm font-medium text-gray-500 mb-2">🎬 会议录制</div>
              <div className="space-y-2">
                {meetingDetail.recordings.map((r: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="text-sm font-medium">{r.fileName}</div>
                      <div className="text-xs text-gray-400">
                        {r.durationSeconds ? `${Math.floor(r.durationSeconds / 60)}分钟` : ''} · {r.format}
                      </div>
                    </div>
                    {r.status === 'ready' && (
                      <Button size="sm" variant="secondary" icon="⬇️" onClick={() => window.open(r.fileUrl, '_blank')}>
                        下载
                      </Button>
                    )}
                    {r.status === 'processing' && <Badge label="处理中" color="orange" />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </Drawer>
  )
}

// 创建会议表单
function CreateMeetingForm({ enterpriseId, onSuccess, onClose, mobile }: {
  enterpriseId: string; onSuccess: () => void; onClose: () => void; mobile?: boolean
}) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    startTime: '',
    durationMinutes: 60,
    password: '',
    maxParticipants: 300,
    autoRecord: false,
    meetingType: 'scheduled',
  })
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!form.title || !form.startTime) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/enterprises/${enterpriseId}/meetings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(form)
      })
      const data = await res.json()
      if (data.success) {
        onSuccess()
      }
    } catch (e) { console.error(e) }
    finally { setSubmitting(false) }
  }

  const inputClass = `w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500`
  const labelClass = `block text-sm font-medium text-gray-700 mb-1`

  return (
    <div className={mobile ? 'p-4' : 'space-y-6'}>
      {!mobile && <h3 className="text-lg font-semibold">创建视频会议</h3>}

      <div className="space-y-4">
        <div>
          <label className={labelClass}>会议主题 *</label>
          <input
            type="text"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            placeholder="输入会议主题..."
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>会议描述</label>
          <textarea
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder="简要描述会议内容..."
            rows={mobile ? 2 : 3}
            className={`${inputClass} resize-none`}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>开始时间 *</label>
            <input
              type="datetime-local"
              value={form.startTime}
              onChange={e => setForm({ ...form, startTime: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>时长（分钟）</label>
            <select
              value={form.durationMinutes}
              onChange={e => setForm({ ...form, durationMinutes: parseInt(e.target.value) })}
              className={inputClass}
            >
              <option value={15}>15分钟</option>
              <option value={30}>30分钟</option>
              <option value={45}>45分钟</option>
              <option value={60}>60分钟</option>
              <option value={90}>90分钟</option>
              <option value={120}>120分钟</option>
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>会议密码（可选）</label>
          <input
            type="text"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            placeholder="不填则无密码"
            className={inputClass}
          />
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="autoRecord"
            checked={form.autoRecord}
            onChange={e => setForm({ ...form, autoRecord: e.target.checked })}
            className="w-4 h-4 text-purple-600 rounded"
          />
          <label htmlFor="autoRecord" className="text-sm">自动录制会议</label>
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onClose} className="flex-1">取消</Button>
        <Button
          onClick={handleSubmit}
          loading={submitting}
          disabled={!form.title || !form.startTime}
          className="flex-1"
        >
          ✅ 创建会议
        </Button>
      </div>
    </div>
  )
}
