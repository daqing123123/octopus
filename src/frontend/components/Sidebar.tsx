'use client'

import { clsx } from 'clsx'
import { useState, useEffect } from 'react'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  activeModule: string
  onModuleChange: (module: string) => void
  currentEnterprise: string | null
  onEnterpriseChange: (enterpriseId: string | null) => void
}

function useNotificationBadge() {
  const [unreadCount, setUnreadCount] = useState(0)
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const token = localStorage.getItem('token')
        if (!token) return
        const res = await fetch('/api/me/notifications/count', {
          headers: { Authorization: `Bearer ${token}` }
        })
        const data = await res.json()
        if (data.success) setUnreadCount(data.data.total || 0)
      } catch {}
    }
    fetchCount()
    const interval = setInterval(fetchCount, 60000) // 每分钟刷新
    return () => clearInterval(interval)
  }, [])
  return unreadCount
}

function Badge({ count }: { count: number }) {
  if (!count) return null
  return (
    <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-5 text-center">
      {count > 99 ? '99+' : count}
    </span>
  )
}

const menuItems = [
  { id: 'dashboard', icon: '🏠', label: '工作台' },
  { id: 'messages', icon: '💬', label: '消息' },
  { id: 'tasks', icon: '✅', label: '任务' },
  { id: 'tables', icon: '📊', label: '多维表格' },
  { id: 'documents', icon: '📝', label: '云文档' },
  { id: 'ai', icon: '🤖', label: 'AI助手' },
  { id: 'meetings', icon: '📹', label: '视频会议' },
  { id: 'directory', icon: '👥', label: '通讯录' },
  { id: 'files', icon: '📁', label: '文件' },
  { id: 'okr', icon: '🎯', label: 'OKR' },
  { id: 'calendar', icon: '📅', label: '日历' },
]

const clawMenuItems = [
  { id: 'claw-settings', icon: '🐙', label: 'Claw总览' },
  { id: 'claw-productivity', icon: '📈', label: '生产力分析' },
  { id: 'claw-knowledge', icon: '🕸️', label: '知识图谱' },
  { id: 'claw-memory', icon: '🧠', label: '记忆增强' },
  { id: 'claw-proactive', icon: '🚀', label: '主动服务' },
  { id: 'claw-privacy', icon: '🔒', label: '隐私控制' },
  { id: 'claw-agent', icon: '🤖', label: 'Agent进化' },
  { id: 'notifications', icon: '🔔', label: '通知中心', badge: true },
  { id: 'onboarding-wizard', icon: '🎯', label: '入职向导' },
  { id: 'profile-completeness', icon: '📋', label: '档案完善度' },
]

const tentacleMenuItems = [
  { id: 'claw-tentacle', icon: '🦑', label: '触手档案', desc: '个人档案·证件·简历' },
]

const brainMenuItems = [
  { id: 'claw-brain', icon: '🧠', label: '企业Claw', desc: '触手管理·入职·离职', adminOnly: true },
]

export default function Sidebar({
  collapsed,
  onToggle,
  activeModule,
  onModuleChange,
  currentEnterprise,
  onEnterpriseChange
}: SidebarProps) {
  const unreadCount = useNotificationBadge()
  return (
    <aside
      className={clsx(
        'bg-white border-r border-gray-200 flex flex-col transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <span className="text-2xl">🐙</span>
            <span className="font-bold text-gray-900">八爪鱼</span>
          </div>
        )}
        <button
          onClick={onToggle}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          {collapsed ? '→' : '←'}
        </button>
      </div>

      {/* Enterprise Selector */}
      {!collapsed && (
        <div className="p-4 border-b border-gray-200">
          <select
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
            value={currentEnterprise || ''}
            onChange={(e) => onEnterpriseChange(e.target.value || null)}
          >
            <option value="">个人空间</option>
            {/* 企业列表会动态加载 */}
          </select>
        </div>
      )}

      {/* Menu */}
      <nav className="flex-1 p-2 overflow-y-auto">
        <ul className="space-y-1">
          {menuItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onModuleChange(item.id)}
                className={clsx(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
                  activeModule === item.id
                    ? 'bg-indigo-50 text-indigo-600'
                    : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                <span className="text-xl">{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Claw Menu */}
      {!collapsed && (
        <div className="px-3 py-2 border-t border-gray-200">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2">🐙 个人Claw</p>
        </div>
      )}
      <nav className="px-2 pb-2">
        <ul className="space-y-1">
          {tentacleMenuItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onModuleChange(item.id)}
                className={clsx(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm',
                  activeModule === item.id
                    ? 'bg-purple-50 text-purple-600 border border-purple-200'
                    : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                <span className="text-lg">{item.icon}</span>
                {!collapsed && (
                  <div className="text-left">
                    <div className="font-medium">{item.label}</div>
                    <div className="text-xs text-gray-400">{item.desc}</div>
                  </div>
                )}
              </button>
            </li>
          ))}
          {clawMenuItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onModuleChange(item.id)}
                className={clsx(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm',
                  activeModule === item.id
                    ? 'bg-indigo-50 text-indigo-600'
                    : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                <span className="text-lg relative">
                  {item.icon}
                  {item.id === 'notifications' && unreadCount > 0 && (
                    <span className="absolute -top-1 -right-2 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </span>
                {!collapsed && <span className="flex-1">{item.label}</span>}
                {item.id === 'notifications' && !collapsed && <Badge count={unreadCount} />}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* 触手与八爪鱼（需要选择企业） */}
      {currentEnterprise && !collapsed && (
        <div className="px-3 py-2 border-t border-gray-200">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2">🦑 触手 &amp; 🐙 八爪鱼</p>
        </div>
      )}
      {currentEnterprise && (
        <nav className="px-2 pb-2">
          <ul className="space-y-1">
            {brainMenuItems.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => onModuleChange(item.id)}
                  className={clsx(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm',
                    activeModule === item.id
                      ? 'bg-red-50 text-red-600 border border-red-200'
                      : 'text-gray-600 hover:bg-gray-100'
                  )}
                >
                  <span className="text-lg">{item.icon}</span>
                  {!collapsed && (
                    <div className="text-left">
                      <div className="font-medium">{item.label}</div>
                      <div className="text-xs text-gray-400">{item.desc}</div>
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* Settings */}
      <div className="p-2 border-t border-gray-200">
        <button
          onClick={() => onModuleChange('settings')}
          className={clsx(
            'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
            activeModule === 'settings'
              ? 'bg-indigo-50 text-indigo-600'
              : 'text-gray-600 hover:bg-gray-100'
          )}
        >
          <span className="text-xl">⚙️</span>
          {!collapsed && <span>设置</span>}
        </button>
      </div>
    </aside>
  )
}