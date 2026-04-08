'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

interface CalendarEvent {
  id: string
  title: string
  description?: string
  startTime: string
  endTime: string
  allDay: boolean
  color: string
  type: 'meeting' | 'task' | 'reminder' | 'other'
  attendees?: { id: string; name: string }[]
  location?: string
}

const EVENT_COLORS = [
  { id: 'blue', bg: 'bg-blue-100', border: 'border-blue-500', text: 'text-blue-700' },
  { id: 'green', bg: 'bg-green-100', border: 'border-green-500', text: 'text-green-700' },
  { id: 'red', bg: 'bg-red-100', border: 'border-red-500', text: 'text-red-700' },
  { id: 'yellow', bg: 'bg-yellow-100', border: 'border-yellow-500', text: 'text-yellow-700' },
  { id: 'purple', bg: 'bg-purple-100', border: 'border-purple-500', text: 'text-purple-700' },
  { id: 'pink', bg: 'bg-pink-100', border: 'border-pink-500', text: 'text-pink-700' },
]

const TYPE_ICONS = {
  meeting: '📅',
  task: '✅',
  reminder: '⏰',
  other: '📌'
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month')
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [showEventModal, setShowEventModal] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)

  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    startTime: '',
    endTime: '',
    allDay: false,
    color: 'blue',
    type: 'other' as CalendarEvent['type'],
    location: ''
  })

  useEffect(() => {
    loadEvents()
  }, [currentDate])

  const loadEvents = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)

      const response = await axios.get(`${API_URL}/api/calendar/events`, {
        params: {
          start: startOfMonth.toISOString(),
          end: endOfMonth.toISOString()
        },
        headers: { Authorization: `Bearer ${token}` }
      })

      if (response.data.success) {
        setEvents(response.data.data)
      }
    } catch (error) {
      console.error('加载日历失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const createEvent = async () => {
    if (!newEvent.title.trim()) {
      toast.error('请输入事件标题')
      return
    }

    try {
      const token = localStorage.getItem('token')
      const response = await axios.post(`${API_URL}/api/calendar/events`, newEvent, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (response.data.success) {
        setEvents(prev => [...prev, response.data.data])
        setShowEventModal(false)
        resetNewEvent()
        toast.success('事件已创建')
      }
    } catch (error) {
      console.error('创建事件失败:', error)
      toast.error('创建失败')
    }
  }

  const deleteEvent = async (eventId: string) => {
    if (!confirm('确定要删除这个事件吗？')) return

    try {
      const token = localStorage.getItem('token')
      await axios.delete(`${API_URL}/api/calendar/events/${eventId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      setEvents(prev => prev.filter(e => e.id !== eventId))
      setSelectedEvent(null)
      toast.success('事件已删除')
    } catch (error) {
      console.error('删除失败:', error)
      toast.error('删除失败')
    }
  }

  const resetNewEvent = () => {
    setNewEvent({
      title: '',
      description: '',
      startTime: '',
      endTime: '',
      allDay: false,
      color: 'blue',
      type: 'other',
      location: ''
    })
  }

  // 获取月份天数
  const getDaysInMonth = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    
    const days: Date[] = []
    
    // 添加上月日期填充
    const startPadding = firstDay.getDay()
    for (let i = startPadding - 1; i >= 0; i--) {
      days.push(new Date(year, month, -i))
    }
    
    // 当月日期
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i))
    }
    
    // 添加下月日期填充
    const remaining = 42 - days.length
    for (let i = 1; i <= remaining; i++) {
      days.push(new Date(year, month + 1, i))
    }
    
    return days
  }

  // 获取某天的事件
  const getEventsForDay = (date: Date) => {
    return events.filter(event => {
      const eventStart = new Date(event.startTime)
      return eventStart.toDateString() === date.toDateString()
    })
  }

  // 导航
  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  const isToday = (date: Date) => {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === currentDate.getMonth()
  }

  const getColorClass = (colorId: string) => {
    return EVENT_COLORS.find(c => c.id === colorId) || EVENT_COLORS[0]
  }

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  const weekDays = ['日', '一', '二', '三', '四', '五', '六']

  return (
    <div className="h-full flex flex-col bg-white">
      {/* 工具栏 */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg">
              ←
            </button>
            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg">
              →
            </button>
            <button onClick={goToToday} className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50">
              今天
            </button>
            <h2 className="text-xl font-semibold">
              {currentDate.getFullYear()}年{currentDate.getMonth() + 1}月
            </h2>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {(['month', 'week', 'day'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={clsx(
                    'px-3 py-1.5 rounded text-sm',
                    viewMode === mode ? 'bg-white shadow' : ''
                  )}
                >
                  {mode === 'month' ? '月' : mode === 'week' ? '周' : '日'}
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                resetNewEvent()
                setShowEventModal(true)
              }}
              className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              + 新建事件
            </button>
          </div>
        </div>
      </div>

      {/* 日历主体 */}
      <div className="flex-1 overflow-auto">
        {/* 星期标题 */}
        <div className="grid grid-cols-7 border-b border-gray-200">
          {weekDays.map(day => (
            <div key={day} className="py-2 text-center text-sm font-medium text-gray-500 border-r last:border-r-0">
              {day}
            </div>
          ))}
        </div>

        {/* 日期网格 */}
        <div className="grid grid-cols-7 flex-1">
          {getDaysInMonth().map((date, index) => {
            const dayEvents = getEventsForDay(date)
            
            return (
              <div
                key={index}
                onClick={() => {
                  setSelectedDate(date)
                }}
                onDoubleClick={() => {
                  setSelectedDate(date)
                  setNewEvent({
                    ...newEvent,
                    startTime: new Date(date.setHours(9, 0, 0, 0)).toISOString(),
                    endTime: new Date(date.setHours(10, 0, 0, 0)).toISOString()
                  })
                  setShowEventModal(true)
                }}
                className={clsx(
                  'min-h-[100px] border-r border-b border-gray-200 p-1 cursor-pointer hover:bg-gray-50',
                  !isCurrentMonth(date) && 'bg-gray-50',
                  isToday(date) && 'bg-indigo-50'
                )}
              >
                <div className={clsx(
                  'text-sm font-medium mb-1',
                  isToday(date) ? 'text-indigo-600' : isCurrentMonth(date) ? 'text-gray-900' : 'text-gray-400'
                )}>
                  {date.getDate()}
                </div>
                
                {/* 事件列表 */}
                <div className="space-y-1">
                  {dayEvents.slice(0, 3).map(event => {
                    const color = getColorClass(event.color)
                    return (
                      <div
                        key={event.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedEvent(event)
                        }}
                        className={clsx(
                          'text-xs px-1 py-0.5 rounded truncate border-l-2 cursor-pointer',
                          color.bg, color.border, color.text
                        )}
                      >
                        {!event.allDay && formatTime(event.startTime) + ' '}
                        {event.title}
                      </div>
                    )
                  })}
                  {dayEvents.length > 3 && (
                    <div className="text-xs text-gray-500 px-1">
                      +{dayEvents.length - 3} 更多
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 创建事件弹窗 */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">新建事件</h3>

            <div className="space-y-4">
              <div>
                <input
                  type="text"
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  placeholder="事件标题"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">开始时间</label>
                  <input
                    type="datetime-local"
                    value={newEvent.startTime.slice(0, 16)}
                    onChange={(e) => setNewEvent({ ...newEvent, startTime: new Date(e.target.value).toISOString() })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">结束时间</label>
                  <input
                    type="datetime-local"
                    value={newEvent.endTime.slice(0, 16)}
                    onChange={(e) => setNewEvent({ ...newEvent, endTime: new Date(e.target.value).toISOString() })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newEvent.allDay}
                    onChange={(e) => setNewEvent({ ...newEvent, allDay: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm">全天事件</span>
                </label>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">类型</label>
                <select
                  value={newEvent.type}
                  onChange={(e) => setNewEvent({ ...newEvent, type: e.target.value as CalendarEvent['type'] })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="meeting">📅 会议</option>
                  <option value="task">✅ 任务</option>
                  <option value="reminder">⏰ 提醒</option>
                  <option value="other">📌 其他</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-2">颜色</label>
                <div className="flex gap-2">
                  {EVENT_COLORS.map(color => (
                    <button
                      key={color.id}
                      onClick={() => setNewEvent({ ...newEvent, color: color.id })}
                      className={clsx(
                        'w-8 h-8 rounded-full border-2',
                        color.bg,
                        newEvent.color === color.id ? 'ring-2 ring-offset-2 ring-indigo-500' : ''
                      )}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">地点</label>
                <input
                  type="text"
                  value={newEvent.location}
                  onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                  placeholder="事件地点"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">描述</label>
                <textarea
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  rows={2}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setShowEventModal(false); resetNewEvent() }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                取消
              </button>
              <button
                onClick={createEvent}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 事件详情侧边栏 */}
      {selectedEvent && (
        <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-xl z-50">
          <div className="h-full flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold">事件详情</h3>
              <button onClick={() => setSelectedEvent(null)} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{TYPE_ICONS[selectedEvent.type]}</span>
                <h2 className="text-xl font-semibold">{selectedEvent.title}</h2>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-gray-600">
                  <span>🕐</span>
                  <span>
                    {selectedEvent.allDay
                      ? '全天'
                      : `${formatTime(selectedEvent.startTime)} - ${formatTime(selectedEvent.endTime)}`}
                  </span>
                </div>

                {selectedEvent.location && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <span>📍</span>
                    <span>{selectedEvent.location}</span>
                  </div>
                )}

                {selectedEvent.description && (
                  <div className="pt-2 border-t border-gray-200">
                    <p className="text-gray-700">{selectedEvent.description}</p>
                  </div>
                )}

                {selectedEvent.attendees && selectedEvent.attendees.length > 0 && (
                  <div className="pt-2 border-t border-gray-200">
                    <h4 className="text-sm font-medium text-gray-500 mb-2">参与者</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedEvent.attendees.map(attendee => (
                        <div key={attendee.id} className="flex items-center gap-2 px-2 py-1 bg-gray-100 rounded">
                          <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center text-xs">
                            {attendee.name[0]}
                          </div>
                          <span className="text-sm">{attendee.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-gray-200">
              <button
                onClick={() => deleteEvent(selectedEvent.id)}
                className="w-full py-2 text-red-600 hover:bg-red-50 rounded-lg"
              >
                删除事件
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}