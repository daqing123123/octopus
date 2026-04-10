'use client'

import { useState, useEffect } from 'react'

interface ConnectionCapability {
  id: string
  capabilityType: string
  capabilityName: string
  capabilityKey: string
  grantedAt: string
  useCount: number
}

interface AIModel {
  id: string
  provider: string
  modelId: string
  modelName: string
  isDefault: boolean
  features: {
    maxTokens: number
    temperature: number
    hasSystemPrompt: boolean
  }
}

interface KnowledgeSource {
  id: string
  sourceType: string
  sourceName: string
  lastSynced: string
  status: string
}

interface Workflow {
  id: string
  name: string
  description: string
  category: string
  usageCount: number
}

interface Shortcut {
  id: string
  name: string
  command: string
  description: string
  icon: string
  color: string
}

interface ConnectionInfo {
  id: string
  enterpriseName: string
  enterpriseLogo: string
  personalClawName: string
  enterpriseClawName: string
  connectedAt: string
}

interface CapabilityPanelProps {
  connectionId: string
  enterpriseName: string
}

// 触手连上大脑 = 立即获得企业能力
export default function ConnectionCapabilitiesPanel({ connectionId, enterpriseName }: CapabilityPanelProps) {
  const [loading, setLoading] = useState(true)
  const [capabilities, setCapabilities] = useState<{
    connection: ConnectionInfo
    aiModels: { title: string; description: string; items: AIModel[]; count: number }
    knowledgeBases: { title: string; description: string; items: KnowledgeSource[]; count: number }
    workflows: { title: string; description: string; items: Workflow[]; count: number }
    shortcuts: { title: string; description: string; items: Shortcut[]; count: number }
    summary: { totalCapabilities: number; aiModelsCount: number; knowledgeSourcesCount: number; workflowsCount: number; shortcutsCount: number }
  } | null>(null)
  const [granting, setGranting] = useState(false)
  const [aiQuery, setAiQuery] = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'ai' | 'knowledge' | 'workflows'>('overview')

  useEffect(() => {
    fetchCapabilities()
  }, [connectionId])

  const fetchCapabilities = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/connections/${connectionId}/capabilities`)
      const data = await res.json()
      if (data.success) {
        setCapabilities(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch capabilities:', error)
    } finally {
      setLoading(false)
    }
  }

  const grantAllCapabilities = async () => {
    setGranting(true)
    try {
      const res = await fetch(`/api/connections/${connectionId}/capabilities/grant-all`, {
        method: 'POST'
      })
      const data = await res.json()
      if (data.success) {
        alert(data.message)
        fetchCapabilities()
      }
    } catch (error) {
      console.error('Failed to grant capabilities:', error)
    } finally {
      setGranting(false)
    }
  }

  const askAI = async () => {
    if (!aiQuery.trim()) return
    setAiLoading(true)
    setAiResponse('')
    try {
      const res = await fetch(`/api/connections/${connectionId}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: aiQuery })
      })
      const data = await res.json()
      if (data.success) {
        setAiResponse(data.data.response)
      } else {
        setAiResponse(`错误: ${data.error}`)
      }
    } catch (error) {
      setAiResponse('请求失败，请稍后重试')
    } finally {
      setAiLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    )
  }

  if (!capabilities) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>无法加载企业能力</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 连接信息头部 */}
      <div className="bg-gradient-to-r from-purple-500 to-blue-600 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <span className="text-2xl">🐙</span>
            </div>
            <div>
              <h2 className="text-xl font-bold">{enterpriseName}</h2>
              <p className="text-purple-100 text-sm">
                触手 {capabilities.connection.personalClawName} 已连接
              </p>
            </div>
          </div>
          <button
            onClick={grantAllCapabilities}
            disabled={granting}
            className="bg-white text-purple-600 px-4 py-2 rounded-lg font-medium hover:bg-purple-50 transition-colors disabled:opacity-50"
          >
            {granting ? '获取中...' : '获取全部能力'}
          </button>
        </div>

        {/* 能力统计 */}
        <div className="grid grid-cols-4 gap-4 mt-6">
          <div className="bg-white/10 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold">{capabilities.summary.aiModelsCount}</div>
            <div className="text-sm text-purple-100">AI模型</div>
          </div>
          <div className="bg-white/10 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold">{capabilities.summary.knowledgeSourcesCount}</div>
            <div className="text-sm text-purple-100">知识库</div>
          </div>
          <div className="bg-white/10 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold">{capabilities.summary.workflowsCount}</div>
            <div className="text-sm text-purple-100">工作流</div>
          </div>
          <div className="bg-white/10 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold">{capabilities.summary.shortcutsCount}</div>
            <div className="text-sm text-purple-100">快捷命令</div>
          </div>
        </div>
      </div>

      {/* 标签页 */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {(['overview', 'ai', 'knowledge', 'workflows'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab
                  ? 'border-purple-500 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab === 'overview' && '总览'}
              {tab === 'ai' && 'AI模型'}
              {tab === 'knowledge' && '知识库'}
              {tab === 'workflows' && '工作流'}
            </button>
          ))}
        </nav>
      </div>

      {/* 内容区域 */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* AI模型卡片 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <span className="text-xl">🤖</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">AI模型</h3>
                <p className="text-sm text-gray-500">触手可使用企业购买的模型</p>
              </div>
            </div>
            <div className="space-y-3">
              {capabilities.aiModels.items.map((model) => (
                <div key={model.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <div className="font-medium text-gray-900">{model.modelName}</div>
                    <div className="text-sm text-gray-500">{model.provider}</div>
                  </div>
                  {model.isDefault && (
                    <span className="px-2 py-1 bg-purple-100 text-purple-600 text-xs rounded-full">
                      默认
                    </span>
                  )}
                </div>
              ))}
              {capabilities.aiModels.items.length === 0 && (
                <p className="text-gray-500 text-center py-4">暂无可用AI模型</p>
              )}
            </div>
          </div>

          {/* 知识库卡片 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-xl">📚</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">企业知识库</h3>
                <p className="text-sm text-gray-500">触手可搜索企业文档</p>
              </div>
            </div>
            <div className="space-y-3">
              {capabilities.knowledgeBases.items.map((source) => (
                <div key={source.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <div className="font-medium text-gray-900">{source.sourceName}</div>
                    <div className="text-sm text-gray-500">{source.sourceType}</div>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    source.status === 'synced' ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'
                  }`}>
                    {source.status === 'synced' ? '已同步' : '手动'}
                  </span>
                </div>
              ))}
              {capabilities.knowledgeBases.items.length === 0 && (
                <p className="text-gray-500 text-center py-4">暂无可用知识库</p>
              )}
            </div>
          </div>

          {/* 工作流卡片 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <span className="text-xl">⚡</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">企业工作流</h3>
                <p className="text-sm text-gray-500">触手可使用企业工作流</p>
              </div>
            </div>
            <div className="space-y-3">
              {capabilities.workflows.items.slice(0, 3).map((workflow) => (
                <div key={workflow.id} className="p-3 bg-gray-50 rounded-lg">
                  <div className="font-medium text-gray-900">{workflow.name}</div>
                  <div className="text-sm text-gray-500">{workflow.description}</div>
                </div>
              ))}
              {capabilities.workflows.items.length === 0 && (
                <p className="text-gray-500 text-center py-4">暂无可用工作流</p>
              )}
            </div>
          </div>

          {/* 快捷命令卡片 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <span className="text-xl">⌨️</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">快捷命令</h3>
                <p className="text-sm text-gray-500">触手可用的快捷命令</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {capabilities.shortcuts.items.map((shortcut) => (
                <span 
                  key={shortcut.id} 
                  className="px-3 py-1 bg-gray-100 rounded-full text-sm font-mono"
                  style={{ backgroundColor: `${shortcut.color}20`, color: shortcut.color }}
                >
                  {shortcut.command}
                </span>
              ))}
              {capabilities.shortcuts.items.length === 0 && (
                <p className="text-gray-500">暂无可用快捷命令</p>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ai' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">使用企业AI模型</h3>
          <div className="space-y-4">
            <textarea
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              placeholder="输入你的问题..."
              className="w-full p-3 border border-gray-300 rounded-lg resize-none h-32"
            />
            <button
              onClick={askAI}
              disabled={aiLoading || !aiQuery.trim()}
              className="bg-purple-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50"
            >
              {aiLoading ? '思考中...' : '发送'}
            </button>
            {aiResponse && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-500 mb-2">AI响应：</div>
                <div className="text-gray-900">{aiResponse}</div>
              </div>
            )}
          </div>
          
          {/* 可用模型列表 */}
          <div className="mt-6">
            <h4 className="font-medium text-gray-900 mb-3">可用模型</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {capabilities.aiModels.items.map((model) => (
                <div key={model.id} className="p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{model.modelName}</span>
                    {model.isDefault && (
                      <span className="px-2 py-1 bg-purple-100 text-purple-600 text-xs rounded-full">
                        默认
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">
                    <p>提供商: {model.provider}</p>
                    <p>最大Token: {model.features.maxTokens}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'knowledge' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">企业知识库</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {capabilities.knowledgeBases.items.map((source) => (
              <div key={source.id} className="p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <span className="text-xl">📄</span>
                  </div>
                  <div>
                    <div className="font-medium">{source.sourceName}</div>
                    <div className="text-sm text-gray-500">{source.sourceType}</div>
                  </div>
                </div>
                {source.lastSynced && (
                  <div className="mt-2 text-sm text-gray-400">
                    最后同步: {new Date(source.lastSynced).toLocaleDateString()}
                  </div>
                )}
              </div>
            ))}
          </div>
          {capabilities.knowledgeBases.items.length === 0 && (
            <p className="text-gray-500 text-center py-8">暂无可用知识库</p>
          )}
        </div>
      )}

      {activeTab === 'workflows' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">企业工作流</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {capabilities.workflows.items.map((workflow) => (
              <div key={workflow.id} className="p-4 border border-gray-200 rounded-lg hover:border-purple-300 cursor-pointer transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{workflow.name}</span>
                  <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                    {workflow.category}
                  </span>
                </div>
                <div className="text-sm text-gray-500">{workflow.description}</div>
                <div className="mt-2 text-sm text-gray-400">
                  已使用 {workflow.usageCount} 次
                </div>
              </div>
            ))}
          </div>
          {capabilities.workflows.items.length === 0 && (
            <p className="text-gray-500 text-center py-8">暂无可用工作流</p>
          )}
        </div>
      )}

      {/* 底部提示 */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <span className="text-2xl">💡</span>
          <div>
            <h4 className="font-medium text-purple-900">连接即获取</h4>
            <p className="text-sm text-purple-700 mt-1">
              触手连接到企业后，立即获得企业能力。离职时一键断开，所有个人数据保留在触手中。
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
