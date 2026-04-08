'use client'

import React, { useState, useEffect } from 'react'

// ============================================
// 共享响应式组件库 - PC + Mobile 双端兼容
// 所有组件均支持桌面端和移动端自适应
// ============================================

// ============================================
// 断点Hook
// ============================================
export function useBreakpoint() {
  const [breakpoint, setBreakpoint] = useState<'mobile' | 'tablet' | 'desktop'>('desktop')

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth
      if (w < 640) setBreakpoint('mobile')
      else if (w < 1024) setBreakpoint('tablet')
      else setBreakpoint('desktop')
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return breakpoint
}

// ============================================
// 移动端底部导航栏
// ============================================
interface TabItem {
  id: string
  icon: string
  label: string
  badge?: number
  color?: string
}

interface MobileTabBarProps {
  tabs: TabItem[]
  activeTab: string
  onTabChange: (id: string) => void
}

export function MobileTabBar({ tabs, activeTab, onTabChange }: MobileTabBarProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-bottom">
      <div className="flex justify-around items-center h-14">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex flex-col items-center justify-center flex-1 h-full relative transition-colors ${
              activeTab === tab.id
                ? tab.color ? `text-${tab.color}-600` : 'text-purple-600'
                : 'text-gray-400'
            }`}
          >
            <div className="relative">
              <span className="text-xl">{tab.icon}</span>
              {tab.badge && tab.badge > 0 && (
                <span className="absolute -top-1 -right-2 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                  {tab.badge > 9 ? '9+' : tab.badge}
                </span>
              )}
            </div>
            <span className="text-xs mt-0.5">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}

// ============================================
// PC端侧边栏项
// ============================================
interface SidebarItemProps {
  icon: string
  label: string
  badge?: number
  active?: boolean
  collapsed?: boolean
  onClick?: () => void
}

export function SidebarItem({ icon, label, badge, active, collapsed, onClick }: SidebarItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm ${
        active
          ? 'bg-purple-50 text-purple-600 font-medium border-l-2 border-purple-600'
          : 'text-gray-600 hover:bg-gray-100'
      } ${collapsed ? 'justify-center' : ''}`}
    >
      <span className="text-lg relative">
        {icon}
        {badge && badge > 0 && (
          <span className="absolute -top-1 -right-2 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </span>
      {!collapsed && (
        <span className="flex-1 text-left truncate">{label}</span>
      )}
    </button>
  )
}

// ============================================
// 卡片组件（PC双栏，移动端全宽）
// ============================================
interface CardProps {
  title?: string
  icon?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  padding?: boolean
}

export function Card({ title, icon, action, children, className = '', padding = true }: CardProps) {
  const bp = useBreakpoint()
  const isMobile = bp === 'mobile'

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 ${className}`}>
      {(title || action) && (
        <div className={`flex items-center justify-between ${isMobile ? 'px-4 py-3' : 'px-6 py-4'} border-b border-gray-100`}>
          <div className="flex items-center gap-2">
            {icon && <span className="text-xl">{icon}</span>}
            {title && <h3 className={`font-semibold ${isMobile ? 'text-base' : 'text-lg'}`}>{title}</h3>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={padding ? (isMobile ? 'p-4' : 'p-6') : ''}>
        {children}
      </div>
    </div>
  )
}

// ============================================
// 统计卡片
// ============================================
interface StatCardProps {
  icon: string
  label: string
  value: string | number
  subValue?: string
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  color?: 'purple' | 'blue' | 'green' | 'orange' | 'red'
  className?: string
}

export function StatCard({ icon, label, value, subValue, trend, trendValue, color = 'purple', className = '' }: StatCardProps) {
  const colors = {
    purple: 'from-purple-50 to-purple-100 text-purple-600',
    blue: 'from-blue-50 to-blue-100 text-blue-600',
    green: 'from-green-50 to-green-100 text-green-600',
    orange: 'from-orange-50 to-orange-100 text-orange-600',
    red: 'from-red-50 to-red-100 text-red-600',
  }

  return (
    <div className={`bg-gradient-to-br ${colors[color]} rounded-xl p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{icon}</span>
        <span className="text-sm opacity-70">{label}</span>
      </div>
      <div className="text-3xl font-bold mb-1">{value}</div>
      {(subValue || trendValue) && (
        <div className="flex items-center gap-2 text-sm">
          {trend && (
            <span className={trend === 'up' ? 'text-green-700' : trend === 'down' ? 'text-red-700' : 'text-gray-600'}>
              {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendValue}
            </span>
          )}
          {subValue && <span className="opacity-70">{subValue}</span>}
        </div>
      )}
    </div>
  )
}

// ============================================
// 搜索栏（移动端放大镜图标，PC端全宽）
// ============================================
interface SearchBarProps {
  placeholder?: string
  value: string
  onChange: (v: string) => void
  onSearch?: (v: string) => void
  autoFocus?: boolean
  className?: string
}

export function SearchBar({ placeholder = '搜索...', value, onChange, onSearch, autoFocus, className = '' }: SearchBarProps) {
  const [focused, setFocused] = useState(false)
  const bp = useBreakpoint()

  return (
    <div className={`relative ${className}`}>
      {bp === 'mobile' && !focused ? (
        <button
          onClick={() => setFocused(true)}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200"
        >
          <span className="text-lg">🔍</span>
        </button>
      ) : (
        <div className={`flex items-center gap-2 ${bp === 'mobile' ? 'w-full' : 'w-64'}`}>
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input
              type="text"
              value={value}
              onChange={e => onChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(bp !== 'mobile')}
              onKeyDown={e => e.key === 'Enter' && onSearch?.(value)}
              placeholder={placeholder}
              autoFocus={autoFocus || bp === 'mobile'}
              className={`w-full pl-10 pr-4 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all ${
                bp === 'mobile' ? 'h-10' : 'h-9'
              }`}
            />
          </div>
          {bp === 'mobile' && (
            <button
              onClick={() => { setFocused(false); onChange('') }}
              className="text-gray-400 text-sm"
            >
              取消
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================
// 移动端顶部标题栏
// ============================================
interface PageHeaderProps {
  title: string
  subtitle?: string
  icon?: string
  leftAction?: React.ReactNode
  rightAction?: React.ReactNode
  transparent?: boolean
}

export function PageHeader({ title, subtitle, icon, leftAction, rightAction, transparent }: PageHeaderProps) {
  const bp = useBreakpoint()

  if (bp === 'mobile') {
    return (
      <header className={`sticky top-0 z-40 ${transparent ? '' : 'bg-white border-b'} safe-area-top`}>
        <div className="flex items-center justify-between h-12 px-4">
          <div className="flex-1 flex items-center">
            {leftAction || <div className="w-8" />}
          </div>
          <div className="flex-1 text-center">
            <h1 className="text-base font-semibold truncate">{icon ? `${icon} ${title}` : title}</h1>
          </div>
          <div className="flex-1 flex justify-end">
            {rightAction || <div className="w-8" />}
          </div>
        </div>
        {subtitle && <div className="text-xs text-gray-400 text-center pb-1">{subtitle}</div>}
      </header>
    )
  }

  return (
    <header className="bg-white border-b px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {icon && <span className="text-3xl">{icon}</span>}
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            {subtitle && <p className="text-gray-500 text-sm mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {rightAction && <div>{rightAction}</div>}
      </div>
    </header>
  )
}

// ============================================
// 标签切换（移动端横向滚动）
// ============================================
interface TabSwitchProps {
  tabs: { id: string; label: string; badge?: number }[]
  activeTab: string
  onTabChange: (id: string) => void
}

export function TabSwitch({ tabs, activeTab, onTabChange }: TabSwitchProps) {
  const bp = useBreakpoint()
  const scrollRef = React.useRef<HTMLDivElement>(null)

  return (
    <div
      ref={scrollRef}
      className={`flex gap-1 border-b ${bp === 'mobile' ? 'overflow-x-auto scrollbar-hide' : ''}`}
      style={bp === 'mobile' ? { WebkitOverflowScrolling: 'touch' } : {}}
    >
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => {
            onTabChange(tab.id)
            scrollRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
          }}
          className={`flex-shrink-0 px-4 py-2.5 border-b-2 transition-colors text-sm whitespace-nowrap ${
            activeTab === tab.id
              ? 'border-purple-600 text-purple-600 font-medium'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {tab.label}
          {tab.badge !== undefined && tab.badge > 0 && (
            <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
              activeTab === tab.id ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-600'
            }`}>
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

// ============================================
// 进度条 / 环形进度
// ============================================
interface ProgressRingProps {
  percent: number
  size?: number
  strokeWidth?: number
  color?: string
  label?: string
  showPercent?: boolean
}

export function ProgressRing({ percent, size = 80, strokeWidth = 8, color = '#8b5cf6', label, showPercent = true }: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percent / 100) * circumference

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {showPercent && <span className="text-lg font-bold" style={{ color }}>{percent}%</span>}
        {label && <span className="text-xs text-gray-400">{label}</span>}
      </div>
    </div>
  )
}

// ============================================
// 列表项（移动端大触摸区域，PC端紧凑）
// ============================================
interface ListItemProps {
  avatar?: string
  icon?: string
  title: string
  subtitle?: string
  badge?: string | number
  badgeColor?: string
  rightText?: string
  rightSubtext?: string
  arrow?: boolean
  onClick?: () => void
  status?: 'online' | 'offline' | 'busy' | 'away'
  className?: string
}

export function ListItem({ avatar, icon, title, subtitle, badge, badgeColor, rightText, rightSubtext, arrow, onClick, status, className = '' }: ListItemProps) {
  const statusColors: Record<string, string> = {
    online: 'bg-green-500', offline: 'bg-gray-400', busy: 'bg-red-500', away: 'bg-yellow-500'
  }

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 ${onClick ? 'cursor-pointer' : ''} ${
        onClick ? 'active:bg-gray-100' : ''
      } transition-colors ${className}`}
    >
      <div className="relative flex-shrink-0">
        {avatar ? (
          <img src={avatar} alt={title} className="w-10 h-10 rounded-full object-cover" />
        ) : icon ? (
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-lg">
            {icon}
          </div>
        ) : null}
        {status && (
          <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${statusColors[status]}`} />
        )}
      </div>
      <div className="flex-1 min-w-0 py-3">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{title}</span>
          {badge !== undefined && (
            <span className={`px-1.5 py-0.5 rounded text-xs ${
              badgeColor ? `bg-${badgeColor}-100 text-${badgeColor}-700` : 'bg-gray-100 text-gray-600'
            }`}>{badge}</span>
          )}
        </div>
        {subtitle && <div className="text-sm text-gray-500 truncate">{subtitle}</div>}
      </div>
      <div className="flex-shrink-0 text-right">
        {rightText && <div className="text-sm text-gray-600">{rightText}</div>}
        {rightSubtext && <div className="text-xs text-gray-400">{rightSubtext}</div>}
      </div>
      {arrow && <span className="text-gray-300 ml-1">›</span>}
    </div>
  )
}

// ============================================
// 空状态
// ============================================
interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ icon = '📭', title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-5xl mb-4">{icon}</div>
      <h3 className="text-lg font-medium text-gray-700 mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-400 max-w-xs">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

// ============================================
// 按钮
// ============================================
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: string
  loading?: boolean
  block?: boolean
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-purple-600 text-white hover:bg-purple-700 active:bg-purple-800',
  secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300',
  ghost: 'text-gray-600 hover:bg-gray-100 active:bg-gray-200',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg',
  md: 'h-10 px-4 text-sm rounded-xl',
  lg: 'h-12 px-6 text-base rounded-xl',
}

export function Button({ variant = 'primary', size = 'md', icon, loading, block, children, className = '', disabled, ...props }: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantStyles[variant]} ${sizeStyles[size]} ${block ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {loading ? '⏳' : icon && <span>{icon}</span>}
      {children}
    </button>
  )
}

// ============================================
// 移动端模态抽屉
// ============================================
interface DrawerProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  height?: string
}

export function Drawer({ open, onClose, title, children, height = '80vh' }: DrawerProps) {
  const bp = useBreakpoint()
  if (!open) return null

  if (bp === 'mobile') {
    return (
      <>
        <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl" style={{ height }}>
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="w-8" />
            {title && <h3 className="font-semibold">{title}</h3>}
            <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
          </div>
          <div className="overflow-y-auto p-4" style={{ height: `calc(${height} - 52px)` }}>
            {children}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-50" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          {title && <h3 className="font-semibold text-lg">{title}</h3>}
          <button onClick={onClose} className="text-gray-400 text-xl hover:text-gray-600">✕</button>
        </div>
        <div className="overflow-y-auto p-6">{children}</div>
      </div>
    </>
  )
}

// ============================================
// 标签 / Badge
// ============================================
interface BadgeProps {
  label: string
  color?: 'purple' | 'blue' | 'green' | 'orange' | 'red' | 'gray'
  variant?: 'filled' | 'outline'
  size?: 'sm' | 'md'
}

const badgeColors: Record<string, string> = {
  purple: 'bg-purple-100 text-purple-700',
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  orange: 'bg-orange-100 text-orange-700',
  red: 'bg-red-100 text-red-700',
  gray: 'bg-gray-100 text-gray-600',
}

export function Badge({ label, color = 'gray', variant = 'filled', size = 'sm' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center font-medium ${
      variant === 'filled' ? badgeColors[color] : `border ${badgeColors[color].replace('bg-', 'border-').replace('-100', '-300').replace('-700', '-600')}`
    } ${size === 'sm' ? 'px-2 py-0.5 rounded-full text-xs' : 'px-3 py-1 rounded-full text-sm'}`}>
      {label}
    </span>
  )
}

// ============================================
// Toast 提示（简单实现）
// ============================================
interface ToastProps {
  message: string
  type?: 'success' | 'error' | 'info'
  onClose: () => void
}

export function Toast({ message, type = 'info', onClose }: ToastProps) {
  const bgColors = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    info: 'bg-purple-600',
  }
  const icons = { success: '✅', error: '❌', info: '💡' }

  useEffect(() => {
    const t = setTimeout(onClose, 3000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] ${bgColors[type]} text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 max-w-xs`}>
      <span>{icons[type]}</span>
      <span className="text-sm font-medium">{message}</span>
    </div>
  )
}

// ============================================
// 评分星级
// ============================================
interface RatingProps {
  value: number
  onChange?: (v: number) => void
  max?: number
  size?: 'sm' | 'md' | 'lg'
}

export function RatingStars({ value, onChange, max = 5, size = 'md' }: RatingProps) {
  const sizes = { sm: 'text-lg', md: 'text-2xl', lg: 'text-3xl' }
  const colors = ['text-gray-300', 'text-yellow-400']

  return (
    <div className="flex gap-1">
      {Array.from({ length: max }).map((_, i) => (
        <button
          key={i}
          onClick={() => onChange?.(i + 1)}
          disabled={!onChange}
          className={`${sizes[size]} ${i < value ? colors[1] : colors[0]} transition-colors ${
            onChange ? 'cursor-pointer hover:scale-110' : ''
          }`}
        >
          ★
        </button>
      ))}
    </div>
  )
}

// ============================================
// 网格布局（PC多列，移动单列）
// ============================================
interface GridProps {
  cols?: { mobile: number; tablet: number; desktop: number }
  gap?: string
  children: React.ReactNode
  className?: string
}

export function ResponsiveGrid({ cols = { mobile: 1, tablet: 2, desktop: 4 }, gap = 'gap-4', children, className = '' }: GridProps) {
  const bp = useBreakpoint()
  const colClass = bp === 'mobile' ? `grid-cols-${cols.mobile}` : bp === 'tablet' ? `grid-cols-${cols.tablet}` : `grid-cols-${cols.desktop}`

  return (
    <div className={`grid ${colClass} ${gap} ${className}`}>
      {children}
    </div>
  )
}

// ============================================
// Divider
// ============================================
export function Divider({ label }: { label?: string }) {
  if (!label) return <div className="border-t border-gray-100 my-4" />
  return (
    <div className="flex items-center gap-4 my-4">
      <div className="flex-1 border-t border-gray-200" />
      <span className="text-xs text-gray-400">{label}</span>
      <div className="flex-1 border-t border-gray-200" />
    </div>
  )
}
