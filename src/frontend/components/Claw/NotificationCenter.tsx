'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  PageHeader, TabSwitch, ListItem, Card, EmptyState,
  Button, Drawer, Badge, Toast, SearchBar, Divider,
  MobileTabBar, StatCard, useBreakpoint
} from '../Shared/ResponsiveComponents'

// ============================================
// 通知中心页面 - 触手↔大脑双向通知
// 支持 PC端（侧边栏布局）+ 手机端（底部Tab）
// ============================================

export default function NotificationCenterPage() {
  const bp = useBreakpoint()
  const isMobile = bp === 'mobile'

  const [activeTab, setActiveTab] = useState('all')
  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNotif, setSelectedNotif] = useState<any>(null)
  const [mobileTab, setMobileTab] = useState('notifications')
  const [channelDrawerOpen, setChannelDrawerOpen] = useState(false)
  const [channels, setChannels] = useState<any[]>([])

  const fetchNotifications = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '30', offset: '0' })
      if (activeTab === 'unread') params.set('unreadOnly', 'true')
      if (searchQuery) params.set('search', searchQuery)

      const res = await fetch(`/api/me/notifications?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      const data = await res.json()
      if (data.success) {
        setNotifications(data.data.notifications)
        setUnreadCount(data.data.unreadCount)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [activeTab, searchQuery])

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  const handleMarkRead = async (id: string) => {
    try {
      await fetch(`/api/me/notifications/${id}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (e) { console.error(e) }
  }

  const handleMarkAllRead = async () => {
    try {
      await fetch(`/api/me/notifications/read-all', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
      setToast({ message: '全部已读', type: 'success' })
    } catch (e) { console.error(e) }
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/me/notifications/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      setNotifications(prev => prev.filter(n => n.id !== id))
      setToast({ message: '已删除', type: 'success' })
    } catch (e) { console.error(e) }
  }

  const handleChannelUpdate = async (channelType: string, enabled: boolean) => {
    try {
      await fetch(`/api/me/notification-channels/${channelType}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ enabled })
      })
      setChannels(prev => prev.map(c => c.channel_type === channelType ? { ...c, enabled } : c))
      setToast({ message: '设置已更新', type: 'success' })
    } catch (e) { console.error(e) }
  }

  const typeLabels: Record<string, string> = {
    announcement: '📢 公告',
    onboarding_task: '🎯 入职任务',
    onboarding_reminder: '⏰ 入职提醒',
    onboarding_approved: '✅ 任务已通过',
    onboarding_rejected: '❌ 任务需补充',
    join_approved: '🎉 加入通过',
    join_rejected: '😔 加入未通过',
    offboarding_started: '📤 离职启动',
    offboarding_reminder: '⏰ 离职提醒',
    claw_health_warning: '⚠️ Claw预警',
    company_info_update: '🏢 公司信息',
    tentacle_join_request: '🤝 新申请',
    meeting_reminder: '📹 会议提醒',
    meeting_started: '🔴 会议开始',
    meeting_summary: '📝 会议纪要',
    system_maintenance: '🔧 系统维护',
    security_alert: '🔒 安全提醒',
  }

  const sourceColors: Record<string, string> = {
    brain: 'blue',
    tentacle: 'purple',
    system: 'gray',
    meeting: 'orange'
  }

  const tabs = [
    { id: 'all', label: '全部', badge: unreadCount },
    { id: 'unread', label: '未读' },
    { id: 'announcement', label: '公告' },
    { id: 'onboarding_task', label: '入职' },
    { id: 'meeting_reminder', label: '会议' },
  ]

  // 移动端底部Tab
  const mobileTabs = [
    { id: 'notifications', icon: '🔔', label: '通知', badge: unreadCount },
    { id: 'channels', icon: '📳', label: '渠道' },
    { id: 'settings', icon: '⚙️', label: '设置' },
  ]

  const filteredNotifs = activeTab === 'all'
    ? notifications
    : notifications.filter(n => n.type === activeTab || (activeTab === 'unread' && !n.read))

  const groupedByDate = filteredNotifs.reduce((groups: any, n) => {
    const date = new Date(n.createdAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
    if (!groups[date]) groups[date] = []
    groups[date].push(n)
    return groups
  }, {})

  // PC端布局
  const PC_LAYOUT = (
    <div className="flex h-full">
      {/* 左侧边栏 */}
      <div className="w-64 border-r bg-white p-4 flex flex-col gap-4 overflow-y-auto">
        <div className="text-xs font-semibold text-gray-400 uppercase px-2">通知分类</div>
        {[
          { id: 'all', icon: '📬', label: '全部通知', badge: unreadCount },
          { id: 'unread', icon: '📨', label: '未读通知', badge: unreadCount > 0 ? unreadCount : undefined },
          { id: 'announcement', icon: '📢', label: '企业公告' },
          { id: 'onboarding_task', icon: '🎯', label: '入职任务' },
          { id: 'meeting_reminder', icon: '📹', label: '会议' },
          { id: 'security_alert', icon: '🔒', label: '安全提醒' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              activeTab === tab.id
                ? 'bg-purple-50 text-purple-600 font-medium border-l-2 border-purple-600'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <span>{tab.icon}</span>
            <span className="flex-1 text-left">{tab.label}</span>
            {tab.badge !== undefined && (
              <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-5 text-center">
                {tab.badge > 99 ? '99+' : tab.badge}
              </span>
            )}
          </button>
        ))}

        <Divider />

        <div className="text-xs font-semibold text-gray-400 uppercase px-2">渠道管理</div>
        {[
          { type: 'in_app', icon: '🔔', label: '应用内通知' },
          { type: 'email', icon: '📧', label: '邮件通知' },
          { type: 'wechat', icon: '💬', label: '企微通知' },
          { type: 'webhook', icon: '🔗', label: 'Webhook' },
        ].map(ch => (
          <button
            key={ch.type}
            onClick={() => { setActiveTab('channels'); setChannelDrawerOpen(true) }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
          >
            <span>{ch.icon}</span>
            <span className="flex-1 text-left">{ch.label}</span>
            <span className="text-gray-300">›</span>
          </button>
        ))}

        <Divider />

        {/* 通知统计 */}
        <Card title="" padding={false}>
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">今日新通知</span>
              <span className="font-bold text-purple-600">{unreadCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">本周通知</span>
              <span className="font-medium text-gray-700">{notifications.length}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* 右侧主内容 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部工具栏 */}
        <div className="bg-white border-b px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">
              {tabs.find(t => t.id === activeTab)?.label || '通知'}
              {unreadCount > 0 && activeTab === 'all' && (
                <span className="ml-2 text-sm font-normal text-gray-500">{unreadCount}条未读</span>
              )}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <SearchBar
              placeholder="搜索通知..."
              value={searchQuery}
              onChange={setSearchQuery}
              className="w-64"
            />
            {unreadCount > 0 && (
              <Button variant="secondary" size="sm" onClick={handleMarkAllRead}>
                全部已读
              </Button>
            )}
          </div>
        </div>

        {/* 通知列表 */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-16 text-gray-400">加载中...</div>
          ) : filteredNotifs.length === 0 ? (
            <EmptyState
              icon="🔔"
              title="没有通知"
              description="暂无新通知，去看看有什么值得关注的吧"
            />
          ) : (
            <div className="space-y-6 max-w-3xl">
              {Object.entries(groupedByDate).map(([date, notifs]: [string, any]) => (
                <div key={date}>
                  <div className="text-sm font-semibold text-gray-400 mb-3 sticky top-0 bg-gray-50 py-1">
                    {date}
                  </div>
                  <div className="space-y-2">
                    {notifs.map((n: any) => (
                      <NotificationCard
                        key={n.id}
                        notification={n}
                        typeLabel={typeLabels[n.type] || n.type}
                        sourceColor={sourceColors[n.source] || 'gray'}
                        onRead={() => handleMarkRead(n.id)}
                        onDelete={() => handleDelete(n.id)}
                        onClick={() => setSelectedNotif(n)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 通知详情抽屉 */}
      <Drawer
        open={!!selectedNotif}
        onClose={() => setSelectedNotif(null)}
        title="通知详情"
      >
        {selectedNotif && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge label={typeLabels[selectedNotif.type] || selectedNotif.type} color="purple" />
              <Badge
                label={selectedNotif.source}
                color={sourceColors[selectedNotif.source] || 'gray'}
              />
            </div>
            <h3 className="text-lg font-semibold">{selectedNotif.title}</h3>
            {selectedNotif.content && (
              <p className="text-gray-600 leading-relaxed">{selectedNotif.content}</p>
            )}
            {selectedNotif.metadata?.actionUrl && (
              <Button block icon="🔗" onClick={() => window.location.href = selectedNotif.metadata.actionUrl}>
                查看详情
              </Button>
            )}
            <div className="text-xs text-gray-400">
              {new Date(selectedNotif.createdAt).toLocaleString()}
            </div>
            {!selectedNotif.read && (
              <Button block onClick={() => { handleMarkRead(selectedNotif.id); setSelectedNotif(null) }}>
                标记为已读
              </Button>
            )}
          </div>
        )}
      </Drawer>
    </div>
  )

  // 手机端布局
  const MOBILE_LAYOUT = (
    <div className="flex flex-col h-full bg-gray-50">
      <PageHeader
        title="通知"
        icon="🔔"
        subtitle={`${unreadCount}条未读`}
        rightAction={
          unreadCount > 0 ? (
            <button onClick={handleMarkAllRead} className="text-sm text-purple-600 font-medium">
              全部已读
            </button>
          ) : null
        }
      />

      {/* 搜索 */}
      <div className="px-4 py-2 bg-white">
        <SearchBar placeholder="搜索通知..." value={searchQuery} onChange={setSearchQuery} />
      </div>

      {/* 标签切换 */}
      <div className="bg-white">
        <TabSwitch
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </div>

      {/* 通知列表 */}
      <div className="flex-1 overflow-y-auto pb-20">
        {loading ? (
          <div className="text-center py-16 text-gray-400">加载中...</div>
        ) : filteredNotifs.length === 0 ? (
          <EmptyState icon="🔔" title="没有通知" description="暂无新通知" />
        ) : (
          <div className="divide-y bg-white">
            {filteredNotifs.map((n: any) => (
              <div
                key={n.id}
                onClick={() => {
                  setSelectedNotif(n)
                  if (!n.read) handleMarkRead(n.id)
                }}
                className={`px-4 py-3 active:bg-gray-50 ${!n.read ? 'bg-purple-50/30' : ''}`}
              >
                <div className="flex items-start gap-3">
                  {!n.read && <span className="w-2 h-2 rounded-full bg-purple-600 mt-2 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        label={typeLabels[n.type] || n.type}
                        color="purple"
                        size="sm"
                      />
                      <span className="text-xs text-gray-400">
                        {new Date(n.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className={`font-medium ${n.read ? 'text-gray-600' : 'text-gray-900'}`}>
                      {n.title}
                    </div>
                    {n.content && (
                      <div className="text-sm text-gray-500 mt-0.5 line-clamp-2">{n.content}</div>
                    )}
                  </div>
                  {n.priority >= 7 && !n.read && (
                    <span className="text-red-500 text-xs flex-shrink-0">🔥</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 通知详情 */}
      <Drawer
        open={!!selectedNotif}
        onClose={() => setSelectedNotif(null)}
        title="通知详情"
        height="70vh"
      >
        {selectedNotif && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge label={typeLabels[selectedNotif.type] || selectedNotif.type} color="purple" />
              <Badge label={selectedNotif.source} color={sourceColors[selectedNotif.source] || 'gray'} />
            </div>
            <h3 className="text-lg font-semibold">{selectedNotif.title}</h3>
            {selectedNotif.content && (
              <p className="text-gray-600 leading-relaxed">{selectedNotif.content}</p>
            )}
            <div className="text-xs text-gray-400">
              收到时间：{new Date(selectedNotif.createdAt).toLocaleString()}
            </div>
            {selectedNotif.metadata?.actionUrl && (
              <Button block icon="🔗" onClick={() => window.location.href = selectedNotif.metadata.actionUrl}>
                查看详情
              </Button>
            )}
          </div>
        )}
      </Drawer>

      {/* 底部Tab栏 */}
      <MobileTabBar
        tabs={mobileTabs}
        activeTab={mobileTab}
        onTabChange={t => {
          setMobileTab(t)
          if (t === 'channels') setChannelDrawerOpen(true)
        }}
      />
    </div>
  )

  return (
    <div className="h-screen overflow-hidden">
      {isMobile ? MOBILE_LAYOUT : PC_LAYOUT}
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* 渠道管理抽屉 */}
      <Drawer
        open={channelDrawerOpen}
        onClose={() => setChannelDrawerOpen(false)}
        title="通知渠道"
        height="60vh"
      >
        <div className="space-y-4">
          {[
            { type: 'in_app', icon: '🔔', label: '应用内通知', desc: '在应用内显示通知' },
            { type: 'email', icon: '📧', label: '邮件通知', desc: '发送邮件到您的邮箱' },
            { type: 'wechat', icon: '💬', label: '企微通知', desc: '通过企业微信推送' },
            { type: 'webhook', icon: '🔗', label: 'Webhook', desc: '推送到第三方系统' },
          ].map(ch => (
            <div key={ch.type} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{ch.icon}</span>
                <div>
                  <div className="font-medium">{ch.label}</div>
                  <div className="text-xs text-gray-400">{ch.desc}</div>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  defaultChecked
                  className="sr-only peer"
                  onChange={e => handleChannelUpdate(ch.type, e.target.checked)}
                />
                <div className="w-11 h-6 bg-gray-300 peer-focus:ring-2 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>
          ))}
        </div>
      </Drawer>
    </div>
  )
}

// 通知卡片组件
function NotificationCard({ notification: n, typeLabel, sourceColor, onRead, onDelete, onClick }: {
  notification: any
  typeLabel: string
  sourceColor: string
  onRead: () => void
  onDelete: () => void
  onClick: () => void
}) {
  const [showMenu, setShowMenu] = useState(false)
  const priorityColors = { 9: 'border-l-red-500', 8: 'border-l-orange-500', 7: 'border-l-yellow-500', default: 'border-l-transparent' }

  return (
    <div
      className={`bg-white rounded-xl p-4 border border-gray-100 hover:shadow-sm transition-all cursor-pointer
        ${!n.read ? `border-l-4 ${priorityColors[n.priority >= 7 ? n.priority] || priorityColors.default}` : ''}
        ${!n.read ? 'bg-purple-50/20' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        {!n.read && (
          <span className="w-2 h-2 rounded-full bg-purple-600 mt-2 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge label={typeLabel} color="purple" size="sm" />
            <Badge label={n.source} color={sourceColor as any} size="sm" />
            {n.priority >= 8 && <Badge label="紧急" color="red" size="sm" />}
          </div>
          <div className={`font-medium ${!n.read ? 'text-gray-900' : 'text-gray-700'}`}>
            {n.title}
          </div>
          {n.content && (
            <div className="text-sm text-gray-500 mt-1 line-clamp-2">{n.content}</div>
          )}
          <div className="text-xs text-gray-400 mt-2">
            {new Date(n.createdAt).toLocaleString()}
            {n.metadata?.enterpriseName && (
              <span className="ml-2">· {n.metadata.enterpriseName}</span>
            )}
          </div>
        </div>
        <div className="relative">
          <button
            onClick={e => { e.stopPropagation(); setShowMenu(!showMenu) }}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            ⋮
          </button>
          {showMenu && (
            <div className="absolute right-0 top-8 bg-white border rounded-lg shadow-lg z-10 py-1 min-w-32">
              {!n.read && (
                <button onClick={e => { e.stopPropagation(); onRead(); setShowMenu(false) }} className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50">
                  标记已读
                </button>
              )}
              <button onClick={e => { e.stopPropagation(); onDelete(); setShowMenu(false) }} className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 text-red-600">
                删除
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
