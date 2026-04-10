/**
 * 工作流执行引擎
 * 支持触发器 → 条件 → 动作 的自动化流程
 */

import { FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

const workflowEngineRoutes: FastifyPluginAsync = async (fastify) => {

  // ========================================
  // 工作流执行（触手侧）
  // ========================================

  // 执行工作流
  fastify.post('/connections/:connectionId/workflows/:workflowId/execute', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['工作流'],
      summary: '执行企业工作流',
      body: {
        type: 'object',
        properties: {
          inputs: { type: 'object' },
          trigger: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { connectionId, workflowId } = request.params as any
    const { inputs = {}, trigger = 'manual' } = request.body as any

    // 验证连接
    const connection = await fastify.db.query(
      `SELECT * FROM user_enterprise_connections WHERE id = $1 AND user_id = $2 AND status = 'active'`,
      [connectionId, userId]
    )

    if (connection.rows.length === 0) {
      return reply.status(403).send({ error: '连接不存在或无权使用' })
    }

    const enterpriseId = connection.rows[0].enterprise_id

    // 获取工作流
    const workflow = await fastify.db.query(
      `SELECT * FROM enterprise_workflows 
       WHERE id = $1 AND enterprise_id = $2 AND is_active = true`,
      [workflowId, enterpriseId]
    )

    if (workflow.rows.length === 0) {
      return reply.status(404).send({ error: '工作流不存在' })
    }

    const workflowData = workflow.rows[0]
    const workflowDef = typeof workflowData.workflow_def === 'string' 
      ? JSON.parse(workflowData.workflow_def) 
      : workflowData.workflow_def

    // 执行工作流
    try {
      const result = await executeWorkflow(workflowDef, inputs, userId, enterpriseId)

      // 更新使用次数
      await fastify.db.query(
        `UPDATE enterprise_workflows SET use_count = use_count + 1 WHERE id = $1`,
        [workflowId]
      )

      // 记录执行日志
      await logWorkflowExecution(workflowId, connectionId, userId, 'success', result)

      return {
        success: true,
        data: result,
        workflow: {
          id: workflowId,
          name: workflowData.name
        }
      }
    } catch (err: any) {
      await logWorkflowExecution(workflowId, connectionId, userId, 'failed', { error: err.message })
      return reply.status(500).send({ error: err.message })
    }
  })

  // 获取快捷命令
  fastify.get('/connections/:connectionId/shortcuts', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['快捷命令'],
      summary: '获取快捷命令列表'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { connectionId } = request.params as any

    const connection = await fastify.db.query(
      `SELECT enterprise_id FROM user_enterprise_connections WHERE id = $1 AND user_id = $2 AND status = 'active'`,
      [connectionId, userId]
    )

    if (connection.rows.length === 0) {
      return { success: false, error: '连接不存在' }
    }

    const shortcuts = await fastify.db.query(
      `SELECT id, name, description, shortcut_key, action_type, action_config, icon, color
       FROM enterprise_shortcuts
       WHERE enterprise_id = $1 AND is_active = true
       ORDER BY sort_order, name`,
      [connection.rows[0].enterprise_id]
    )

    return {
      success: true,
      data: shortcuts.rows.map(s => ({
        ...s,
        action_config: typeof s.action_config === 'string' 
          ? JSON.parse(s.action_config) 
          : s.action_config || {}
      }))
    }
  })

  // 执行快捷命令
  fastify.post('/connections/:connectionId/shortcuts/:shortcutId/execute', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['快捷命令'],
      summary: '执行快捷命令'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { connectionId, shortcutId } = request.params as any
    const { params: actionParams } = request.body as any || {}

    const connection = await fastify.db.query(
      `SELECT enterprise_id FROM user_enterprise_connections WHERE id = $1 AND user_id = $2 AND status = 'active'`,
      [connectionId, userId]
    )

    if (connection.rows.length === 0) {
      return reply.status(403).send({ error: '连接不存在' })
    }

    const shortcut = await fastify.db.query(
      `SELECT * FROM enterprise_shortcuts 
       WHERE id = $1 AND enterprise_id = $2 AND is_active = true`,
      [shortcutId, connection.rows[0].enterprise_id]
    )

    if (shortcut.rows.length === 0) {
      return reply.status(404).send({ error: '快捷命令不存在' })
    }

    const shortcutData = shortcut.rows[0]
    const actionConfig = typeof shortcutData.action_config === 'string'
      ? JSON.parse(shortcutData.action_config)
      : shortcutData.action_config || {}

    try {
      const result = await executeShortcutAction(
        shortcutData.action_type,
        actionConfig,
        actionParams,
        userId,
        connection.rows[0].enterprise_id
      )

      return {
        success: true,
        message: `快捷命令"${shortcutData.name}"执行成功`,
        data: result
      }
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })

  // ========================================
  // 工作流管理（企业侧）
  // ========================================

  // 获取工作流执行历史
  fastify.get('/:enterpriseId/workflows/:workflowId/executions', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['工作流'],
      summary: '获取工作流执行历史'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId, workflowId } = request.params as any
    const { limit = 50, offset = 0 } = request.query as any

    // 检查成员身份
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0) {
      return { success: false, error: '无权访问' }
    }

    const result = await fastify.db.query(
      `SELECT we.*, u.name as user_name, u.avatar as user_avatar
       FROM workflow_executions we
       LEFT JOIN users u ON u.id = we.user_id
       WHERE we.workflow_id = $1
       ORDER BY we.created_at DESC
       LIMIT $2 OFFSET $3`,
      [workflowId, limit, offset]
    )

    return {
      success: true,
      data: result.rows.map(r => ({
        ...r,
        inputs: typeof r.inputs === 'string' ? JSON.parse(r.inputs) : r.inputs,
        outputs: typeof r.outputs === 'string' ? JSON.parse(r.outputs) : r.outputs,
        error: typeof r.error === 'string' ? JSON.parse(r.error) : r.error
      }))
    }
  })

  // 获取工作流统计
  fastify.get('/:enterpriseId/workflows/stats', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['工作流'],
      summary: '获取工作流统计'
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

    // 工作流使用统计
    const usageStats = await fastify.db.query(
      `SELECT w.id, w.name, w.category, w.use_count,
              COUNT(we.id) as execution_count,
              AVG(EXTRACT(EPOCH FROM (we.completed_at - we.created_at))) as avg_duration
       FROM enterprise_workflows w
       LEFT JOIN workflow_executions we ON we.workflow_id = w.id
       WHERE w.enterprise_id = $1
       GROUP BY w.id
       ORDER BY w.use_count DESC`,
      [enterpriseId]
    )

    // 执行趋势（最近7天）
    const trend = await fastify.db.query(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM workflow_executions we
       JOIN enterprise_workflows w ON w.id = we.workflow_id
       WHERE w.enterprise_id = $1 AND created_at > NOW() - INTERVAL '7 days'
       GROUP BY DATE(created_at)
       ORDER BY date`,
      [enterpriseId]
    )

    return {
      success: true,
      data: {
        workflows: usageStats.rows,
        trend: trend.rows
      }
    }
  })

  // ========================================
  // 辅助函数
  // ========================================

  // 执行工作流
  async function executeWorkflow(
    workflowDef: any,
    inputs: any,
    userId: string,
    enterpriseId: string
  ): Promise<any> {
    const results: any = {}
    const context = { inputs, userId, enterpriseId, results }

    // 按顺序执行步骤
    const steps = workflowDef.steps || []

    for (const step of steps) {
      // 检查条件
      if (step.condition) {
        const conditionMet = await evaluateCondition(step.condition, context)
        if (!conditionMet) {
          results[step.id] = { skipped: true, reason: 'condition_not_met' }
          continue
        }
      }

      // 执行动作
      try {
        const stepResult = await executeStep(step, context)
        results[step.id] = stepResult
        context.results[step.id] = stepResult

        // 如果步骤失败且设置了stopOnError，则停止
        if (stepResult.error && step.stopOnError) {
          throw new Error(`Step ${step.id} failed: ${stepResult.error}`)
        }
      } catch (err: any) {
        results[step.id] = { error: err.message }
        throw err
      }
    }

    return {
      completed: true,
      steps: results,
      finalOutput: workflowDef.output ? await resolveTemplate(workflowDef.output, context) : results
    }
  }

  // 执行单个步骤
  async function executeStep(step: any, context: any): Promise<any> {
    const { action, params } = step
    const resolvedParams = await resolveTemplateObject(params, context)

    switch (action) {
      case 'http_request':
        return await executeHttpRequest(resolvedParams)
      
      case 'database_query':
        return await executeDbQuery(resolvedParams, context)
      
      case 'send_message':
        return await executeSendMessage(resolvedParams, context)
      
      case 'create_task':
        return await executeCreateTask(resolvedParams, context)
      
      case 'create_document':
        return await executeCreateDocument(resolvedParams, context)
      
      case 'send_notification':
        return await executeSendNotification(resolvedParams, context)
      
      case 'ai_transform':
        return await executeAITransform(resolvedParams, context)
      
      case 'email':
        return await executeEmail(resolvedParams, context)
      
      case 'transform':
        return { data: resolvedParams.data || resolvedParams }
      
      case 'condition':
        return { result: await evaluateCondition(resolvedParams, context) }
      
      case 'delay':
        await new Promise(resolve => setTimeout(resolve, (resolvedParams.ms || 1000)))
        return { delayed: true, ms: resolvedParams.ms }
      
      case 'log':
        fastify.log.info(`Workflow log: ${resolvedParams.message}`)
        return { logged: true, message: resolvedParams.message }
      
      default:
        throw new Error(`Unknown action: ${action}`)
    }
  }

  // HTTP请求
  async function executeHttpRequest(params: any): Promise<any> {
    const { url, method = 'GET', headers = {}, body, timeout = 30000 } = params

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout)
    })

    const contentType = response.headers.get('content-type')
    let data
    if (contentType?.includes('application/json')) {
      data = await response.json()
    } else {
      data = await response.text()
    }

    return {
      status: response.status,
      ok: response.ok,
      data
    }
  }

  // 数据库查询
  async function executeDbQuery(params: any, context: any): Promise<any> {
    const { sql, values } = params

    // 安全检查：只允许SELECT语句
    if (!sql.trim().toLowerCase().startsWith('select')) {
      throw new Error('Only SELECT queries are allowed in workflows')
    }

    const resolvedSql = await resolveTemplate(sql, context)
    const result = await fastify.db.query(resolvedSql, values || [])

    return {
      rows: result.rows,
      rowCount: result.rowCount
    }
  }

  // 发送消息
  async function executeSendMessage(params: any, context: any): Promise<any> {
    const { channel, message, mentions } = params
    const resolvedMessage = await resolveTemplate(message, context)

    const msgId = uuidv4()
    await fastify.db.query(
      `INSERT INTO messages (id, enterprise_id, sender_id, channel, content, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [msgId, context.enterpriseId, context.userId, channel, resolvedMessage]
    )

    // 如果有提及，发送通知
    if (mentions && mentions.length > 0) {
      for (const userId of mentions) {
        await fastify.db.query(
          `INSERT INTO notifications (id, user_id, enterprise_id, type, title, content, created_at)
           VALUES ($1, $2, $3, 'mention', '有人在消息中提到了你', $4, NOW())`,
          [uuidv4(), userId, context.enterpriseId, resolvedMessage.substring(0, 100)]
        )
      }
    }

    return { messageId: msgId, sent: true }
  }

  // 创建任务
  async function executeCreateTask(params: any, context: any): Promise<any> {
    const { title, description, assigneeId, dueDate, priority } = params
    const resolvedTitle = await resolveTemplate(title, context)
    const resolvedDesc = await resolveTemplate(description || '', context)

    const taskId = uuidv4()
    await fastify.db.query(
      `INSERT INTO tasks (id, enterprise_id, title, description, assignee_id, due_date, priority, status, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'todo', $8, NOW())`,
      [taskId, context.enterpriseId, resolvedTitle, resolvedDesc, 
       assigneeId || context.userId, dueDate || null, priority || 'medium', context.userId]
    )

    return { taskId, created: true }
  }

  // 创建文档
  async function executeCreateDocument(params: any, context: any): Promise<any> {
    const { title, content, folderId } = params
    const resolvedTitle = await resolveTemplate(title, context)
    const resolvedContent = await resolveTemplate(content || '', context)

    const docId = uuidv4()
    await fastify.db.query(
      `INSERT INTO documents (id, enterprise_id, title, content, folder_id, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [docId, context.enterpriseId, resolvedTitle, resolvedContent, folderId || null, context.userId]
    )

    return { documentId: docId, created: true }
  }

  // 发送通知
  async function executeSendNotification(params: any, context: any): Promise<any> {
    const { userId, title, content, type = 'workflow' } = params
    const resolvedContent = await resolveTemplate(content, context)

    const notifId = uuidv4()
    await fastify.db.query(
      `INSERT INTO notifications (id, user_id, enterprise_id, type, title, content, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [notifId, userId, context.enterpriseId, type, title, resolvedContent]
    )

    return { notificationId: notifId, sent: true }
  }

  // AI转换
  async function executeAITransform(params: any, context: any): Promise<any> {
    const { prompt, input, model } = params
    const resolvedPrompt = await resolveTemplate(prompt, context)
    const resolvedInput = await resolveTemplate(input || '', context)

    // 获取企业AI模型
    const aiModel = await getEnterpriseAIModel(context.enterpriseId)
    if (!aiModel) {
      throw new Error('No AI model configured for this enterprise')
    }

    const fullPrompt = `${resolvedPrompt}\n\n输入: ${resolvedInput}`
    const response = await callLLM(aiModel, fullPrompt)

    return { data: response }
  }

  // 发送邮件
  async function executeEmail(params: any, context: any): Promise<any> {
    const { to, subject, body } = params
    const resolvedBody = await resolveTemplate(body, context)
    const resolvedSubject = await resolveTemplate(subject, context)

    // 邮件发送逻辑（需要配置SMTP）
    // 这里只是记录
    fastify.log.info(`Email would be sent to: ${to}, subject: ${resolvedSubject}`)

    return {
      sent: true,
      to,
      subject: resolvedSubject
    }
  }

  // 评估条件
  async function evaluateCondition(condition: any, context: any): Promise<boolean> {
    if (!condition) return true

    const { type, field, operator, value } = condition

    // 解析字段值
    let fieldValue: any
    if (field.includes('.')) {
      const parts = field.split('.')
      fieldValue = context
      for (const part of parts) {
        fieldValue = fieldValue?.[part]
      }
    } else {
      fieldValue = context.inputs?.[field] || context[field]
    }

    const resolvedValue = await resolveTemplate(value, context)

    switch (operator) {
      case 'equals':
        return fieldValue == resolvedValue
      case 'not_equals':
        return fieldValue != resolvedValue
      case 'contains':
        return String(fieldValue).includes(String(resolvedValue))
      case 'not_contains':
        return !String(fieldValue).includes(String(resolvedValue))
      case 'greater_than':
        return Number(fieldValue) > Number(resolvedValue)
      case 'less_than':
        return Number(fieldValue) < Number(resolvedValue)
      case 'is_empty':
        return !fieldValue || fieldValue === ''
      case 'is_not_empty':
        return fieldValue && fieldValue !== ''
      case 'matches':
        return new RegExp(resolvedValue).test(String(fieldValue))
      default:
        return true
    }
  }

  // 解析模板字符串
  async function resolveTemplate(template: string, context: any): Promise<string> {
    if (typeof template !== 'string') return template

    // 替换 {{inputs.xxx}}、{{results.xxx}}、{{userId}} 等
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const trimmedPath = path.trim()
      const parts = trimmedPath.split('.')
      
      let value: any = context
      for (const part of parts) {
        if (part === 'inputs') continue
        value = value?.[part]
      }
      
      return value !== undefined ? String(value) : match
    })
  }

  // 解析模板对象
  async function resolveTemplateObject(obj: any, context: any): Promise<any> {
    if (typeof obj === 'string') {
      return await resolveTemplate(obj, context)
    }
    if (Array.isArray(obj)) {
      return Promise.all(obj.map(item => resolveTemplateObject(item, context)))
    }
    if (obj && typeof obj === 'object') {
      const result: any = {}
      for (const [key, value] of Object.entries(obj)) {
        result[key] = await resolveTemplateObject(value, context)
      }
      return result
    }
    return obj
  }

  // 执行快捷命令动作
  async function executeShortcutAction(
    actionType: string,
    config: any,
    params: any,
    userId: string,
    enterpriseId: string
  ): Promise<any> {
    const context = { inputs: params, userId, enterpriseId, results: {} }

    switch (actionType) {
      case 'workflow':
        if (config.workflowId) {
          const workflow = await fastify.db.query(
            `SELECT workflow_def FROM enterprise_workflows WHERE id = $1`,
            [config.workflowId]
          )
          if (workflow.rows.length > 0) {
            const workflowDef = typeof workflow.rows[0].workflow_def === 'string'
              ? JSON.parse(workflow.rows[0].workflow_def)
              : workflow.rows[0].workflow_def
            return await executeWorkflow(workflowDef, params, userId, enterpriseId)
          }
        }
        return { error: 'Workflow not found' }

      case 'webhook':
        return await executeHttpRequest(config)

      case 'command':
        // 执行预设命令
        return await executeShortcutCommand(config, context)

      default:
        return { error: `Unknown action type: ${actionType}` }
    }
  }

  // 执行快捷命令
  async function executeShortcutCommand(config: any, context: any): Promise<any> {
    const { command, args } = config

    switch (command) {
      case 'create_leave_request':
        return await executeCreateTask({
          title: '请假申请',
          description: `请假类型: ${context.inputs.type || '事假'}, 
                        开始: ${context.inputs.startDate}, 
                        结束: ${context.inputs.endDate},
                        原因: ${context.inputs.reason || '无'}`,
          priority: 'medium'
        }, context)

      case 'create_expense':
        return await executeCreateTask({
          title: '报销申请',
          description: `金额: ${context.inputs.amount}, 
                        类型: ${context.inputs.category},
                        用途: ${context.inputs.description}`,
          priority: 'low'
        }, context)

      case 'meeting_summary':
        return await executeAITransform({
          prompt: '请总结以下会议内容，提取关键决策和待办事项',
          input: context.inputs.transcript || context.inputs.content || ''
        }, context)

      case 'weekly_report':
        return await executeAITransform({
          prompt: '请根据以下工作内容生成周报',
          input: JSON.stringify(context.inputs.tasks || [])
        }, context)

      default:
        return { error: `Unknown command: ${command}` }
    }
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
  async function callLLM(aiModel: any, prompt: string): Promise<string> {
    let endpoint = aiModel.apiEndpoint
    let body: any = {
      model: aiModel.modelId,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: aiModel.maxTokens || 1000,
      temperature: aiModel.temperature || 0.7
    }

    if (aiModel.provider === 'openai' || !aiModel.provider) {
      endpoint = endpoint || 'https://api.openai.com/v1/chat/completions'
    } else if (aiModel.provider === 'anthropic') {
      endpoint = endpoint || 'https://api.anthropic.com/v1/messages'
      body = {
        model: aiModel.modelId,
        max_tokens: aiModel.maxTokens || 1024,
        messages: [{ role: 'user', content: prompt }]
      }
    } else if (aiModel.provider === 'deepseek') {
      endpoint = endpoint || 'https://api.deepseek.com/chat/completions'
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (aiModel.apiKey) {
      if (aiModel.provider === 'anthropic') {
        headers['x-api-key'] = aiModel.apiKey
        headers['anthropic-version'] = '2023-06-01'
      } else {
        headers['Authorization'] = `Bearer ${aiModel.apiKey}`
      }
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
    return aiModel.provider === 'anthropic' ? data.content[0].text : data.choices[0].message.content
  }

  // 记录工作流执行
  async function logWorkflowExecution(
    workflowId: string,
    connectionId: string,
    userId: string,
    status: string,
    result: any
  ) {
    const logId = uuidv4()
    await fastify.db.query(
      `INSERT INTO workflow_executions (id, workflow_id, connection_id, user_id, status, inputs, outputs, error, created_at, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
      [logId, workflowId, connectionId, userId, status, '{}', 
       JSON.stringify(result), status === 'failed' ? JSON.stringify(result) : null]
    )
  }
}

export default workflowEngineRoutes
