'use client'

import { useState, useEffect, useCallback } from 'react'

// ================================================
// 离职管理面板
// 功能：
// 1. 智能交接清单
// 2. 权限回收
// 3. 数据导出
// 4. 离职调查
// 5. 经验带走
// ================================================

interface ChecklistItem {
  id: string
  title: string
  description: string
  item_type: string
  priority: number
  status: string
  assignee_id: string
  assignee_name: string
  due_date: string
  completed_at: string
}

interface Checklist {
  id: string
  title: string
  enterprise_name: string
  status: string
  total_items: number
  completed_items: number
  items: ChecklistItem[]
}

export default function OffboardingPanel({
  enterpriseId,
  onClose
}: {
  enterpriseId?: string
  onClose?: () => void
}) {
  const [activeTab, setActiveTab] = useState<'checklist' | 'permissions' | 'export' | 'survey' | 'experience'>('checklist')
  const [checklist, setChecklist] = useState<Checklist | null>(null)
  const [loading, setLoading] = useState(true)
  const [initiating, setInitiating] = useState(false)

  // 加载交接清单
  const loadChecklist = useCallback(async () => {
    try {
      const res = await fetch('/api/offboarding/my-checklist')
      const data = await res.json()
      if (data.success && data.data) {
        setChecklist(data.data)
      } else {
        setChecklist(null)
      }
    } catch (e) {
      console.error('加载交接清单失败', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadChecklist()
  }, [loadChecklist])

  // 发起离职流程
  const handleInitiate = async () => {
    if (!enterpriseId) {
      alert('请先选择一个企业')
      return
    }

    setInitiating(true)
    try {
      const res = await fetch('/api/offboarding/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enterpriseId,
          customItems: [
            { title: '整理工作文件夹', description: '将个人工作文件夹整理并移交', itemType: 'document', priority: 2 },
            { title: '更新联系人信息', description: '将重要联系人信息整理交接', itemType: 'person', priority: 3 }
          ]
        })
      })
      const data = await res.json()
      if (data.success) {
        alert('离职流程已发起！')
        loadChecklist()
      } else {
        alert(data.error || '发起失败')
      }
    } catch (e) {
      console.error('发起离职流程失败', e)
    } finally {
      setInitiating(false)
    }
  }

  // 更新交接项状态
  const handleUpdateItemStatus = async (itemId: string, status: string) => {
    try {
      await fetch(`/api/offboarding/items/${itemId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })
      loadChecklist()
    } catch (e) {
      console.error('更新状态失败', e)
    }
  }

  // 计算进度
  const progress = checklist ? Math.round((checklist.completed_items / checklist.total_items) * 100) : 0

  const tabs = [
    { key: 'checklist', label: '📋', title: '交接清单' },
    { key: 'permissions', label: '🔐', title: '权限回收' },
    { key: 'export', label: '📦', title: '数据导出' },
    { key: 'survey', label: '📝', title: '离职调查' },
    { key: 'experience', label: '💡', title: '经验带走' },
  ]

  const priorityLabels: Record<number, { label: string; color: string }> = {
    1: { label: '紧急', color: 'bg-red-100 text-red-700' },
    2: { label: '重要', color: 'bg-yellow-100 text-yellow-700' },
    3: { label: '普通', color: 'bg-gray-100 text-gray-700' },
  }

  const statusLabels: Record<string, { label: string; color: string }> = {
    pending: { label: '待完成', color: 'bg-gray-100 text-gray-600' },
    in_progress: { label: '进行中', color: 'bg-blue-100 text-blue-600' },
    completed: { label: '已完成', color: 'bg-green-100 text-green-600' },
    verified: { label: '已确认', color: 'bg-green-200 text-green-700' },
  }

  const itemTypeIcons: Record<string, string> = {
    task: '✅',
    document: '📄',
    file: '📎',
    system: '🔧',
    person: '👤',
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
      </div>
    )
  }

  // 还没有发起离职流程
  if (!checklist) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">👋</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">准备离职？</h2>
          <p className="text-gray-500">
            我们将帮助您完成离职交接、权限回收、数据导出等流程，确保您的经验和数据得到妥善处理。
          </p>
        </div>

        <div className="space-y-4 mb-8">
          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
            <span className="text-2xl">📋</span>
            <div>
              <h3 className="font-medium">智能交接清单</h3>
              <p className="text-sm text-gray-500">系统自动生成交接任务，确保工作顺利交接</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
            <span className="text-2xl">🔐</span>
            <div>
              <h3 className="font-medium">一键权限回收</h3>
              <p className="text-sm text-gray-500">批量回收所有系统权限，保护公司数据安全</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
            <span className="text-2xl">📦</span>
            <div>
              <h3 className="font-medium">数据导出</h3>
              <p className="text-sm text-gray-500">导出您的工作文档、聊天记录等个人数据</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
            <span className="text-2xl">💡</span>
            <div>
              <h3 className="font-medium">经验带走</h3>
              <p className="text-sm text-gray-500">将项目经验同步到个人记忆，下次工作直接用</p>
            </div>
          </div>
        </div>

        <button
          onClick={handleInitiate}
          disabled={initiating || !enterpriseId}
          className="w-full py-3 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {initiating ? '正在发起...' : '发起离职流程'}
        </button>
        {!enterpriseId && (
          <p className="text-sm text-gray-400 text-center mt-2">请先选择一个企业</p>
        )}
      </div>
    )
  }

  // 渲染交接清单
  const renderChecklist = () => (
    <div className="space-y-4">
      {/* 进度条 */}
      <div className="bg-white border rounded-lg p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="font-medium">{checklist.title}</span>
          <span className="text-sm text-gray-500">{checklist.completed_items}/{checklist.total_items} 项</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-sm text-gray-500 mt-2 text-right">{progress}% 完成</p>
      </div>

      {/* 交接项列表 */}
      <div className="space-y-2">
        {checklist.items.map((item) => (
          <div key={item.id} className="bg-white border rounded-lg p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1">
                <span className="text-xl">{itemTypeIcons[item.item_type] || '📋'}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-medium">{item.title}</h4>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${priorityLabels[item.priority]?.color}`}>
                      {priorityLabels[item.priority]?.label}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${statusLabels[item.status]?.color}`}>
                      {statusLabels[item.status]?.label}
                    </span>
                  </div>
                  {item.description && (
                    <p className="text-sm text-gray-500 mt-1">{item.description}</p>
                  )}
                  {item.assignee_name && (
                    <p className="text-sm text-gray-400 mt-1">
                      👤 {item.assignee_name}
                    </p>
                  )}
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-1">
                {item.status === 'pending' && (
                  <button
                    onClick={() => handleUpdateItemStatus(item.id, 'in_progress')}
                    className="px-3 py-1 text-sm bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                  >
                    开始
                  </button>
                )}
                {item.status === 'in_progress' && (
                  <button
                    onClick={() => handleUpdateItemStatus(item.id, 'completed')}
                    className="px-3 py-1 text-sm bg-green-50 text-green-600 rounded hover:bg-green-100"
                  >
                    完成
                  </button>
                )}
                {item.status === 'completed' && (
                  <button
                    onClick={() => handleUpdateItemStatus(item.id, 'verified')}
                    className="px-3 py-1 text-sm bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                  >
                    确认
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 完成离职 */}
      {progress === 100 && (
        <CompleteOffboarding checklistId={checklist.id} onComplete={loadChecklist} />
      )}
    </div>
  )

  // 渲染权限回收
  const renderPermissions = () => (
    <PermissionRevocationPanel checklistId={checklist.id} />
  )

  // 渲染数据导出
  const renderExport = () => (
    <DataExportPanel checklistId={checklist.id} />
  )

  // 渲染离职调查
  const renderSurvey = () => (
    <ExitSurveyPanel />
  )

  // 渲染经验带走
  const renderExperience = () => (
    <ExperienceTransferPanel checklistId={checklist.id} />
  )

  return (
    <div className="h-full flex flex-col">
      {/* 标签栏 */}
      <div className="bg-white border-b px-4">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center gap-1 px-4 py-3 text-sm border-b-2 transition-colors
                ${activeTab === tab.key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              <span>{tab.label}</span>
              <span>{tab.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'checklist' && renderChecklist()}
        {activeTab === 'permissions' && renderPermissions()}
        {activeTab === 'export' && renderExport()}
        {activeTab === 'survey' && renderSurvey()}
        {activeTab === 'experience' && renderExperience()}
      </div>
    </div>
  )
}

// ================================================
// 权限回收面板
// ================================================
function PermissionRevocationPanel({ checklistId }: { checklistId: string }) {
  const [permissions, setPermissions] = useState<any[]>([])
  const [revoking, setRevoking] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPermissions()
  }, [checklistId])

  const loadPermissions = async () => {
    try {
      const res = await fetch(`/api/offboarding/${checklistId}/permissions`)
      const data = await res.json()
      if (data.success) {
        setPermissions(data.data?.permissions || [])
      }
    } catch (e) {
      console.error('加载权限列表失败', e)
    } finally {
      setLoading(false)
    }
  }

  const handleRevokeAll = async () => {
    if (!confirm('确定要回收所有权限吗？此操作不可撤销。')) return

    setRevoking(true)
    try {
      const res = await fetch(`/api/offboarding/${checklistId}/revoke-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const data = await res.json()
      if (data.success) {
        alert(`权限回收完成：成功 ${data.data.successCount} 项，失败 ${data.data.failCount} 项`)
        loadPermissions()
      }
    } catch (e) {
      console.error('权限回收失败', e)
    } finally {
      setRevoking(false)
    }
  }

  if (loading) {
    return <div className="animate-pulse h-32 bg-gray-100 rounded" />
  }

  const completedCount = permissions.filter(p => p.status === 'completed').length

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-blue-900">🔐 权限回收</h3>
            <p className="text-sm text-blue-700 mt-1">
              离职后将自动回收您在公司各系统中的访问权限
            </p>
          </div>
          <button
            onClick={handleRevokeAll}
            disabled={revoking || completedCount === permissions.length}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {revoking ? '回收中...' : '一键回收'}
          </button>
        </div>
      </div>

      <div className="grid gap-2">
        {permissions.map((perm) => (
          <div key={perm.permission_type} className="bg-white border rounded-lg p-3 flex items-center justify-between">
            <div>
              <span className="font-medium">{perm.resource_name}</span>
              <span className="text-sm text-gray-400 ml-2">{perm.permission_type}</span>
            </div>
            <span className={`text-sm px-2 py-1 rounded ${
              perm.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {perm.status === 'completed' ? '✅ 已回收' : '⏳ 待回收'}
            </span>
          </div>
        ))}
      </div>

      <p className="text-sm text-gray-500 text-center">
        已回收 {completedCount}/{permissions.length} 项权限
      </p>
    </div>
  )
}

// ================================================
// 数据导出面板
// ================================================
function DataExportPanel({ checklistId }: { checklistId: string }) {
  const [exports, setExports] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['all'])
  const [fileFormat, setFileFormat] = useState('zip')

  const exportTypes = [
    { value: 'documents', label: '📄 文档', desc: '云文档、协作文档' },
    { value: 'files', label: '📎 文件', desc: '上传的文件' },
    { value: 'calendar', label: '📅 日历', desc: '日程安排' },
    { value: 'tasks', label: '✅ 任务', desc: '任务列表' },
    { value: 'all', label: '📦 全部', desc: '导出所有数据' },
  ]

  useEffect(() => {
    loadExports()
  }, [])

  const loadExports = async () => {
    try {
      const res = await fetch('/api/offboarding/exports')
      const data = await res.json()
      if (data.success) {
        setExports(data.data)
      }
    } catch (e) {
      console.error('加载导出记录失败', e)
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await fetch(`/api/offboarding/${checklistId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exportTypes: selectedTypes,
          fileFormat
        })
      })
      const data = await res.json()
      if (data.success) {
        alert('导出任务已创建，请在稍后下载')
        loadExports()
      }
    } catch (e) {
      console.error('导出失败', e)
    } finally {
      setExporting(false)
    }
  }

  const handleDownload = async (exportId: string) => {
    try {
      const res = await fetch(`/api/offboarding/exports/${exportId}/download`)
      const data = await res.json()
      if (data.success && data.data.downloadUrl) {
        window.open(data.data.downloadUrl, '_blank')
      } else {
        alert(data.error || '下载链接不可用')
      }
    } catch (e) {
      console.error('下载失败', e)
    }
  }

  if (loading) {
    return <div className="animate-pulse h-32 bg-gray-100 rounded" />
  }

  return (
    <div className="space-y-6">
      {/* 导出选项 */}
      <div className="bg-white border rounded-lg p-4">
        <h3 className="font-medium mb-4">📦 选择要导出的数据</h3>
        <div className="grid gap-2">
          {exportTypes.map((type) => (
            <label
              key={type.value}
              className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors
                ${selectedTypes.includes(type.value) ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'}`}
            >
              <input
                type="checkbox"
                checked={selectedTypes.includes(type.value)}
                onChange={(e) => {
                  if (type.value === 'all') {
                    setSelectedTypes(e.target.checked ? ['all'] : [])
                  } else {
                    setSelectedTypes(prev =>
                      e.target.checked
                        ? [...prev.filter(t => t !== 'all'), type.value]
                        : prev.filter(t => t !== type.value)
                    )
                  }
                }}
                className="w-4 h-4"
              />
              <div>
                <span className="font-medium">{type.label}</span>
                <span className="text-sm text-gray-500 ml-2">{type.desc}</span>
              </div>
            </label>
          ))}
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium mb-2">文件格式</label>
          <select
            value={fileFormat}
            onChange={(e) => setFileFormat(e.target.value)}
            className="w-full p-2 border rounded"
          >
            <option value="zip">ZIP 压缩包</option>
            <option value="pdf">PDF 文档</option>
            <option value="json">JSON 数据</option>
          </select>
        </div>

        <button
          onClick={handleExport}
          disabled={exporting || selectedTypes.length === 0}
          className="w-full mt-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
        >
          {exporting ? '导出中...' : '创建导出任务'}
        </button>
      </div>

      {/* 导出历史 */}
      <div>
        <h3 className="font-medium mb-3">📜 导出历史</h3>
        {exports.length === 0 ? (
          <p className="text-gray-400 text-center py-4">暂无导出记录</p>
        ) : (
          <div className="space-y-2">
            {exports.map((exp) => (
              <div key={exp.id} className="bg-white border rounded-lg p-3 flex items-center justify-between">
                <div>
                  <span className="font-medium">{exp.export_type}</span>
                  <span className="text-sm text-gray-400 ml-2">
                    {new Date(exp.created_at).toLocaleDateString()}
                  </span>
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                    exp.status === 'completed' ? 'bg-green-100 text-green-700' :
                    exp.status === 'processing' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {exp.status === 'completed' ? '已完成' : exp.status === 'processing' ? '处理中' : '待处理'}
                  </span>
                </div>
                {exp.status === 'completed' && (
                  <button
                    onClick={() => handleDownload(exp.id)}
                    className="px-3 py-1 text-sm bg-green-50 text-green-600 rounded hover:bg-green-100"
                  >
                    下载
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ================================================
// 离职调查面板
// ================================================
function ExitSurveyPanel() {
  const [survey, setSurvey] = useState<any>(null)
  const [questions, setQuestions] = useState<any[]>([])
  const [responses, setResponses] = useState<Record<string, any>>({})
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    loadSurvey()
  }, [])

  const loadSurvey = async () => {
    try {
      const res = await fetch('/api/offboarding/survey')
      const data = await res.json()
      if (data.success && data.data) {
        setSurvey(data.data)
        setQuestions(data.data.questions || [])
        if (data.data.status === 'submitted') {
          setSubmitted(true)
        }
      }
    } catch (e) {
      console.error('加载调查失败', e)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!survey) return

    setSubmitting(true)
    try {
      const formattedResponses = Object.entries(responses).map(([questionId, value]) => ({
        questionId,
        answerType: questions.find(q => q.id === questionId)?.type || 'text',
        ...(questions.find(q => q.id === questionId)?.type === 'rating' ? { ratingValue: value } : {}),
        ...(questions.find(q => q.id === questionId)?.type === 'text' ? { textValue: value } : {}),
        ...(questions.find(q => q.id === questionId)?.type === 'multiple_choice' ? { multipleChoiceValues: Array.isArray(value) ? value : [value] } : {}),
      }))

      const res = await fetch(`/api/offboarding/survey/${survey.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responses: formattedResponses })
      })
      const data = await res.json()
      if (data.success) {
        setSubmitted(true)
        alert('调查已提交，感谢您的反馈！')
      }
    } catch (e) {
      console.error('提交失败', e)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="animate-pulse h-32 bg-gray-100 rounded" />
  }

  if (!survey) {
    return (
      <div className="text-center py-8">
        <div className="text-5xl mb-4">📝</div>
        <p className="text-gray-500">暂无离职调查问卷</p>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="text-center py-8">
        <div className="text-6xl mb-4">✅</div>
        <h3 className="text-xl font-medium mb-2">感谢您的反馈</h3>
        <p className="text-gray-500">您的意见将帮助我们改进工作环境</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-medium text-blue-900">📝 离职调查</h3>
        <p className="text-sm text-blue-700 mt-1">
          您的反馈将匿名处理，仅用于改善公司环境
        </p>
      </div>

      <div className="space-y-6">
        {questions.map((q, idx) => (
          <div key={q.id} className="bg-white border rounded-lg p-4">
            <div className="flex gap-1 mb-3">
              <span className="text-gray-400">{idx + 1}.</span>
              <span className="font-medium">{q.question}</span>
              {q.required && <span className="text-red-500">*</span>}
            </div>

            {q.type === 'rating' && (
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((val) => (
                  <button
                    key={val}
                    onClick={() => setResponses({ ...responses, [q.id]: val })}
                    className={`w-10 h-10 rounded-full border transition-colors
                      ${responses[q.id] === val
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'hover:bg-gray-50'}`}
                  >
                    {val}
                  </button>
                ))}
                <span className="ml-2 text-sm text-gray-400 self-center">
                  {responses[q.id] ? ['非常不满意', '不满意', '一般', '满意', '非常满意'][responses[q.id] - 1] : ''}
                </span>
              </div>
            )}

            {q.type === 'text' && (
              <textarea
                value={responses[q.id] || ''}
                onChange={(e) => setResponses({ ...responses, [q.id]: e.target.value })}
                className="w-full p-3 border rounded-lg resize-none"
                rows={3}
                placeholder="请输入您的想法..."
              />
            )}

            {q.type === 'multiple_choice' && (
              <div className="flex flex-wrap gap-2">
                {q.options?.map((opt: string) => (
                  <label
                    key={opt}
                    className={`px-3 py-2 border rounded-lg cursor-pointer transition-colors
                      ${responses[q.id] === opt ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'}`}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      value={opt}
                      checked={responses[q.id] === opt}
                      onChange={() => setResponses({ ...responses, [q.id]: opt })}
                      className="hidden"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50"
      >
        {submitting ? '提交中...' : '提交调查'}
      </button>
    </div>
  )
}

// ================================================
// 经验带走面板
// ================================================
function ExperienceTransferPanel({ checklistId }: { checklistId: string }) {
  const [experience, setExperience] = useState<any>(null)
  const [form, setForm] = useState({
    projectName: '',
    role: '',
    keyAchievements: '',
    skillsUsed: '',
    lessonsLearned: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    loadExperience()
  }, [checklistId])

  const loadExperience = async () => {
    try {
      const res = await fetch('/api/offboarding/experience')
      const data = await res.json()
      if (data.success && data.data.length > 0) {
        setExperience(data.data[0])
        setForm({
          projectName: data.data[0].project_name || '',
          role: data.data[0].role || '',
          keyAchievements: data.data[0].key_achievements || '',
          skillsUsed: (data.data[0].skills_used || []).join(', '),
          lessonsLearned: data.data[0].lessons_learned || '',
        })
      }
    } catch (e) {
      console.error('加载经验失败', e)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const skills = form.skillsUsed.split(',').map(s => s.trim()).filter(Boolean)
      const res = await fetch(`/api/offboarding/${checklistId}/experience`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: form.projectName,
          role: form.role,
          keyAchievements: form.keyAchievements,
          skillsUsed: skills,
          lessonsLearned: form.lessonsLearned,
          knowledgeDocs: [],
          contacts: [],
          processDocs: [],
        })
      })
      const data = await res.json()
      if (data.success) {
        alert('经验已保存')
        loadExperience()
      }
    } catch (e) {
      console.error('保存失败', e)
    } finally {
      setSaving(false)
    }
  }

  const handleSyncToMemory = async () => {
    if (!experience) return

    setSyncing(true)
    try {
      const res = await fetch(`/api/offboarding/experience/${experience.id}/sync-to-memory`, {
        method: 'POST'
      })
      const data = await res.json()
      if (data.success) {
        alert('经验已同步到个人记忆！下次入职新公司时，这些经验将帮助您快速上手。')
        loadExperience()
      }
    } catch (e) {
      console.error('同步失败', e)
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return <div className="animate-pulse h-32 bg-gray-100 rounded" />
  }

  return (
    <div className="space-y-6">
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <h3 className="font-medium text-purple-900">💡 经验带走</h3>
        <p className="text-sm text-purple-700 mt-1">
          记录您在这家公司的工作经验，项目结束后可以同步到个人记忆，下次找工作直接用
        </p>
      </div>

      {/* 经验表单 */}
      <div className="bg-white border rounded-lg p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">项目/工作名称</label>
          <input
            type="text"
            value={form.projectName}
            onChange={(e) => setForm({ ...form, projectName: e.target.value })}
            className="w-full p-2 border rounded"
            placeholder="例如：电商平台重构"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">担任角色</label>
          <input
            type="text"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="w-full p-2 border rounded"
            placeholder="例如：后端开发工程师"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">关键成就</label>
          <textarea
            value={form.keyAchievements}
            onChange={(e) => setForm({ ...form, keyAchievements: e.target.value })}
            className="w-full p-2 border rounded resize-none"
            rows={3}
            placeholder="例如：1. 优化接口响应时间从500ms降到50ms..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">用到的技能（逗号分隔）</label>
          <input
            type="text"
            value={form.skillsUsed}
            onChange={(e) => setForm({ ...form, skillsUsed: e.target.value })}
            className="w-full p-2 border rounded"
            placeholder="例如：React, Node.js, PostgreSQL"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">经验教训</label>
          <textarea
            value={form.lessonsLearned}
            onChange={(e) => setForm({ ...form, lessonsLearned: e.target.value })}
            className="w-full p-2 border rounded resize-none"
            rows={3}
            placeholder="您从这个项目中学到了什么？"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50"
        >
          {saving ? '保存中...' : '保存经验'}
        </button>
      </div>

      {/* 同步到记忆 */}
      {experience && experience.status !== 'synced' && (
        <div className="bg-white border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">🧠 同步到个人记忆</h4>
              <p className="text-sm text-gray-500 mt-1">
                将这些经验同步到您的触手个人记忆，下次入职新公司时可以直接使用
              </p>
            </div>
            <button
              onClick={handleSyncToMemory}
              disabled={syncing || !form.projectName}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
            >
              {syncing ? '同步中...' : '同步'}
            </button>
          </div>
        </div>
      )}

      {experience?.status === 'synced' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
          <span className="text-3xl">✅</span>
          <p className="text-green-700 font-medium mt-2">经验已同步到个人记忆</p>
        </div>
      )}
    </div>
  )
}

// ================================================
// 完成离职按钮
// ================================================
function CompleteOffboarding({
  checklistId,
  onComplete
}: {
  checklistId: string
  onComplete: () => void
}) {
  const [completing, setCompleting] = useState(false)

  const handleComplete = async () => {
    if (!confirm('确定要完成离职流程吗？完成后将断开与企业的所有连接。')) return

    setCompleting(true)
    try {
      const res = await fetch(`/api/offboarding/${checklistId}/complete`, {
        method: 'POST'
      })
      const data = await res.json()
      if (data.success) {
        alert(data.message)
        onComplete()
      } else {
        alert(data.error || '完成失败')
      }
    } catch (e) {
      console.error('完成离职失败', e)
    } finally {
      setCompleting(false)
    }
  }

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium text-green-900">🎉 所有交接项已完成</h4>
          <p className="text-sm text-green-700 mt-1">
            您的个人数据和经验已保留，点击完成离职流程
          </p>
        </div>
        <button
          onClick={handleComplete}
          disabled={completing}
          className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
        >
          {completing ? '处理中...' : '完成离职'}
        </button>
      </div>
    </div>
  )
}

export default OffboardingPanel
