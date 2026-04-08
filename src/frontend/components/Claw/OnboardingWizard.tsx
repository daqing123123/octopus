'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  PageHeader, Card, Button, Badge, ProgressRing,
  EmptyState, Drawer, Divider, Toast, useBreakpoint, StatCard
} from '../Shared/ResponsiveComponents'

// ============================================
// 入职向导页面 - 触手视角的新员工7步引导
// PC端：全流程看板 + 步骤详情  |  手机端：向导卡片 + 底部Sheet
// ============================================

const STEP_TEMPLATES: Record<string, { icon: string; title: string; description: string; fields?: any[] }> = {
  welcome: {
    icon: '🎉', title: '欢迎加入', description: '欢迎来到团队！让我们一起开启这段旅程。',
    fields: [{ key: 'intro', label: '向大家介绍一下自己', type: 'textarea', placeholder: '我是XX，来自XX，擅长...' }]
  },
  company: {
    icon: '🏢', title: '了解公司', description: '了解公司的历史、愿景和核心价值观。',
    fields: [
      { key: 'history', label: '阅读公司介绍', type: 'checkbox' },
      { key: 'values', label: '阅读公司价值观', type: 'checkbox' },
      { key: 'mission', label: '了解公司使命', type: 'checkbox' }
    ]
  },
  team: {
    icon: '👥', title: '认识团队', description: '了解你的团队成员和直接上级。',
    fields: [
      { key: 'manager', label: '与直接上级沟通', type: 'checkbox' },
      { key: 'colleagues', label: '认识核心同事', type: 'checkbox' },
      { key: 'buddy', label: '联系你的入职导师', type: 'checkbox' }
    ]
  },
  equipment: {
    icon: '💻', title: 'IT设备领用', description: '领取你的工作设备。',
    fields: [
      { key: 'laptop', label: '领取笔记本电脑', type: 'checkbox' },
      { key: 'badge', label: '领取工牌/门禁卡', type: 'checkbox' },
      { key: 'accounts', label: '开通工作账号', type: 'checkbox' }
    ]
  },
  hr: {
    icon: '📋', title: 'HR流程', description: '完成入职的HR相关手续。',
    fields: [
      { key: 'contract', label: '签署劳动合同', type: 'checkbox' },
      { key: 'documents', label: '提交证件复印件', type: 'checkbox' },
      { key: 'bank', label: '绑定工资卡', type: 'checkbox' }
    ]
  },
  training: {
    icon: '📚', title: '培训学习', description: '完成入职培训课程。',
    fields: [
      { key: 'security', label: '完成安全培训', type: 'checkbox' },
      { key: 'culture', label: '完成企业文化培训', type: 'checkbox' },
      { key: 'tools', label: '学习工作工具使用', type: 'checkbox' }
    ]
  },
  security: {
    icon: '🔒', title: '安全合规', description: '了解安全规范和合规要求。',
    fields: [
      { key: 'securityPolicy', label: '阅读安全政策', type: 'checkbox' },
      { key: 'privacy', label: '了解数据隐私规范', type: 'checkbox' },
      { key: 'emergency', label: '了解紧急联系人', type: 'checkbox' }
    ]
  },
  complete: {
    icon: '✅', title: '完成入职', description: '恭喜你完成所有入职流程！',
    fields: []
  }
}

interface WizardData {
  wizardId: string
  name: string
  icon: string
  currentStep: number
  totalSteps: number
  completedSteps: number
  progressPercent: number
  steps: any[]
  startedAt: string
  completedAt: string | null
  satisfaction: { rating: number; comment: string } | null
}

export default function OnboardingWizardPage({ enterpriseId }: { enterpriseId?: string }) {
  const bp = useBreakpoint()
  const isMobile = bp === 'mobile'

  const [wizard, setWizard] = useState<WizardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeStep, setActiveStep] = useState<any>(null)
  const [stepData, setStepData] = useState<Record<string, any>>({})
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [feedbackDrawerOpen, setFeedbackDrawerOpen] = useState(false)
  const [rating, setRating] = useState(5)

  const fetchWizard = useCallback(async () => {
    if (!enterpriseId) return
    try {
      const res = await fetch(`/api/me/onboarding-wizard?enterpriseId=${enterpriseId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      const data = await res.json()
      if (data.success) setWizard(data.data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [enterpriseId])

  useEffect(() => { fetchWizard() }, [fetchWizard])

  const handleStepComplete = async () => {
    if (!wizard || !activeStep) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/me/onboarding-wizard/steps/${activeStep.order}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ enterpriseId, data: stepData, nextStep: activeStep.order + 1 })
      })
      const data = await res.json()
      if (data.success) {
        setToast({ message: data.message || '步骤已完成！', type: 'success' })
        setActiveStep(null)
        setStepData({})
        fetchWizard()
        if (data.data?.completed) {
          setFeedbackDrawerOpen(true)
        }
      }
    } catch (e) { console.error(e) }
    finally { setSubmitting(false) }
  }

  const handleFeedback = async () => {
    try {
      await fetch(`/api/me/onboarding-wizard/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ enterpriseId, rating })
      })
      setFeedbackDrawerOpen(false)
      setToast({ message: '感谢您的反馈！', type: 'success' })
    } catch (e) { console.error(e) }
  }

  if (!enterpriseId) {
    return (
      <div className="p-6 text-center text-gray-500">
        <div className="text-5xl mb-4">🏢</div>
        <p>请先选择一个企业</p>
      </div>
    )
  }

  if (loading) {
    return <div className="p-6 text-center text-gray-400">加载入职向导...</div>
  }

  if (!wizard) {
    return (
      <EmptyState
        icon="🎯"
        title="暂无入职向导"
        description="您还没有待完成的入职流程"
      />
    )
  }

  if (wizard.completedAt && !feedbackDrawerOpen) {
    return (
      <div className="p-6 text-center">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold mb-2">入职完成！</h2>
        <p className="text-gray-500 mb-6">恭喜你完成了所有入职流程，欢迎加入团队！</p>
        <div className="flex justify-center mb-6">
          <ProgressRing percent={100} size={120} color="#8b5cf6" label="完成" />
        </div>
        <Button onClick={() => setFeedbackDrawerOpen(true)} variant="secondary">
          📝 填写入职体验反馈
        </Button>
      </div>
    )
  }

  const completedSteps = wizard.steps.filter((s: any) => s.completed).length
  const pendingSteps = wizard.steps.filter((s: any) => !s.completed)

  // ===== PC端布局 =====
  if (!isMobile) {
    return (
      <div className="flex h-full">
        {/* 左侧进度面板 */}
        <div className="w-80 border-r bg-white p-6 overflow-y-auto">
          <div className="text-center mb-6">
            <ProgressRing
              percent={wizard.progressPercent}
              size={100}
              color="#8b5cf6"
              label={`${completedSteps}/${wizard.totalSteps}`}
            />
            <h2 className="text-xl font-bold mt-4">{wizard.name}</h2>
            <p className="text-sm text-gray-500 mt-1">
              预计完成时间 {wizard.estimatedMinutes || 45} 分钟
            </p>
          </div>

          <div className="space-y-2">
            {wizard.steps.map((step: any) => {
              const template = STEP_TEMPLATES[step.template] || { icon: '📋', title: step.title }
              return (
                <button
                  key={step.order}
                  onClick={() => setActiveStep(step)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left ${
                    step.current
                      ? 'bg-purple-50 border-2 border-purple-300'
                      : step.completed
                        ? 'bg-green-50 text-green-700'
                        : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <span className="text-2xl">{step.completed ? '✅' : step.current ? template.icon : '○'}</span>
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium text-sm ${step.completed ? 'text-green-700' : ''}`}>
                      {step.order}. {step.title}
                    </div>
                    {step.current && <div className="text-xs text-purple-600">进行中</div>}
                  </div>
                </button>
              )
            })}
          </div>

          <Divider />

          <div className="space-y-3">
            <StatCard icon="📊" label="完成进度" value={`${completedSteps}/${wizard.totalSteps}`} color="purple" />
            <StatCard
              icon="⏱️"
              label="开始时间"
              value={wizard.startedAt ? new Date(wizard.startedAt).toLocaleDateString('zh-CN') : '-'}
              color="blue"
            />
          </div>
        </div>

        {/* 右侧步骤内容 */}
        <div className="flex-1 overflow-y-auto p-8">
          {!activeStep ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">{STEP_TEMPLATES[wizard.steps[0]?.template]?.icon || '🎯'}</div>
              <h2 className="text-2xl font-bold mb-2">{wizard.steps[0]?.title}</h2>
              <p className="text-gray-500 mb-6">点击左侧步骤开始</p>
              <Button onClick={() => setActiveStep(wizard.steps.find((s: any) => s.current || !s.completed))}>
                继续入职流程 →
              </Button>
            </div>
          ) : (
            <StepDetail
              step={activeStep}
              template={STEP_TEMPLATES[activeStep.template]}
              stepData={stepData}
              onDataChange={setStepData}
              onComplete={handleStepComplete}
              onBack={() => setActiveStep(null)}
              submitting={submitting}
            />
          )}
        </div>

        {toast && <Toast {...toast} onClose={() => setToast(null)} />}

        {/* 入职反馈抽屉 */}
        <Drawer open={feedbackDrawerOpen} onClose={() => setFeedbackDrawerOpen(false)} title="🎉 入职体验反馈">
          <div className="space-y-6">
            <p className="text-gray-600">感谢您完成入职！请花1分钟评价您的入职体验，帮助我们改进。</p>
            <div className="text-center">
              <div className="text-3xl mb-2">{'⭐'.repeat(rating)}</div>
              <input
                type="range" min="1" max="5" value={rating}
                onChange={e => setRating(parseInt(e.target.value))}
                className="w-full"
              />
              <div className="text-sm text-gray-500 mt-1">
                {rating === 5 ? '非常满意' : rating === 4 ? '满意' : rating === 3 ? '一般' : '不满意'}
              </div>
            </div>
            <Button block onClick={handleFeedback}>提交反馈</Button>
          </div>
        </Drawer>
      </div>
    )
  }

  // ===== 手机端布局 =====
  return (
    <div className="flex flex-col h-full bg-gray-50">
      <PageHeader
        title="入职向导"
        icon="🎯"
        subtitle={`${completedSteps}/${wizard.totalSteps} 步完成`}
        rightAction={
          <button
            onClick={() => setActiveStep(wizard.steps.find((s: any) => s.current || !s.completed))}
            className="text-purple-600 text-sm font-medium"
          >
            继续 →
          </button>
        }
      />

      {/* 进度条 */}
      <div className="bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <ProgressRing percent={wizard.progressPercent} size={48} strokeWidth={4} />
          <div className="flex-1">
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium">{wizard.name}</span>
              <span className="text-gray-500">{wizard.progressPercent}%</span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-purple-600 rounded-full transition-all" style={{ width: `${wizard.progressPercent}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* 步骤列表 */}
      <div className="flex-1 overflow-y-auto pb-20">
        <div className="p-4 space-y-3">
          {wizard.steps.map((step: any, idx: number) => {
            const template = STEP_TEMPLATES[step.template] || { icon: '📋', title: step.title }
            const isNext = !step.completed && wizard.steps.filter((s: any) => !s.completed)[0]?.order === step.order
            return (
              <div
                key={step.order}
                onClick={() => !step.completed && setActiveStep(step)}
                className={`bg-white rounded-xl p-4 border transition-all ${
                  step.completed ? 'border-green-200 bg-green-50' :
                  isNext ? 'border-purple-300 shadow-sm' : 'border-gray-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${
                    step.completed ? 'bg-green-100' : isNext ? 'bg-purple-100' : 'bg-gray-100'
                  }`}>
                    {step.completed ? '✅' : template.icon}
                  </div>
                  <div className="flex-1">
                    <div className={`font-medium ${step.completed ? 'text-green-700' : 'text-gray-900'}`}>
                      {step.order}. {step.title}
                    </div>
                    <div className="text-sm text-gray-500">
                      {step.completed ? '已完成' : isNext ? '点击继续' : '待完成'}
                    </div>
                  </div>
                  {isNext && <span className="text-purple-600">›</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 步骤详情底部Sheet */}
      <Drawer
        open={!!activeStep}
        onClose={() => setActiveStep(null)}
        title={activeStep ? `${activeStep.order}. ${activeStep.title}` : ''}
        height="85vh"
      >
        {activeStep && (
          <StepDetail
            step={activeStep}
            template={STEP_TEMPLATES[activeStep.template]}
            stepData={stepData}
            onDataChange={setStepData}
            onComplete={handleStepComplete}
            onBack={() => setActiveStep(null)}
            submitting={submitting}
            mobile
          />
        )}
      </Drawer>

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* 入职反馈 */}
      <Drawer open={feedbackDrawerOpen} onClose={() => setFeedbackDrawerOpen(false)} title="🎉 入职体验反馈" height="50vh">
        <div className="space-y-6">
          <p className="text-gray-600 text-sm">感谢您完成入职！请评价您的入职体验。</p>
          <div className="text-center">
            <div className="text-3xl mb-2 cursor-pointer select-none">
              {'⭐'.repeat(rating).split('').map((s, i) => (
                <span key={i} onClick={() => setRating(i + 1)}>{s}</span>
              ))}
            </div>
            <input type="range" min="1" max="5" value={rating} onChange={e => setRating(parseInt(e.target.value))} className="w-full mt-2" />
            <p className="text-sm text-gray-500 mt-1">{['很差', '较差', '一般', '满意', '非常满意'][rating - 1]}</p>
          </div>
          <Button block onClick={handleFeedback}>提交</Button>
        </div>
      </Drawer>
    </div>
  )
}

// 步骤详情组件
function StepDetail({ step, template, stepData, onDataChange, onComplete, onBack, submitting, mobile }: any) {
  const templateData = template || { icon: '📋', title: step.title, description: '', fields: [] }

  const handleCheckboxChange = (key: string, checked: boolean) => {
    const current = stepData[key] || false
    onDataChange({ ...stepData, [key]: !current })
  }

  const handleFieldChange = (key: string, value: any) => {
    onDataChange({ ...stepData, [key]: value })
  }

  // 计算该步骤是否有内容可交互
  const hasCheckboxes = templateData.fields?.some((f: any) => f.type === 'checkbox')
  const hasForm = templateData.fields?.some((f: any) => f.type === 'textarea' || f.type === 'input')

  const allRequiredChecked = templateData.fields
    ?.filter((f: any) => f.type === 'checkbox')
    ?.every((f: any) => stepData[f.key])

  return (
    <div className={mobile ? '' : 'max-w-2xl mx-auto'}>
      {/* 步骤图标 */}
      <div className="text-center mb-6">
        <div className="text-6xl mb-3">{templateData.icon}</div>
        <h3 className="text-xl font-bold">{templateData.title}</h3>
        <p className="text-gray-500 mt-1">{templateData.description}</p>
      </div>

      {/* 字段 */}
      {templateData.fields?.length > 0 && (
        <div className="space-y-4 mb-6">
          {templateData.fields.map((field: any, i: number) => {
            if (field.type === 'checkbox') {
              return (
                <label key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={!!stepData[field.key]}
                    onChange={() => handleCheckboxChange(field.key, !stepData[field.key])}
                    className="mt-1 w-5 h-5 text-purple-600 rounded"
                  />
                  <span className="text-sm">{field.label}</span>
                </label>
              )
            }
            if (field.type === 'textarea') {
              return (
                <div key={i}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                  <textarea
                    value={stepData[field.key] || ''}
                    onChange={e => handleFieldChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    rows={4}
                    className="w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
                  />
                </div>
              )
            }
            if (field.type === 'input') {
              return (
                <div key={i}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                  <input
                    type="text"
                    value={stepData[field.key] || ''}
                    onChange={e => handleFieldChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
              )
            }
            return null
          })}
        </div>
      )}

      {/* 提示 */}
      {step.required && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-800">
          ⚠️ 此步骤为必完成项
        </div>
      )}

      {/* 操作 */}
      <div className="flex gap-3">
        {mobile && (
          <Button variant="secondary" onClick={onBack} className="flex-1">返回</Button>
        )}
        <Button
          block={mobile}
          onClick={onComplete}
          loading={submitting}
          disabled={hasCheckboxes && !allRequiredChecked}
          className="flex-1"
        >
          {step.order === 8 ? '🎉 完成入职' : '✅ 完成此步骤'}
        </Button>
      </div>
    </div>
  )
}
