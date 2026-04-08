'use client'

import React, { useState, useEffect } from 'react'

interface Application {
  id: string
  enterprise_id: string
  enterprise_name: string
  enterprise_logo: string
  apply_role: string
  message: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  processed_at: string
  processor_name: string
}

export default function MyApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadApplications()
  }, [])

  const loadApplications = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/enterprises/my/applications')
      const data = await res.json()
      if (data.success) {
        setApplications(data.data)
      }
    } catch (error) {
      console.error('Failed to load applications:', error)
    } finally {
      setLoading(false)
    }
  }

  const pendingApps = applications.filter(a => a.status === 'pending')
  const processedApps = applications.filter(a => a.status !== 'pending')

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* 头部 */}
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-2">我的申请</h2>
        <p className="text-gray-500 text-sm">查看加入企业的申请状态</p>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
        </div>
      ) : applications.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          <p className="text-4xl mb-4">📭</p>
          <p>暂无申请记录</p>
          <p className="text-sm">去探索企业，开始申请加入吧！</p>
        </div>
      ) : (
        <>
          {/* 待处理 */}
          {pendingApps.length > 0 && (
            <div className="mb-8">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                待处理 ({pendingApps.length})
              </h3>
              <div className="space-y-4">
                {pendingApps.map(app => (
                  <div key={app.id} className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-400">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center text-white">
                        {app.enterprise_logo ? (
                          <img src={app.enterprise_logo} className="w-full h-full rounded-full" />
                        ) : (
                          <span className="text-xl">{app.enterprise_name[0]}</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{app.enterprise_name}</p>
                        <p className="text-sm text-gray-500">
                          申请角色: {app.apply_role} · {new Date(app.created_at).toLocaleDateString()}
                        </p>
                        {app.message && (
                          <p className="text-sm text-gray-600 mt-1">申请留言: {app.message}</p>
                        )}
                      </div>
                      <div className="px-4 py-2 bg-yellow-100 text-yellow-700 rounded-lg">
                        ⏳ 等待审批
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 已处理 */}
          {processedApps.length > 0 && (
            <div>
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                已处理 ({processedApps.length})
              </h3>
              <div className="space-y-3">
                {processedApps.map(app => (
                  <div 
                    key={app.id} 
                    className={`bg-white rounded-lg shadow p-4 border-l-4 ${
                      app.status === 'approved' ? 'border-green-400' : 'border-red-400'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500">
                        {app.enterprise_name[0]}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{app.enterprise_name}</p>
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            app.status === 'approved' 
                              ? 'bg-green-100 text-green-600' 
                              : 'bg-red-100 text-red-600'
                          }`}>
                            {app.status === 'approved' ? '✅ 已批准' : '❌ 已拒绝'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500">
                          处理时间: {app.processed_at ? new Date(app.processed_at).toLocaleDateString() : '-'}
                          {app.processor_name && ` · 由 ${app.processor_name} 处理`}
                        </p>
                      </div>
                      {app.status === 'approved' && (
                        <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                          进入企业 →
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
