'use client'

import { useState, useEffect } from 'react'

interface StatCard {
  icon: string
  label: string
  value: string | number
  change?: string
  color: string
}

export default function Dashboard() {
  const [stats, setStats] = useState<StatCard[]>([
    { icon: '📋', label: '待办任务', value: 12, color: 'bg-blue-50 text-blue-600' },
    { icon: '📊', label: '多维表格', value: 5, color: 'bg-green-50 text-green-600' },
    { icon: '📝', label: '云文档', value: 28, color: 'bg-purple-50 text-purple-600' },
    { icon: '💬', label: '未读消息', value: 3, color: 'bg-orange-50 text-orange-600' },
  ])

  const [recentTasks, setRecentTasks] = useState([
    { id: 1, title: '完成项目方案设计', status: 'in_progress', priority: 'high', dueDate: '2026-04-10' },
    { id: 2, title: '团队周会', status: 'todo', priority: 'medium', dueDate: '2026-04-08' },
    { id: 3, title: '审核合同文档', status: 'todo', priority: 'high', dueDate: '2026-04-09' },
    { id: 4, title: '准备季度报告', status: 'completed', priority: 'medium', dueDate: '2026-04-07' },
  ])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-700'
      case 'in_progress': return 'bg-blue-100 text-blue-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed': return '已完成'
      case 'in_progress': return '进行中'
      default: return '待办'
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-500'
      case 'medium': return 'bg-yellow-500'
      default: return 'bg-gray-400'
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Welcome */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl p-6 text-white">
        <h1 className="text-2xl font-bold mb-2">欢迎回来！ 👋</h1>
        <p className="text-indigo-100">今天是 {new Date().toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl ${stat.color}`}>
                {stat.icon}
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-1">{stat.label}</p>
            <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tasks */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">待办任务</h2>
            <button className="text-sm text-indigo-600 hover:text-indigo-700">查看全部</button>
          </div>
          <div className="divide-y divide-gray-100">
            {recentTasks.map((task) => (
              <div key={task.id} className="p-4 flex items-center gap-4 hover:bg-gray-50">
                <div className={`w-2 h-2 rounded-full ${getPriorityColor(task.priority)}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                  <p className="text-xs text-gray-500">截止：{task.dueDate}</p>
                </div>
                <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(task.status)}`}>
                  {getStatusLabel(task.status)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">快速操作</h2>
          </div>
          <div className="p-4 space-y-3">
            <button className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-indigo-500 hover:bg-indigo-50 transition-colors">
              <span className="text-xl">📝</span>
              <span className="text-sm font-medium">新建文档</span>
            </button>
            <button className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-indigo-500 hover:bg-indigo-50 transition-colors">
              <span className="text-xl">📊</span>
              <span className="text-sm font-medium">新建表格</span>
            </button>
            <button className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-indigo-500 hover:bg-indigo-50 transition-colors">
              <span className="text-xl">✅</span>
              <span className="text-sm font-medium">新建任务</span>
            </button>
            <button className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-indigo-500 hover:bg-indigo-50 transition-colors">
              <span className="text-xl">🤖</span>
              <span className="text-sm font-medium">AI 对话</span>
            </button>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">最近动态</h2>
        </div>
        <div className="p-4">
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-sm">📄</div>
              <div>
                <p className="text-sm text-gray-900">你创建了文档 <span className="font-medium">项目计划书</span></p>
                <p className="text-xs text-gray-500">2小时前</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-sm">✅</div>
              <div>
                <p className="text-sm text-gray-900">你完成了任务 <span className="font-medium">审核合同</span></p>
                <p className="text-xs text-gray-500">昨天</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-sm">💬</div>
              <div>
                <p className="text-sm text-gray-900"><span className="font-medium">张三</span> 在 <span className="font-medium">产品讨论组</span> 提到了你</p>
                <p className="text-xs text-gray-500">昨天</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}