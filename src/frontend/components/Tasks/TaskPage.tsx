'use client'

import { useState, useEffect } from 'react'
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core'
import { SortableContext, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import axios from 'axios'
import toast from 'react-hot-toast'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

interface Task {
  id: string
  title: string
  description: string
  status: 'todo' | 'in_progress' | 'completed' | 'blocked'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  assignee?: { id: string; name: string; avatar_url?: string }
  dueDate?: string
  tags: string[]
  createdAt: string
}

const STATUS_CONFIG = {
  todo: { label: '待办', color: 'bg-gray-100 text-gray-700', icon: '📋' },
  in_progress: { label: '进行中', color: 'bg-blue-100 text-blue-700', icon: '🔄' },
  completed: { label: '已完成', color: 'bg-green-100 text-green-700', icon: '✅' },
  blocked: { label: '阻塞', color: 'bg-red-100 text-red-700', icon: '🚫' }
}

const PRIORITY_CONFIG = {
  low: { label: '低', color: 'bg-gray-400' },
  medium: { label: '中', color: 'bg-yellow-400' },
  high: { label: '高', color: 'bg-orange-400' },
  urgent: { label: '紧急', color: 'bg-red-500' }
}

export default function TaskPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [filterAssignee, setFilterAssignee] = useState<string>('all')

  // 新任务表单
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium' as Task['priority'],
    dueDate: ''
  })

  useEffect(() => {
    loadTasks()
  }, [])

  const loadTasks = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const response = await axios.get(`${API_URL}/api/tasks`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.data.success) {
        setTasks(response.data.data)
      }
    } catch (error) {
      console.error('加载任务失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const createTask = async () => {
    if (!newTask.title.trim()) {
      toast.error('请输入任务标题')
      return
    }

    try {
      const token = localStorage.getItem('token')
      const response = await axios.post(`${API_URL}/api/tasks`, newTask, {
        headers: { Authorization: `Bearer ${token}` }
      })
      
      if (response.data.success) {
        setTasks(prev => [...prev, response.data.data])
        setShowCreateModal(false)
        setNewTask({ title: '', description: '', priority: 'medium', dueDate: '' })
        toast.success('任务已创建')
      }
    } catch (error) {
      console.error('创建任务失败:', error)
      toast.error('创建失败')
    }
  }

  const updateTaskStatus = async (taskId: string, newStatus: Task['status']) => {
    try {
      const token = localStorage.getItem('token')
      await axios.patch(`${API_URL}/api/tasks/${taskId}`, {
        status: newStatus
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      
      setTasks(prev => prev.map(task => 
        task.id === taskId ? { ...task, status: newStatus } : task
      ))
    } catch (error) {
      console.error('更新任务失败:', error)
      toast.error('更新失败')
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    
    if (over && active.id !== over.id) {
      const taskId = active.id as string
      const newStatus = over.id as Task['status']
      updateTaskStatus(taskId, newStatus)
    }
  }

  // 看板列组件
  const KanbanColumn = ({ status }: { status: Task['status'] }) => {
    const config = STATUS_CONFIG[status]
    const columnTasks = tasks.filter(t => t.status === status)
    
    return (
      <div className="flex-1 min-w-[280px] max-w-[320px] bg-gray-50 rounded-lg">
        <div className="p-3 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>{config.icon}</span>
              <span className="font-medium">{config.label}</span>
              <span className="px-2 py-0.5 text-xs bg-gray-200 rounded-full">
                {columnTasks.length}
              </span>
            </div>
            <button className="text-gray-400 hover:text-gray-600">+</button>
          </div>
        </div>
        
        <div className="p-2 space-y-2 min-h-[200px]" id={status}>
          {columnTasks.map(task => (
            <TaskCard key={task.id} task={task} onClick={() => setSelectedTask(task)} />
          ))}
        </div>
      </div>
    )
  }

  // 任务卡片组件
  const TaskCard = ({ task, onClick }: { task: Task; onClick: () => void }) => {
    return (
      <div
        onClick={onClick}
        className="bg-white p-3 rounded-lg border border-gray-200 hover:shadow-md cursor-pointer transition-shadow"
      >
        <div className="flex items-start justify-between mb-2">
          <h4 className="font-medium text-gray-900 line-clamp-2">{task.title}</h4>
          <div className={`w-2 h-2 rounded-full ${PRIORITY_CONFIG[task.priority].color}`} />
        </div>
        
        {task.description && (
          <p className="text-sm text-gray-500 line-clamp-2 mb-2">{task.description}</p>
        )}
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {task.tags.slice(0, 2).map(tag => (
              <span key={tag} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                {tag}
              </span>
            ))}
          </div>
          
          {task.dueDate && (
            <span className="text-xs text-gray-500">
              📅 {new Date(task.dueDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
        
        {task.assignee && (
          <div className="mt-2 flex items-center gap-2">
            <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center text-xs">
              {task.assignee.name[0]}
            </div>
            <span className="text-xs text-gray-600">{task.assignee.name}</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-100">
      {/* 工具栏 */}
      <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-gray-900">任务管理</h2>
          
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 rounded text-sm ${
                viewMode === 'kanban' ? 'bg-white shadow' : ''
              }`}
            >
              📋 看板
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded text-sm ${
                viewMode === 'list' ? 'bg-white shadow' : ''
              }`}
            >
              📄 列表
            </button>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
          >
            <option value="all">所有优先级</option>
            <option value="urgent">紧急</option>
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
          
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
          >
            + 新建任务
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-x-auto p-4">
        {viewMode === 'kanban' ? (
          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="flex gap-4 h-full">
              {Object.keys(STATUS_CONFIG).map(status => (
                <KanbanColumn key={status} status={status as Task['status']} />
              ))}
            </div>
          </DndContext>
        ) : (
          <div className="bg-white rounded-lg">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left p-3 font-medium text-gray-500">任务</th>
                  <th className="text-left p-3 font-medium text-gray-500">状态</th>
                  <th className="text-left p-3 font-medium text-gray-500">优先级</th>
                  <th className="text-left p-3 font-medium text-gray-500">负责人</th>
                  <th className="text-left p-3 font-medium text-gray-500">截止日期</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map(task => (
                  <tr
                    key={task.id}
                    onClick={() => setSelectedTask(task)}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="p-3">
                      <div className="font-medium text-gray-900">{task.title}</div>
                      {task.description && (
                        <div className="text-sm text-gray-500 truncate max-w-xs">{task.description}</div>
                      )}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${STATUS_CONFIG[task.status].color}`}>
                        {STATUS_CONFIG[task.status].label}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${PRIORITY_CONFIG[task.priority].color}`} />
                        <span className="text-sm">{PRIORITY_CONFIG[task.priority].label}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      {task.assignee && (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center text-xs">
                            {task.assignee.name[0]}
                          </div>
                          <span className="text-sm">{task.assignee.name}</span>
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-sm text-gray-500">
                      {task.dueDate ? new Date(task.dueDate).toLocaleDateString('zh-CN') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 创建任务弹窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">新建任务</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
                <input
                  type="text"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  placeholder="输入任务标题"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <textarea
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  rows={3}
                  placeholder="输入任务描述"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">优先级</label>
                  <select
                    value={newTask.priority}
                    onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as Task['priority'] })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="low">低</option>
                    <option value="medium">中</option>
                    <option value="high">高</option>
                    <option value="urgent">紧急</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">截止日期</label>
                  <input
                    type="date"
                    value={newTask.dueDate}
                    onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                取消
              </button>
              <button
                onClick={createTask}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 任务详情侧边栏 */}
      {selectedTask && (
        <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-xl z-50">
          <div className="h-full flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold">任务详情</h3>
              <button
                onClick={() => setSelectedTask(null)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                ✕
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <h2 className="text-xl font-semibold">{selectedTask.title}</h2>
              </div>
              
              <div className="flex items-center gap-4">
                <span className={`px-3 py-1 rounded-full text-sm ${STATUS_CONFIG[selectedTask.status].color}`}>
                  {STATUS_CONFIG[selectedTask.status].label}
                </span>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${PRIORITY_CONFIG[selectedTask.priority].color}`} />
                  <span className="text-sm">{PRIORITY_CONFIG[selectedTask.priority].label}优先级</span>
                </div>
              </div>
              
              {selectedTask.description && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-1">描述</h4>
                  <p className="text-gray-700">{selectedTask.description}</p>
                </div>
              )}
              
              {selectedTask.dueDate && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-1">截止日期</h4>
                  <p>{new Date(selectedTask.dueDate).toLocaleDateString('zh-CN')}</p>
                </div>
              )}
              
              {selectedTask.assignee && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-1">负责人</h4>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                      {selectedTask.assignee.name[0]}
                    </div>
                    <span>{selectedTask.assignee.name}</span>
                  </div>
                </div>
              )}
              
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-1">标签</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedTask.tags.map(tag => (
                    <span key={tag} className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-sm">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-gray-200">
              <select
                value={selectedTask.status}
                onChange={(e) => {
                  updateTaskStatus(selectedTask.id, e.target.value as Task['status'])
                  setSelectedTask({ ...selectedTask, status: e.target.value as Task['status'] })
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>{config.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}