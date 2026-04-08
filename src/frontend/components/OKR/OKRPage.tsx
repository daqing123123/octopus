'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

interface OKR {
  id: string
  objective: string
  keyResults: KeyResult[]
  progress: number
  status: 'on_track' | 'at_risk' | 'behind'
  period: 'quarter' | 'year'
  year: number
  quarter?: number
  createdAt: string
}

interface KeyResult {
  id: string
  title: string
  targetValue: number
  currentValue: number
  unit: string
  progress: number
  status: 'not_started' | 'in_progress' | 'completed'
}

export default function OKRPage() {
  const [okrs, setOkrs] = useState<OKR[]>([])
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('list')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState<'all' | 'quarter' | 'year'>('all')

  const [newOKR, setNewOKR] = useState({
    objective: '',
    period: 'quarter' as 'quarter' | 'year',
    year: new Date().getFullYear(),
    quarter: Math.ceil((new Date().getMonth() + 1) / 3),
    keyResults: [{ title: '', targetValue: 100, unit: '%', currentValue: 0 }]
  })

  useEffect(() => {
    loadOKRs()
  }, [selectedPeriod])

  const loadOKRs = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const response = await axios.get(`${API_URL}/api/okr`, {
        params: { period: selectedPeriod === 'all' ? undefined : selectedPeriod },
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.data.success) {
        setOkrs(response.data.data)
      }
    } catch (error) {
      console.error('加载 OKR 失败:', error)
      toast.error('加载失败')
    } finally {
      setLoading(false)
    }
  }

  const createOKR = async () => {
    if (!newOKR.objective.trim()) {
      toast.error('请输入目标')
      return
    }

    try {
      const token = localStorage.getItem('token')
      const response = await axios.post(`${API_URL}/api/okr`, newOKR, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (response.data.success) {
        setOkrs(prev => [...prev, response.data.data])
        setShowCreateModal(false)
        resetNewOKR()
        toast.success('OKR 已创建')
      }
    } catch (error) {
      console.error('创建 OKR 失败:', error)
      toast.error('创建失败')
    }
  }

  const updateKeyResult = async (okrId: string, krId: string, currentValue: number) => {
    try {
      const token = localStorage.getItem('token')
      await axios.patch(`${API_URL}/api/okr/${okrId}/key-results/${krId}`, {
        currentValue
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })

      // 更新本地状态
      setOkrs(prev => prev.map(okr => {
        if (okr.id === okrId) {
          const updatedKRs = okr.keyResults.map(kr => {
            if (kr.id === krId) {
              const progress = Math.min(100, Math.round((currentValue / kr.targetValue) * 100))
              return { ...kr, currentValue, progress }
            }
            return kr
          })
          const totalProgress = Math.round(
            updatedKRs.reduce((sum, kr) => sum + kr.progress, 0) / updatedKRs.length
          )
          return { ...okr, keyResults: updatedKRs, progress: totalProgress }
        }
        return okr
      }))
    } catch (error) {
      console.error('更新失败:', error)
      toast.error('更新失败')
    }
  }

  const deleteOKR = async (okrId: string) => {
    if (!confirm('确定要删除这个 OKR 吗？')) return

    try {
      const token = localStorage.getItem('token')
      await axios.delete(`${API_URL}/api/okr/${okrId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      setOkrs(prev => prev.filter(o => o.id !== okrId))
      toast.success('已删除')
    } catch (error) {
      console.error('删除失败:', error)
      toast.error('删除失败')
    }
  }

  const resetNewOKR = () => {
    setNewOKR({
      objective: '',
      period: 'quarter',
      year: new Date().getFullYear(),
      quarter: Math.ceil((new Date().getMonth() + 1) / 3),
      keyResults: [{ title: '', targetValue: 100, unit: '%', currentValue: 0 }]
    })
  }

  const addKeyResult = () => {
    setNewOKR(prev => ({
      ...prev,
      keyResults: [...prev.keyResults, { title: '', targetValue: 100, unit: '%', currentValue: 0 }]
    }))
  }

  const removeKeyResult = (index: number) => {
    if (newOKR.keyResults.length <= 1) return
    setNewOKR(prev => ({
      ...prev,
      keyResults: prev.keyResults.filter((_, i) => i !== index)
    }))
  }

  const getStatusColor = (status: OKR['status']) => {
    switch (status) {
      case 'on_track': return 'bg-green-100 text-green-700'
      case 'at_risk': return 'bg-yellow-100 text-yellow-700'
      case 'behind': return 'bg-red-100 text-red-700'
    }
  }

  const getStatusLabel = (status: OKR['status']) => {
    switch (status) {
      case 'on_track': return '正常'
      case 'at_risk': return '风险'
      case 'behind': return '落后'
    }
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* 工具栏 */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-gray-900">OKR 目标管理</h2>
            
            <div className="flex items-center gap-2">
              {['all', 'quarter', 'year'].map(period => (
                <button
                  key={period}
                  onClick={() => setSelectedPeriod(period as typeof selectedPeriod)}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-sm',
                    selectedPeriod === period
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'hover:bg-gray-100 text-gray-600'
                  )}
                >
                  {period === 'all' ? '全部' : period === 'quarter' ? '季度' : '年度'}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            + 新建 OKR
          </button>
        </div>
      </div>

      {/* OKR 列表 */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="text-center text-gray-500 py-12">加载中...</div>
        ) : okrs.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🎯</div>
            <p className="text-gray-500 mb-4">还没有 OKR，创建第一个目标吧</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              创建 OKR
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {okrs.map(okr => (
              <div
                key={okr.id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
              >
                {/* 头部 */}
                <div className="p-6 border-b border-gray-100">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-semibold text-gray-900">{okr.objective}</h3>
                        <span className={clsx(
                          'px-2 py-1 rounded-full text-xs font-medium',
                          getStatusColor(okr.status)
                        )}>
                          {getStatusLabel(okr.status)}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500">
                        {okr.period === 'quarter' 
                          ? `${okr.year}年 Q${okr.quarter}` 
                          : `${okr.year}年`}
                      </div>
                    </div>

                    {/* 进度环 */}
                    <div className="text-center">
                      <div className="relative w-20 h-20">
                        <svg className="w-20 h-20 transform -rotate-90">
                          <circle
                            cx="40"
                            cy="40"
                            r="36"
                            stroke="#e5e7eb"
                            strokeWidth="8"
                            fill="none"
                          />
                          <circle
                            cx="40"
                            cy="40"
                            r="36"
                            stroke="#6366f1"
                            strokeWidth="8"
                            fill="none"
                            strokeDasharray={`${okr.progress * 2.26} 226`}
                            className="transition-all duration-500"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-xl font-bold text-gray-900">{okr.progress}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 关键结果 */}
                <div className="p-6">
                  <h4 className="text-sm font-medium text-gray-500 mb-4">关键结果</h4>
                  <div className="space-y-4">
                    {okr.keyResults.map((kr, index) => (
                      <div key={kr.id} className="flex items-center gap-4">
                        <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center text-xs font-medium text-indigo-600">
                          {index + 1}
                        </div>
                        
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-gray-900">{kr.title}</span>
                            <span className="text-sm text-gray-500">
                              {kr.currentValue} / {kr.targetValue} {kr.unit}
                            </span>
                          </div>
                          
                          {/* 进度条 */}
                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(100, kr.progress)}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium text-gray-600 w-12 text-right">
                              {kr.progress}%
                            </span>
                            
                            {/* 快捷调整 */}
                            <input
                              type="number"
                              value={kr.currentValue}
                              onChange={(e) => updateKeyResult(okr.id, kr.id, Number(e.target.value))}
                              className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-right"
                              min={0}
                              max={kr.targetValue}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="px-6 py-3 bg-gray-50 flex justify-end gap-2">
                  <button
                    onClick={() => deleteOKR(okr.id)}
                    className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 创建 OKR 弹窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">新建 OKR</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">目标 (Objective)</label>
                <input
                  type="text"
                  value={newOKR.objective}
                  onChange={(e) => setNewOKR({ ...newOKR, objective: e.target.value })}
                  placeholder="例如：成为行业领先的产品"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">周期类型</label>
                  <select
                    value={newOKR.period}
                    onChange={(e) => setNewOKR({ ...newOKR, period: e.target.value as 'quarter' | 'year' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="quarter">季度</option>
                    <option value="year">年度</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">年份</label>
                  <select
                    value={newOKR.year}
                    onChange={(e) => setNewOKR({ ...newOKR, year: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    {[2024, 2025, 2026].map(y => (
                      <option key={y} value={y}>{y}年</option>
                    ))}
                  </select>
                </div>
              </div>

              {newOKR.period === 'quarter' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">季度</label>
                  <select
                    value={newOKR.quarter}
                    onChange={(e) => setNewOKR({ ...newOKR, quarter: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    {[1, 2, 3, 4].map(q => (
                      <option key={q} value={q}>Q{q}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* 关键结果 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">关键结果 (Key Results)</label>
                  <button
                    onClick={addKeyResult}
                    className="text-sm text-indigo-600 hover:text-indigo-700"
                  >
                    + 添加
                  </button>
                </div>
                
                <div className="space-y-3">
                  {newOKR.keyResults.map((kr, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <span className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-2">
                        {index + 1}
                      </span>
                      <input
                        type="text"
                        value={kr.title}
                        onChange={(e) => {
                          const newKRs = [...newOKR.keyResults]
                          newKRs[index] = { ...newKRs[index], title: e.target.value }
                          setNewOKR({ ...newOKR, keyResults: newKRs })
                        }}
                        placeholder="关键结果描述"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                      <input
                        type="number"
                        value={kr.targetValue}
                        onChange={(e) => {
                          const newKRs = [...newOKR.keyResults]
                          newKRs[index] = { ...newKRs[index], targetValue: Number(e.target.value) }
                          setNewOKR({ ...newOKR, keyResults: newKRs })
                        }}
                        className="w-20 px-2 py-2 border border-gray-300 rounded-lg text-sm"
                        placeholder="目标值"
                      />
                      <input
                        type="text"
                        value={kr.unit}
                        onChange={(e) => {
                          const newKRs = [...newOKR.keyResults]
                          newKRs[index] = { ...newKRs[index], unit: e.target.value }
                          setNewOKR({ ...newOKR, keyResults: newKRs })
                        }}
                        className="w-16 px-2 py-2 border border-gray-300 rounded-lg text-sm"
                        placeholder="单位"
                      />
                      {newOKR.keyResults.length > 1 && (
                        <button
                          onClick={() => removeKeyResult(index)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setShowCreateModal(false); resetNewOKR() }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                取消
              </button>
              <button
                onClick={createOKR}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}