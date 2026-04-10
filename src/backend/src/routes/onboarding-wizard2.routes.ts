/**
 * 智能入职向导2.0
 * 分步骤引导 + 任务清单 + 完成进度 + AI助手
 */

import { FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

const onboardingWizard2Routes: FastifyPluginAsync = async (fastify) => {

  // ========================================
  // 入职向导管理（企业侧）
  // ========================================

  // 获取入职模板列表
  fastify.get('/:enterpriseId/onboarding/templates', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['入职向导'],
      summary: '获取入职模板列表'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any

    // 检查管理员权限
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0 || !['owner', 'admin'].includes(member.rows[0].role)) {
      return { success: false, error: '无权访问' }
    }

    const result = await fastify.db.query(
      `SELECT id, name, description, tasks, estimated_days, is_active, created_at
       FROM onboarding_templates
       WHERE enterprise_id = $1
       ORDER BY created_at DESC`,
      [enterpriseId]
    )

    return {
      success: true,
      data: result.rows.map(t => ({
        ...t,
        tasks: typeof t.tasks === 'string' ? JSON.parse(t.tasks) : t.tasks || [],
        taskCount: (t.tasks ? JSON.parse(t.tasks) : []).length
      }))
    }
  })

  // 创建入职模板
  fastify.post('/:enterpriseId/onboarding/templates', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['入职向导'],
      summary: '创建入职模板'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any
    const { name, description, tasks, estimatedDays } = request.body as any

    // 检查管理员权限
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0 || !['owner', 'admin'].includes(member.rows[0].role)) {
      return { success: false, error: '无权访问' }
    }

    const templateId = uuidv4()
    await fastify.db.query(
      `INSERT INTO onboarding_templates 
       (id, enterprise_id, name, description, tasks, estimated_days, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [templateId, enterpriseId, name, description || '', JSON.stringify(tasks || []), estimatedDays || 7, userId]
    )

    return {
      success: true,
      message: '入职模板创建成功',
      data: { id: templateId }
    }
  })

  // 更新入职模板
  fastify.patch('/:enterpriseId/onboarding/templates/:templateId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['入职向导'],
      summary: '更新入职模板'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId, templateId } = request.params as any
    const updates = request.body as any

    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0 || !['owner', 'admin'].includes(member.rows[0].role)) {
      return { success: false, error: '无权访问' }
    }

    const fields = []
    const values = []
    let i = 1

    if (updates.name) { fields.push(`name = $${i++}`); values.push(updates.name) }
    if (updates.description !== undefined) { fields.push(`description = $${i++}`); values.push(updates.description) }
    if (updates.tasks) { fields.push(`tasks = $${i++}`); values.push(JSON.stringify(updates.tasks)) }
    if (updates.estimatedDays) { fields.push(`estimated_days = $${i++}`); values.push(updates.estimatedDays) }
    if (updates.isActive !== undefined) { fields.push(`is_active = $${i++}`); values.push(updates.isActive) }

    if (fields.length > 0) {
      fields.push(`updated_at = NOW()`)
      values.push(templateId, enterpriseId)
      await fastify.db.query(
        `UPDATE onboarding_templates SET ${fields.join(', ')} 
         WHERE id = $${i++} AND enterprise_id = $${i}`,
        values
      )
    }

    return { success: true, message: '模板已更新' }
  })

  // ========================================
  # 个人入职任务（触手侧）
  # ========================================

  // 获取个人入职任务
  fastify.get('/:enterpriseId/onboarding/my-tasks', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['入职向导'],
      summary: '获取我的入职任务'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any

    // 获取成员信息
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0) {
      return { success: false, error: '无权访问' }
    }

    // 获取或创建入职任务
    let onboarding = await fastify.db.query(
      `SELECT * FROM employee_onboarding 
       WHERE user_id = $1 AND enterprise_id = $2`,
      [userId, enterpriseId]
    )

    if (onboarding.rows.length === 0) {
      // 自动创建入职任务
      return await createOnboardingTasks(userId, enterpriseId)
    }

    const onboardingData = onboarding.rows[0]
    const tasks = typeof onboardingData.tasks === 'string'
      ? JSON.parse(onboardingData.tasks)
      : (onboardingData.tasks || [])

    // 计算进度
    const completedCount = tasks.filter((t: any) => t.status === 'completed').length
    const progress = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0

    return {
      success: true,
      data: {
        id: onboardingData.id,
        startedAt: onboardingData.started_at,
        estimatedEndDate: onboardingData.estimated_end_date,
        completedAt: onboardingData.completed_at,
        progress,
        tasks: tasks.map((t: any) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          category: t.category,
          status: t.status,
          order: t.order,
          completedAt: t.completedAt
        }))
      }
    }
  })

  // 完成任务
  fastify.post('/:enterpriseId/onboarding/my-tasks/:taskId/complete', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['入职向导'],
      summary: '完成任务'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId, taskId } = request.params as any
    const { notes } = request.body as any || {}

    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0) {
      return { success: false, error: '无权访问' }
    }

    const onboarding = await fastify.db.query(
      `SELECT tasks FROM employee_onboarding 
       WHERE user_id = $1 AND enterprise_id = $2`,
      [userId, enterpriseId]
    )

    if (onboarding.rows.length === 0) {
      return { success: false, error: '入职任务不存在' }
    }

    let tasks = typeof onboarding.rows[0].tasks === 'string'
      ? JSON.parse(onboarding.rows[0].tasks)
      : onboarding.rows[0].tasks || []

    const taskIndex = tasks.findIndex((t: any) => t.id === taskId)
    if (taskIndex === -1) {
      return { success: false, error: '任务不存在' }
    }

    tasks[taskIndex].status = 'completed'
    tasks[taskIndex].completedAt = new Date().toISOString()
    if (notes) {
      tasks[taskIndex].notes = notes
    }

    // 检查是否全部完成
    const allCompleted = tasks.every((t: any) => t.status === 'completed')
    const now = new Date()

    await fastify.db.query(
      `UPDATE employee_onboarding 
       SET tasks = $1, completed_at = $2
       WHERE user_id = $3 AND enterprise_id = $4`,
      [JSON.stringify(tasks), allCompleted ? now : null, userId, enterpriseId]
    )

    // 记录活动
    await fastify.db.query(
      `INSERT INTO activity_logs (id, user_id, enterprise_id, type, content, created_at)
       VALUES ($1, $2, $3, 'onboarding_task', $4, NOW())`,
      [uuidv4(), userId, enterpriseId, `完成了入职任务: ${tasks[taskIndex].title}`]
    )

    return {
      success: true,
      message: allCompleted ? '🎉 恭喜！入职任务全部完成！' : '任务已完成',
      data: {
        taskId,
        completedAt: tasks[taskIndex].completedAt,
        allCompleted
      }
    }
  })

  // 获取入职助手对话
  fastify.post('/:enterpriseId/onboarding/chat', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['入职向导'],
      summary: '入职AI助手对话'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any
    const { message } = request.body as any

    if (!message) {
      return reply.status(400).send({ error: '消息不能为空' })
    }

    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0) {
      return reply.status(403).send({ error: '无权访问' })
    }

    // 获取入职任务上下文
    const onboarding = await fastify.db.query(
      `SELECT tasks FROM employee_onboarding 
       WHERE user_id = $1 AND enterprise_id = $2`,
      [userId, enterpriseId]
    )

    let tasksContext = ''
    if (onboarding.rows.length > 0) {
      const tasks = typeof onboarding.rows[0].tasks === 'string'
        ? JSON.parse(onboarding.rows[0].tasks)
        : (onboarding.rows[0].tasks || [])
      const pendingTasks = tasks.filter((t: any) => t.status !== 'completed')
      tasksContext = `当前待完成入职任务:\n${pendingTasks.map((t: any, i: number) => 
        `${i + 1}. ${t.title} - ${t.description || '无描述'}`
      ).join('\n')}`
    }

    // 获取企业信息
    const enterprise = await fastify.db.query(
      `SELECT name, description FROM enterprises WHERE id = $1`,
      [enterpriseId]
    )

    // 获取企业AI模型
    const aiModel = await getEnterpriseAIModel(enterpriseId)

    if (!aiModel) {
      return {
        success: true,
        data: {
          reply: '企业暂未配置AI助手，请联系管理员。',
          suggestions: ['联系HR', '查看入职文档', '查看部门同事']
        }
      }
    }

    // 构建提示
    const systemPrompt = `你是一个新员工入职助手。你的任务是帮助新员工快速了解公司、完成入职流程、融入团队。

企业信息: ${enterprise.rows[0]?.name || '未知公司'}

${tasksContext}

请:
1. 友好、耐心地回答新员工的问题
2. 帮助他们了解公司文化、流程、制度
3. 引导他们完成待完成的入职任务
4. 如果不知道答案，告诉他们可以咨询谁
5. 回答要简洁、有帮助，不要太冗长
6. 适当使用emoji让对话更友好`

    try {
      const reply = await callLLM(aiModel, systemPrompt, message)

      // 生成建议回复
      const suggestions = generateSuggestions(message, tasksContext)

      return {
        success: true,
        data: {
          reply,
          suggestions
        }
      }
    } catch (err) {
      fastify.log.error('AI chat error:', err)
      return {
        success: true,
        data: {
          reply: '抱歉，AI助手暂时不可用。请稍后重试或联系HR。',
          suggestions: ['查看入职文档', '联系HR', '查看部门同事']
        }
      }
    }
  })

  // 获取入职进度报告
  fastify.get('/:enterpriseId/onboarding/report', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['入职向导'],
      summary: '获取入职进度报告'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any

    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0) {
      return { success: false, error: '无权访问' }
    }

    const onboarding = await fastify.db.query(
      `SELECT * FROM employee_onboarding 
       WHERE user_id = $1 AND enterprise_id = $2`,
      [userId, enterpriseId]
    )

    if (onboarding.rows.length === 0) {
      return { success: false, error: '入职任务不存在' }
    }

    const data = onboarding.rows[0]
    const tasks = typeof data.tasks === 'string' ? JSON.parse(data.tasks) : (data.tasks || [])

    // 按类别分组
    const byCategory: Record<string, { total: number, completed: number }> = {}
    for (const task of tasks) {
      const cat = task.category || '其他'
      if (!byCategory[cat]) {
        byCategory[cat] = { total: 0, completed: 0 }
      }
      byCategory[cat].total++
      if (task.status === 'completed') {
        byCategory[cat].completed++
      }
    }

    // 计算时间统计
    const startedAt = new Date(data.started_at)
    const now = new Date()
    const daysPassed = Math.ceil((now.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24))
    const estimatedDays = data.estimated_end_date 
      ? Math.ceil((new Date(data.estimated_end_date).getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24))
      : 7
    const onTrack = !data.completed_at && daysPassed <= estimatedDays

    return {
      success: true,
      data: {
        overview: {
          totalTasks: tasks.length,
          completedTasks: tasks.filter((t: any) => t.status === 'completed').length,
          progress: tasks.length > 0 ? Math.round((tasks.filter((t: any) => t.status === 'completed').length / tasks.length) * 100) : 0,
          isCompleted: !!data.completed_at
        },
        byCategory: Object.entries(byCategory).map(([category, stats]) => ({
          category,
          total: stats.total,
          completed: stats.completed,
          progress: Math.round((stats.completed / stats.total) * 100)
        })),
        timeline: {
          startedAt: data.started_at,
          estimatedEndDate: data.estimated_end_date,
          completedAt: data.completed_at,
          daysPassed,
          estimatedDays,
          onTrack
        }
      }
    }
  })

  // ========================================
  // 辅助函数
  // ========================================

  // 创建入职任务
  async function createOnboardingTasks(userId: string, enterpriseId: string) {
    // 获取默认模板或创建标准任务
    const defaultTasks = [
      { id: uuidv4(), title: '📋 阅读公司介绍', description: '了解公司历史、愿景、价值观', category: '了解公司', order: 1 },
      { id: uuidv4(), title: '👥 认识团队成员', description: '和团队成员打个招呼', category: '融入团队', order: 2 },
      { id: uuidv4(), title: '🔑 获取工作账号', description: '开通邮箱、Slack/飞书等账号', category: '账号开通', order: 3 },
      { id: uuidv4(), title: '💻 配置工作环境', description: '安装必要的软件和工具', category: '准备工作', order: 4 },
      { id: uuidv4(), title: '📖 学习工作流程', description: '了解日常工作流程和规范', category: '学习流程', order: 5 },
      { id: uuidv4(), title: '📝 签署必要文件', description: '完成入职合同、保密协议等', category: '行政手续', order: 6 },
      { id: uuidv4(), title: '🎯 了解岗位职责', description: '和主管确认工作目标和期望', category: '明确目标', order: 7 },
      { id: uuidv4(), title: '💬 参加入职培训', description: '完成新员工培训课程', category: '培训学习', order: 8 }
    ]

    const estimatedEndDate = new Date()
    estimatedEndDate.setDate(estimatedEndDate.getDate() + 7)

    const onboardingId = uuidv4()
    await fastify.db.query(
      `INSERT INTO employee_onboarding 
       (id, user_id, enterprise_id, tasks, started_at, estimated_end_date)
       VALUES ($1, $2, $3, $4, NOW(), $5)`,
      [onboardingId, userId, enterpriseId, JSON.stringify(defaultTasks), estimatedEndDate]
    )

    return {
      success: true,
      data: {
        id: onboardingId,
        startedAt: new Date().toISOString(),
        estimatedEndDate: estimatedEndDate.toISOString(),
        progress: 0,
        tasks: defaultTasks.map(t => ({ ...t, status: 'pending' }))
      }
    }
  }

  // 生成建议回复
  function generateSuggestions(message: string, tasksContext: string): string[] {
    const suggestions = [
      '查看入职任务清单',
      '了解公司制度',
      '联系HR',
      '查看部门同事'
    ]

    const lowerMsg = message.toLowerCase()

    if (lowerMsg.includes('任务') || lowerMsg.includes('待办')) {
      return ['查看我的任务', '完成下一个任务', '跳过某个任务']
    }
    if (lowerMsg.includes('流程') || lowerMsg.includes('怎么')) {
      return ['请假流程', '报销流程', '请假HR']
    }
    if (lowerMsg.includes('工具') || lowerMsg.includes('软件')) {
      return ['需要安装什么软件', '常用工具清单', '联系IT支持']
    }
    if (lowerMsg.includes('同事') || lowerMsg.includes('团队')) {
      return ['查看通讯录', '认识主管', '查看团队成员']
    }

    return suggestions
  }

  // 获取企业AI模型
  async function getEnterpriseAIModel(enterpriseId: string) {
    const result = await fastify.db.query(
      `SELECT * FROM enterprise_ai_models 
       WHERE enterprise_id = $1 AND is_enabled = true AND is_default = true
       LIMIT 1`,
      [enterpriseId]
    )

    if (result.rows.length === 0) return null

    const model = result.rows[0]
    let apiKey = ''
    if (model.api_key_encrypted) {
      apiKey = Buffer.from(model.api_key_encrypted, 'base64').toString()
    }

    return {
      provider: model.provider,
      modelId: model.model_id,
      apiKey,
      apiEndpoint: model.api_endpoint,
      maxTokens: model.max_tokens,
      temperature: model.temperature,
      systemPrompt: model.system_prompt
    }
  }

  // 调用LLM
  async function callLLM(aiModel: any, systemPrompt: string, userMessage: string): Promise<string> {
    let endpoint = aiModel.apiEndpoint
    let body: any = {
      model: aiModel.modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      max_tokens: aiModel.maxTokens || 1000,
      temperature: aiModel.temperature || 0.7
    }

    if (aiModel.provider === 'openai' || !aiModel.provider) {
      endpoint = endpoint || 'https://api.openai.com/v1/chat/completions'
    } else if (aiModel.provider === 'deepseek') {
      endpoint = endpoint || 'https://api.deepseek.com/chat/completions'
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (aiModel.apiKey) {
      headers['Authorization'] = `Bearer ${aiModel.apiKey}`
    }

    const response = await fetch(endpoint!, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`LLM API failed: ${error}`)
    }

    const data = await response.json()
    return data.choices[0].message.content
  }
}

export default onboardingWizard2Routes
