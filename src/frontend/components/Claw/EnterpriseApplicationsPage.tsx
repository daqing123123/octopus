'use client'

import React, { useState, useEffect } from 'react'

interface Application {
  id: string
  user_id: string
  applicant_name: string
  applicant_email: string
  applicant_avatar: string
  apply_role: string
  message: string
  status: string
  created_at: string
  other_enterprises: number
}

interface ApplicationStats {
  pending: number
  approved: number
  rejected: number
}

export default function EnterpriseApplicationsPage({ enterpriseId }: { enterpriseId: string }) {
  const [applications, setApplications] = useState<Application[]>([])
  const [stats, setStats] = useState<ApplicationStats>({ pending: 0, approved: 0, rejected: 0 })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending')
  const [processing, setProcessing] = useState<string | null>(null)

  useEffect(() => {
    loadApplications()
  }, [enterpriseId, filter])

  const loadApplications = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/enterprises/${enterpriseId}/applications?status=${filter}`)
      const data = await res.json()
      if (data.success) {
        setApplications(data.data.applications)
        setStats(data.data.stats)
      }
    } catch (error) {
      console.error('Failed to load applications:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (appId: string) => {
    setProcessing(appId)
    try {
      const res = await fetch(`/api/enterprises/${enterpriseId}/applications/${appId}/approve`, {
        method: 'POST'
      })
      const data = await res.json()
      if (data.success) {
        alert(data.message)
        loadApplications()
      }
    } catch (error) {
      console.error('Approve failed:', error)
    } finally {
      setProcessing(null)
    }
  }

  const handleReject = async (appId: string) => {
    const reason = prompt('请输入拒绝原因（可选）：')
    setProcessing(appId)
    try {
      const res = await fetch(`/api/enterprises/${enterpriseId}/applications/${appId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      })
      const data = await res.json()
      if (data.success) {
        alert('已拒绝申请')
        loadApplications()
      }
    } catch (error) {
      console.error('Reject failed:', error)
    } finally {
      setProcessing(null)
    }
  }

  return (
    <div className="p-6">
      {/* 头部 */}
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-2">加入申请管理</h2>
        <p className="text-gray-500 text-sm">审批用户加入企业的申请</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⏳</span>
            <div>
              <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
              <p className="text-sm text-yellow-600">待处理</p>
            </div>
          </div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="text-2xl font-bold text-green-600">{stats.approved}</p>
              <p className="text-sm text-green-600">已批准</p>
            </div>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">❌</span>
            <div>
              <p className="text-2xl font-bold text-red-600">{stats.rejected}</p>
              <p className="text-sm text-red-600">已拒绝</p>
            </div>
          </div>
        </div>
      </div>

      {/* 筛选 */}
      <div className="flex gap-2 mb-6">
        {(['pending', 'approved', 'rejected', 'all'] as const).map(status => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === status
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {status === 'pending' ? '⏳ 待处理' :
             status === 'approved' ? '✅ 已批准' :
             status === 'rejected' ? '❌ 已拒绝' : '📋 全部'}
          </button>
        ))}
      </div>

      {/* 申请列表 */}
      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
        </div>
      ) : applications.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          <p className="text-4xl mb-4">📭</p>
          <p>{filter === 'pending' ? '暂无待处理的申请' : '暂无相关申请'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {applications.map(app => (
            <div key={app.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex items-start gap-4">
                {/* 头像 */}
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center text-white">
                  {app.applicant_avatar ? (
                    <img src={app.applicant_avatar} className="w-full h-full rounded-full" />
                  ) : (
                    <span className="text-xl">{app.applicant_name[0]}</span>
                  )}
                </div>

                {/* 信息 */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{app.applicant_name}</span>
                    <span className="text-sm text-gray-500">{app.applicant_email}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      app.apply_role === 'admin' ? 'bg-purple-100 text-purple-600' :
                      app.apply_role === 'member' ? 'bg-blue-100 text-blue-600' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {app.apply_role}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      app.status === 'pending' ? 'bg-yellow-100 text-yellow-600' :
                      app.status === 'approved' ? 'bg-green-100 text-green-600' :
                      'bg-red-100 text-red-600'
                    }`}>
                      {app.status === 'pending' ? '待处理' :
                       app.status === 'approved' ? '已批准' : '已拒绝'}
                    </span>
                  </div>

                  {/* 申请留言 */}
                  {app.message && (
                    <p className="text-gray-600 text-sm mb-2 p-2 bg-gray-50 rounded">
                      💬 {app.message}
                    </p>
                  )}

                  {/* 其他信息 */}
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span>申请时间: {new Date(app.created_at).toLocaleString()}</span>
                    <span>在其他企业: {app.other_enterprises} 个</span>
                  </div>
                </div>

                {/* 操作 */}
                {app.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(app.id)}
                      disabled={processing === app.id}
                      className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                    >
                      {processing === app.id ? '处理中...' : '✅ 批准'}
                    </button>
                    <button
                      onClick={() => handleReject(app.id)}
                      disabled={processing === app.id}
                      className="px-4 py-2 border border-red-300 text-red-500 rounded-lg hover:bg-red-50 disabled:opacity-50"
                    >
                      ❌ 拒绝
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 提示 */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h4 className="font-medium text-blue-700 mb-2">💡 审批说明</h4>
        <ul className="text-sm text-blue-600 space-y-1">
          <li>• 批准后，用户将自动加入企业并建立与个人Claw的连接</li>
          <li>• 拒绝后，用户可以重新提交申请</li>
          <li>• 建议查看用户在其他企业的表现后再做决定</li>
        </ul>
      </div>
    </div>
  )
}
