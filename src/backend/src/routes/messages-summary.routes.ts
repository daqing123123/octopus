/**
 * 消息摘要路由
 * AI汇总重要消息、定时推送
 */

import { FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

const messagesSummaryRoutes: FastifyPluginAsync = async (fastify) => {

  // ========================================
  # 消息摘要
  # ========================================

  // 获取今日消息摘要
  fastify.post('/:enterpriseId/summary/daily', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['消息摘要'],
      summary: '生成今日消息摘要'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any

    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0) {
      return reply.status(403).send({ error: '无权访问' })
    }

    // 获取今日消息
    const messages = await fastify.db.query(
      `SELECT m.*, u.name as sender_name, u.avatar as sender_avatar
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.enterprise_id = $1 
         AND m.created_at >= CURRENT_DATE
         AND m.channel IN (SELECT channel FROM channel_members WHERE user_id = $2)
       ORDER BY m.created_at DESC
       LIMIT 100`,
      [enterpriseId, userId]
    )

    // 按频道分组
    const byChannel: Record<string, any[]> = {}
    for (const msg of messages.rows) {
      if (!byChannel[msg.channel]) {
        byChannel[msg.channel] = []
      }
      byChannel[msg.channel].push({
        sender: msg.sender_name,
        avatar: msg.sender_avatar,
        content: msg.content,
        createdAt: msg.created_at
      })
    }

    // 生成摘要
    let summary = {
      totalMessages: messages.rows.length,
      byChannel,
      importantMessages: [] as any[],
      keyPoints: [] as string[],
      actionItems: [] as string[]
    }

    // 获取AI模型
    const aiModel = await getEnterpriseAIModel(enterpriseId)

    if (aiModel && messages.rows.length > 0) {
      try {
        // 构建消息上下文
        const messageTexts = messages.rows.map(m => 
          `[${m.sender_name}] ${m.content}`
        ).join('\n')

        const systemPrompt = `你是一个消息摘要助手。请分析以下今日消息，生成摘要：
1. 识别出最重要的消息
2. 提取关键要点（最多5条）
3. 识别出需要采取行动的事项

请用JSON格式回复：
{
  "importantMessages": [{"sender": "姓名", "content": "内容", "reason": "为什么重要"}],
  "keyPoints": ["要点1", "要点2"],
  "actionItems": ["待办1", "待办2"]
}`

        const response = await callLLM(aiModel, systemPrompt, `今日消息：\n${messageTexts.slice(0, 4000)}`)

        // 尝试解析JSON
        try {
          const parsed = JSON.parse(response)
          summary = { ...summary, ...parsed }
        } catch {
          // 如果解析失败，使用原始内容
          summary.keyPoints = [`今日共有 ${messages.rows.length} 条消息`]
        }
      } catch (err) {
        fastify.log.error('Summary generation failed:', err)
      }
    }

    // 保存摘要记录
    const summaryId = uuidv4()
    await fastify.db.query(
      `INSERT INTO message_summaries (id, user_id, enterprise_id, summary_date, summary_data, created_at)
       VALUES ($1, $2, $3, CURRENT_DATE, $4, NOW())
       ON CONFLICT (user_id, enterprise_id, summary_date) 
       DO UPDATE SET summary_data = $4, updated_at = NOW()`,
      [summaryId, userId, enterpriseId, JSON.stringify(summary)]
    )

    return {
      success: true,
      data: summary
    }
  })

  // 获取本周消息摘要
  fastify.post('/:enterpriseId/summary/weekly', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['消息摘要'],
      summary: '生成本周消息摘要'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any

    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0) {
      return reply.status(403).send({ error: '无权访问' })
    }

    // 获取本周消息
    const messages = await fastify.db.query(
      `SELECT m.*, u.name as sender_name, DATE(m.created_at) as msg_date
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.enterprise_id = $1 
         AND m.created_at >= CURRENT_DATE - INTERVAL '7 days'
         AND m.channel IN (SELECT channel FROM channel_members WHERE user_id = $2)
       ORDER BY m.created_at DESC`,
      [enterpriseId, userId]
    )

    // 按日期分组统计
    const dailyStats: Record<string, { count: number, topSenders: string[] }> = {}

    for (const msg of messages.rows) {
      const date = msg.msg_date.toISOString().split('T')[0]
      if (!dailyStats[date]) {
        dailyStats[date] = { count: 0, topSenders: [] }
      }
      dailyStats[date].count++
      if (!dailyStats[date].topSenders.includes(msg.sender_name) && dailyStats[date].topSenders.length < 3) {
        dailyStats[date].topSenders.push(msg.sender_name)
      }
    }

    // 获取本周参与最多的人
    const topParticipants = await fastify.db.query(
      `SELECT u.name, COUNT(*) as msg_count
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.enterprise_id = $1 AND m.created_at >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY u.id, u.name
       ORDER BY msg_count DESC
       LIMIT 5`,
      [enterpriseId]
    )

    return {
      success: true,
      data: {
        totalMessages: messages.rows.length,
        dailyStats,
        topParticipants: topParticipants.rows,
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
      }
    }
  })

  // 获取历史摘要
  fastify.get('/:enterpriseId/summary/history', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['消息摘要'],
      summary: '获取历史摘要'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any
    const { type = 'daily', limit = 30 } = request.query as any

    const result = await fastify.db.query(
      `SELECT id, summary_date, summary_data, created_at
       FROM message_summaries
       WHERE user_id = $1 AND enterprise_id = $2
       ORDER BY summary_date DESC
       LIMIT $3`,
      [userId, enterpriseId, limit]
    )

    return {
      success: true,
      data: result.rows.map(r => ({
        id: r.id,
        date: r.summary_date,
        summary: typeof r.summary_data === 'string' ? JSON.parse(r.summary_data) : r.summary_data,
        createdAt: r.created_at
      }))
    }
  })

  // ========================================
  # 团队动态
  # ========================================

  // 获取团队动态
  fastify.get('/:enterpriseId/team/activity', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['团队动态'],
      summary: '获取团队动态'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any
    const { limit = 50, offset = 0 } = request.query as any

    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0) {
      return { success: false, error: '无权访问' }
    }

    // 获取所有团队成员的活动
    const activities = await fastify.db.query(
      `SELECT al.*, u.name as user_name, u.avatar as user_avatar
       FROM activity_logs al
       JOIN users u ON u.id = al.user_id
       WHERE al.enterprise_id = $1 AND al.created_at >= NOW() - INTERVAL '30 days'
       ORDER BY al.created_at DESC
       LIMIT $2 OFFSET $3`,
      [enterpriseId, limit, offset]
    )

    // 获取活跃度统计
    const stats = await fastify.db.query(
      `SELECT DATE(al.created_at) as date, COUNT(DISTINCT al.user_id) as active_users, COUNT(*) as total_activities
       FROM activity_logs al
       WHERE al.enterprise_id = $1 AND al.created_at >= NOW() - INTERVAL '7 days'
       GROUP BY DATE(al.created_at)
       ORDER BY date`,
      [enterpriseId]
    )

    return {
      success: true,
      data: {
        activities: activities.rows,
        weeklyStats: stats.rows
      }
    }
  })

  // 记录活动
  fastify.post('/:enterpriseId/team/activity', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['团队动态'],
      summary: '记录团队活动'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any
    const { type, content, metadata } = request.body as any

    const activityId = uuidv4()
    await fastify.db.query(
      `INSERT INTO activity_logs (id, user_id, enterprise_id, type, content, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [activityId, userId, enterpriseId, type, content, JSON.stringify(metadata || {})]
    )

    return { success: true, data: { id: activityId } }
  })

  // ========================================
  # 数据导出
  # ========================================

  // 导出个人数据
  fastify.get('/:enterpriseId/export/my-data', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['数据导出'],
      summary: '导出个人数据',
      querystring: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['all', 'messages', 'documents', 'tasks', 'calendar'] }
        }
      }
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any
    const { type = 'all' } = request.query as any

    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0) {
      return reply.status(403).send({ error: '无权访问' })
    }

    const exportData: any = {
      exportedAt: new Date().toISOString(),
      enterpriseId,
      userId
    }

    // 导出消息
    if (type === 'all' || type === 'messages') {
      const messages = await fastify.db.query(
        `SELECT m.*, c.name as channel_name
         FROM messages m
         LEFT JOIN channels c ON c.id = m.channel
         WHERE m.enterprise_id = $1 AND m.sender_id = $2
         ORDER BY m.created_at DESC`,
        [enterpriseId, userId]
      )
      exportData.messages = messages.rows
    }

    // 导出文档
    if (type === 'all' || type === 'documents') {
      const documents = await fastify.db.query(
        `SELECT * FROM documents 
         WHERE enterprise_id = $1 AND created_by = $2
         ORDER BY created_at DESC`,
        [enterpriseId, userId]
      )
      exportData.documents = documents.rows
    }

    // 导出任务
    if (type === 'all' || type === 'tasks') {
      const tasks = await fastify.db.query(
        `SELECT * FROM tasks 
         WHERE enterprise_id = $1 AND (created_by = $2 OR assignee_id = $2)
         ORDER BY created_at DESC`,
        [enterpriseId, userId]
      )
      exportData.tasks = tasks.rows
    }

    // 导出日程
    if (type === 'all' || type === 'calendar') {
      const events = await fastify.db.query(
        `SELECT * FROM calendar_events 
         WHERE enterprise_id = $1 AND (created_by = $2 OR $2 = ANY(participant_ids))
         ORDER BY start_time DESC`,
        [enterpriseId, userId]
      )
      exportData.calendarEvents = events.rows
    }

    return {
      success: true,
      data: exportData
    }
  })

  // ========================================
  # AI简历优化
  # ========================================

  // AI简历优化
  fastify.post('/me/resume/optimize', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['简历优化'],
      summary: 'AI简历优化',
      body: {
        type: 'object',
        required: ['resume', 'targetPosition'],
        properties: {
          resume: { type: 'string' },
          targetPosition: { type: 'string' },
          optimizeType: { type: 'string', enum: ['full', 'summary', 'skills', 'achievements'] }
        }
      }
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { resume, targetPosition, optimizeType = 'full' } = request.body as any

    // 获取用户的AI模型（个人Claw）
    const personalAi = await getPersonalAIModel(userId)

    if (!personalAi) {
      return reply.status(400).send({ 
        success: false, 
        error: '请先配置个人AI模型' 
      })
    }

    try {
      let systemPrompt = ''
      let userPrompt = ''

      switch (optimizeType) {
        case 'summary':
          systemPrompt = `你是一个专业的简历优化师。请根据目标职位优化简历的个人简介部分。
要求：
1. 简洁有力，3-5句话
2. 突出与目标职位最相关的经验和技能
3. 使用动词开头，展现主动性
4. 量化成果（如果有）`
          userPrompt = `目标职位: ${targetPosition}\n\n我的简历:\n${resume}\n\n请优化个人简介部分：`
          break

        case 'skills':
          systemPrompt = `你是一个专业的简历优化师。请根据目标职位优化简历的技能部分。
要求：
1. 列出与目标职位最相关的技能
2. 技能要具体，不要太泛泛
3. 可以添加职位要求的技能（即使你目前不完全掌握）
4. 按相关性排序`
          userPrompt = `目标职位: ${targetPosition}\n\n我的简历:\n${resume}\n\n请优化技能部分：`
          break

        case 'achievements':
          systemPrompt = `你是一个专业的简历优化师。请根据目标职位优化简历的工作成就部分。
要求：
1. 使用STAR法则（Situation, Task, Action, Result）
2. 量化成果（百分比、具体数字）
3. 突出与目标职位最相关的成就
4. 展现你的独特价值`
          userPrompt = `目标职位: ${targetPosition}\n\n我的简历:\n${resume}\n\n请优化工作成就部分：`
          break

        default: // full
          systemPrompt = `你是一个专业的简历优化师。请全面优化我的简历，使其更适合目标职位。
要求：
1. 保持简历的真实性
2. 突出与目标职位最相关的经验和技能
3. 使用行业关键词
4. 量化成果
5. 语言简洁专业
6. 返回优化后的完整简历`
          userPrompt = `目标职位: ${targetPosition}\n\n我的简历:\n${resume}\n\n请优化整个简历：`
      }

      const optimizedResume = await callLLM(personalAi, systemPrompt, userPrompt)

      // 保存优化记录
      await fastify.db.query(
        `INSERT INTO resume_optimizations (id, user_id, target_position, original_resume, optimized_resume, optimize_type, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [uuidv4(), userId, targetPosition, resume, optimizedResume, optimizeType]
      )

      return {
        success: true,
        data: {
          optimizedResume,
          targetPosition
        }
      }
    } catch (err) {
      fastify.log.error('Resume optimization failed:', err)
      return reply.status(500).send({ error: '简历优化失败' })
    }
  })

  // 获取简历优化历史
  fastify.get('/me/resume/history', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['简历优化'],
      summary: '获取简历优化历史'
    }
  }, async (request) => {
    const userId = (request.user as any).userId

    const result = await fastify.db.query(
      `SELECT id, target_position, optimize_type, created_at
       FROM resume_optimizations
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [userId]
    )

    return {
      success: true,
      data: result.rows
    }
  })

  // ========================================
  # 辅助函数
  # ========================================

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
      temperature: model.temperature
    }
  }

  async function getPersonalAIModel(userId: string) {
    // 从用户配置或个人Claw获取AI配置
    const config = await fastify.db.query(
      `SELECT ai_config FROM personal_claws WHERE user_id = $1`,
      [userId]
    )

    if (config.rows.length === 0) return null

    const aiConfig = typeof config.rows[0].ai_config === 'string'
      ? JSON.parse(config.rows[0].ai_config)
      : config.rows[0].ai_config

    if (!aiConfig || !aiConfig.apiKey) return null

    return {
      provider: aiConfig.provider || 'openai',
      modelId: aiConfig.modelId || 'gpt-4',
      apiKey: aiConfig.apiKey,
      apiEndpoint: aiConfig.endpoint,
      maxTokens: aiConfig.maxTokens || 2000,
      temperature: aiConfig.temperature || 0.7
    }
  }

  async function callLLM(aiModel: any, systemPrompt: string, userMessage: string): Promise<string> {
    let endpoint = aiModel.apiEndpoint
    let body: any = {
      model: aiModel.modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      max_tokens: aiModel.maxTokens || 2000,
      temperature: aiModel.temperature || 0.7
    }

    if (aiModel.provider === 'openai' || !aiModel.provider) {
      endpoint = endpoint || 'https://api.openai.com/v1/chat/completions'
    } else if (aiModel.provider === 'deepseek') {
      endpoint = endpoint || 'https://api.deepseek.com/chat/completions'
    } else if (aiModel.provider === 'anthropic') {
      endpoint = endpoint || 'https://api.anthropic.com/v1/messages'
      body = {
        model: aiModel.modelId,
        max_tokens: aiModel.maxTokens || 1024,
        messages: [{ role: 'user', content: `System: ${systemPrompt}\n\nUser: ${userMessage}` }]
      }
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
}

export default messagesSummaryRoutes
