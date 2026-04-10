'use client'

import { useState } from 'react'

interface AIModelFormData {
  provider: string
  modelId: string
  modelName: string
  apiEndpoint: string
  apiKey: string
  maxTokens: number
  temperature: number
  systemPrompt: string
  isDefault: boolean
}

interface WorkflowFormData {
  name: string
  description: string
  category: string
  workflowDef: string
}

interface ShortcutFormData {
  name: string
  shortcutKey: string
  actionType: string
  actionConfig: string
  icon: string
  color: string
}

interface EnterpriseCapabilityAdminProps {
  enterpriseId: string
  enterpriseName: string
}

// 企业管理员配置企业能力
export default function EnterpriseCapabilityAdmin({ enterpriseId, enterpriseName }: EnterpriseCapabilityAdminProps) {
  const [activeTab, setActiveTab] = useState<'aimodels' | 'workflows' | 'shortcuts' | 'overview'>('overview')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // AI模型表单
  const [aiModelForm, setAiModelForm] = useState<AIModelFormData>({
    provider: 'openai',
    modelId: '',
    modelName: '',
    apiEndpoint: '',
    apiKey: '',
    maxTokens: 4096,
    temperature: 0.7,
    systemPrompt: '',
    isDefault: false
  })

  // 工作流表单
  const [workflowForm, setWorkflowForm] = useState<WorkflowFormData>({
    name: '',
    description: '',
    category: 'general',
    workflowDef: ''
  })

  // 快捷命令表单
  const [shortcutForm, setShortcutForm] = useState<ShortcutFormData>({
    name: '',
    shortcutKey: '',
    actionType: 'workflow',
    actionConfig: '{}',
    icon: '⚡',
    color: '#6366f1'
  })

  const saveAIModel = async () => {
    if (!aiModelForm.modelId || !aiModelForm.modelName) {
      setMessage({ type: 'error', text: '请填写模型ID和名称' })
      return
    }
    
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/enterprises/${enterpriseId}/ai-models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aiModelForm)
      })
      const data = await res.json()
      if (data.success) {
        setMessage({ type: 'success', text: 'AI模型添加成功' })
        setAiModelForm({
          provider: 'openai',
          modelId: '',
          modelName: '',
          apiEndpoint: '',
          apiKey: '',
          maxTokens: 4096,
          temperature: 0.7,
          systemPrompt: '',
          isDefault: false
        })
      } else {
        setMessage({ type: 'error', text: data.error })
      }
    } catch {
      setMessage({ type: 'error', text: '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  const saveWorkflow = async () => {
    if (!workflowForm.name) {
      setMessage({ type: 'error', text: '请填写工作流名称' })
      return
    }
    
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/enterprises/${enterpriseId}/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...workflowForm,
          workflowDef: JSON.parse(workflowForm.workflowDef || '{}')
        })
      })
      const data = await res.json()
      if (data.success) {
        setMessage({ type: 'success', text: '工作流添加成功' })
        setWorkflowForm({ name: '', description: '', category: 'general', workflowDef: '' })
      } else {
        setMessage({ type: 'error', text: data.error })
      }
    } catch {
      setMessage({ type: 'error', text: '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  const saveShortcut = async () => {
    if (!shortcutForm.name || !shortcutForm.shortcutKey) {
      setMessage({ type: 'error', text: '请填写名称和命令' })
      return
    }
    
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/enterprises/${enterpriseId}/shortcuts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...shortcutForm,
          actionConfig: JSON.parse(shortcutForm.actionConfig || '{}')
        })
      })
      const data = await res.json()
      if (data.success) {
        setMessage({ type: 'success', text: '快捷命令添加成功' })
        setShortcutForm({
          name: '',
          shortcutKey: '',
          actionType: 'workflow',
          actionConfig: '{}',
          icon: '⚡',
          color: '#6366f1'
        })
      } else {
        setMessage({ type: 'error', text: data.error })
      }
    } catch {
      setMessage({ type: 'error', text: '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
            <span className="text-2xl">🐙</span>
          </div>
          <div>
            <h2 className="text-xl font-bold">{enterpriseName} - 能力配置</h2>
            <p className="text-indigo-100 text-sm">配置触手连接后可获得的企业能力</p>
          </div>
        </div>
      </div>

      {/* 消息提示 */}
      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      {/* 标签页 */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {([
            { key: 'overview', label: '能力总览' },
            { key: 'aimodels', label: 'AI模型' },
            { key: 'workflows', label: '工作流' },
            { key: 'shortcuts', label: '快捷命令' }
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.key
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 总览 */}
      {activeTab === 'overview' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4">能力配置说明</h3>
          <div className="space-y-6">
            <div className="p-4 bg-blue-50 rounded-lg">
              <h4 className="font-medium text-blue-900 flex items-center space-x-2">
                <span className="text-xl">🤖</span>
                <span>AI模型</span>
              </h4>
              <p className="text-sm text-blue-700 mt-2">
                配置企业购买的AI模型（如GPT-4、Claude）。触手连接后可以使用这些模型，无需员工自己付费。
              </p>
              <div className="mt-3 text-sm text-blue-600">
                <strong>示例用途：</strong>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>触手回答员工关于公司政策的问题</li>
                  <li>帮助员工写邮件、文档、报告</li>
                  <li>分析数据、生成图表</li>
                </ul>
              </div>
            </div>

            <div className="p-4 bg-green-50 rounded-lg">
              <h4 className="font-medium text-green-900 flex items-center space-x-2">
                <span className="text-xl">⚡</span>
                <span>工作流</span>
              </h4>
              <p className="text-sm text-green-700 mt-2">
                配置企业常用流程（如请假、报销、采购）。触手连接后可以一键执行这些流程。
              </p>
              <div className="mt-3 text-sm text-green-600">
                <strong>示例用途：</strong>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>一键提交请假申请</li>
                  <li>快速发起报销流程</li>
                  <li>自动创建项目任务</li>
                </ul>
              </div>
            </div>

            <div className="p-4 bg-purple-50 rounded-lg">
              <h4 className="font-medium text-purple-900 flex items-center space-x-2">
                <span className="text-xl">⌨️</span>
                <span>快捷命令</span>
              </h4>
              <p className="text-sm text-purple-700 mt-2">
                配置触手可识别的快捷命令（如/help、/请假、/报销）。员工输入命令即可快速执行操作。
              </p>
              <div className="mt-3 text-sm text-purple-600">
                <strong>示例：</strong>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>/help - 查看所有可用命令</li>
                  <li>/请假 - 快速提交请假申请</li>
                  <li>/报销 [金额] [事由] - 快速报销</li>
                </ul>
              </div>
            </div>

            <div className="p-4 bg-orange-50 rounded-lg">
              <h4 className="font-medium text-orange-900 flex items-center space-x-2">
                <span className="text-xl">📚</span>
                <span>知识库</span>
              </h4>
              <p className="text-sm text-orange-700 mt-2">
                连接企业文档系统。触手连接后可以搜索企业知识库，帮助员工快速找到答案。
              </p>
              <div className="mt-3 text-sm text-orange-600">
                <strong>支持的来源：</strong>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Notion / Confluence</li>
                  <li>GitHub Wiki</li>
                  <li>内部文档系统</li>
                  <li>手动上传文档</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI模型配置 */}
      {activeTab === 'aimodels' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4">添加AI模型</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                提供商 <span className="text-red-500">*</span>
              </label>
              <select
                value={aiModelForm.provider}
                onChange={(e) => setAiModelForm({ ...aiModelForm, provider: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="openai">OpenAI (GPT系列)</option>
                <option value="anthropic">Anthropic (Claude系列)</option>
                <option value="google">Google (Gemini)</option>
                <option value="azure">Azure OpenAI</option>
                <option value="custom">自定义</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                模型ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={aiModelForm.modelId}
                onChange={(e) => setAiModelForm({ ...aiModelForm, modelId: e.target.value })}
                placeholder="如: gpt-4, claude-3-opus"
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                显示名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={aiModelForm.modelName}
                onChange={(e) => setAiModelForm({ ...aiModelForm, modelName: e.target.value })}
                placeholder="如: GPT-4 企业版"
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                API地址
              </label>
              <input
                type="text"
                value={aiModelForm.apiEndpoint}
                onChange={(e) => setAiModelForm({ ...aiModelForm, apiEndpoint: e.target.value })}
                placeholder="留空使用默认地址"
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                API密钥
              </label>
              <input
                type="password"
                value={aiModelForm.apiKey}
                onChange={(e) => setAiModelForm({ ...aiModelForm, apiKey: e.target.value })}
                placeholder="API密钥将加密存储"
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                最大Token数
              </label>
              <input
                type="number"
                value={aiModelForm.maxTokens}
                onChange={(e) => setAiModelForm({ ...aiModelForm, maxTokens: parseInt(e.target.value) })}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Temperature
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={aiModelForm.temperature}
                onChange={(e) => setAiModelForm({ ...aiModelForm, temperature: parseFloat(e.target.value) })}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                默认系统提示词
              </label>
              <textarea
                value={aiModelForm.systemPrompt}
                onChange={(e) => setAiModelForm({ ...aiModelForm, systemPrompt: e.target.value })}
                placeholder="设置AI助手的默认角色和规则..."
                rows={3}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="md:col-span-2 flex items-center space-x-2">
              <input
                type="checkbox"
                id="isDefault"
                checked={aiModelForm.isDefault}
                onChange={(e) => setAiModelForm({ ...aiModelForm, isDefault: e.target.checked })}
                className="w-4 h-4 text-indigo-600 rounded"
              />
              <label htmlFor="isDefault" className="text-sm text-gray-700">
                设为默认模型（触手未指定时使用此模型）
              </label>
            </div>
          </div>
          <button
            onClick={saveAIModel}
            disabled={saving}
            className="mt-6 bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存模型'}
          </button>
        </div>
      )}

      {/* 工作流配置 */}
      {activeTab === 'workflows' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4">添加工作流</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                工作流名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={workflowForm.name}
                onChange={(e) => setWorkflowForm({ ...workflowForm, name: e.target.value })}
                placeholder="如: 请假申请"
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                描述
              </label>
              <input
                type="text"
                value={workflowForm.description}
                onChange={(e) => setWorkflowForm({ ...workflowForm, description: e.target.value })}
                placeholder="描述工作流的用途..."
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                分类
              </label>
              <select
                value={workflowForm.category}
                onChange={(e) => setWorkflowForm({ ...workflowForm, category: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="general">通用</option>
                <option value="hr">人力资源</option>
                <option value="finance">财务</option>
                <option value="it">IT支持</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                工作流定义（JSON）
              </label>
              <textarea
                value={workflowForm.workflowDef}
                onChange={(e) => setWorkflowForm({ ...workflowForm, workflowDef: e.target.value })}
                placeholder='{"trigger": "...", "steps": [...]}'
                rows={5}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
              />
            </div>
          </div>
          <button
            onClick={saveWorkflow}
            disabled={saving}
            className="mt-6 bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存工作流'}
          </button>
        </div>
      )}

      {/* 快捷命令配置 */}
      {activeTab === 'shortcuts' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4">添加快捷命令</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                命令名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={shortcutForm.name}
                onChange={(e) => setShortcutForm({ ...shortcutForm, name: e.target.value })}
                placeholder="如: 请假"
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                命令格式 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={shortcutForm.shortcutKey}
                onChange={(e) => setShortcutForm({ ...shortcutForm, shortcutKey: e.target.value })}
                placeholder="如: /请假"
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                动作类型
              </label>
              <select
                value={shortcutForm.actionType}
                onChange={(e) => setShortcutForm({ ...shortcutForm, actionType: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="workflow">执行工作流</option>
                <option value="link">打开链接</option>
                <option value="ai_command">AI命令</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                图标
              </label>
              <input
                type="text"
                value={shortcutForm.icon}
                onChange={(e) => setShortcutForm({ ...shortcutForm, icon: e.target.value })}
                placeholder="emoji"
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                颜色
              </label>
              <input
                type="color"
                value={shortcutForm.color}
                onChange={(e) => setShortcutForm({ ...shortcutForm, color: e.target.value })}
                className="w-full h-10 border border-gray-300 rounded-lg"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                动作配置（JSON）
              </label>
              <textarea
                value={shortcutForm.actionConfig}
                onChange={(e) => setShortcutForm({ ...shortcutForm, actionConfig: e.target.value })}
                placeholder='{"workflowId": "xxx"} 或 {"url": "xxx"}'
                rows={3}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
              />
            </div>
          </div>
          <button
            onClick={saveShortcut}
            disabled={saving}
            className="mt-6 bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存命令'}
          </button>
        </div>
      )}

      {/* 底部提示 */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <span className="text-2xl">💡</span>
          <div>
            <h4 className="font-medium text-indigo-900">提示</h4>
            <p className="text-sm text-indigo-700 mt-1">
              配置完成后，新连接的触手将自动获得这些能力。现有连接需要点击"重新获取能力"来同步新配置。
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
