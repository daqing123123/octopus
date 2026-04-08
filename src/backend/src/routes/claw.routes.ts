import { FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

const clawRoutes: FastifyPluginAsync = async (fastify) => {

  // ========================================
  // 个人 Claw 概览
  // ========================================

  // 获取个人Claw详情
  fastify.get('/personal/me', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['个人Claw'],
      summary: '获取个人Claw详情'
    }
  }, async (request) => {
    const userId = (request.user as any).userId

    // 获取或创建个人Claw
    let claw = await fastify.db.query(
      `SELECT pc.*, u.name as user_name, u.email as user_email
       FROM personal_claws pc
       JOIN users u ON u.id = pc.user_id
       WHERE pc.user_id = $1`,
      [userId]
    )

    if (claw.rows.length === 0) {
      // 自动创建个人Claw
      const clawId = uuidv4()
      await fastify.db.query(
        `INSERT INTO personal_claws (id, user_id, name)
         VALUES ($1, $2, $3)`,
        [clawId, userId, `${userId.slice(0, 8)}'s Claw`]
      )

      claw = await fastify.db.query(
        `SELECT pc.*, u.name as user_name, u.email as user_email
         FROM personal_claws pc
         JOIN users u ON u.id = pc.user_id
         WHERE pc.id = $1`,
        [clawId]
      )
    }

    const clawData = claw.rows[0]

    // 获取连接的企业数量
    const connectedEnterprises = await fastify.db.query(
      `SELECT COUNT(*) as count FROM user_enterprise_connections 
       WHERE user_id = $1 AND status = 'active'`,
      [userId]
    )

    // 获取活跃的Agent数量
    const activeAgents = await fastify.db.query(
      `SELECT COUNT(*) as count FROM personal_agents 
       WHERE user_id = $1 AND is_active = true`,
      [userId]
    )

    // 获取习惯数量
    const habitCount = await fastify.db.query(
      `SELECT COUNT(*) as count, SUM(frequency) as total_actions
       FROM user_habits WHERE user_id = $1`,
      [userId]
    )

    // 计算存储使用百分比
    const storageUsed = parseInt(clawData.storage_used) || 0
    const storageQuota = parseInt(clawData.storage_quota) || 5368709120
    const storagePercent = Math.round((storageUsed / storageQuota) * 100)

    return {
      success: true,
      data: {
        id: clawData.id,
        name: clawData.name,
        userName: clawData.user_name,
        userEmail: clawData.user_email,
        config: clawData.config,
        storage: {
          used: storageUsed,
          quota: storageQuota,
          percent: storagePercent,
          usedFormatted: formatBytes(storageUsed),
          quotaFormatted: formatBytes(storageQuota)
        },
        stats: {
          connectedEnterprises: parseInt(connectedEnterprises.rows[0].count),
          activeAgents: parseInt(activeAgents.rows[0].count),
          habits: parseInt(habitCount.rows[0].count),
          totalActions: parseInt(habitCount.rows[0].total_actions) || 0
        },
        createdAt: clawData.created_at,
        updatedAt: clawData.updated_at
      }
    }
  })

  // 更新个人Claw配置
  fastify.patch('/personal/me', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['个人Claw'],
      summary: '更新个人Claw配置',
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          config: { type: 'object' }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { name, config } = request.body as any

    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`)
      values.push(name)
    }
    if (config !== undefined) {
      updates.push(`config = $${paramIndex++}`)
      values.push(JSON.stringify(config))
    }

    if (updates.length === 0) {
      return { success: false, error: '没有需要更新的字段' }
    }

    values.push(userId)
    await fastify.db.query(
      `UPDATE personal_claws SET ${updates.join(', ')}
       WHERE user_id = $${paramIndex}`,
      values
    )

    return { success: true, message: 'Claw配置已更新' }
  })

  // ========================================
  // 个人记忆管理
  // ========================================

  // 获取记忆列表
  fastify.get('/personal/memories', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['个人Claw'],
      summary: '获取个人记忆列表',
      querystring: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['short_term', 'long_term', 'all'] },
          limit: { type: 'integer', default: 50 },
          offset: { type: 'integer', default: 0 }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { type = 'all', limit = 50, offset = 0 } = request.query as any

    let typeFilter = ''
    if (type !== 'all') {
      typeFilter = `AND memory_type = '${type}'`
    }

    const result = await fastify.db.query(
      `SELECT id, memory_type, LEFT(content, 200) as content_preview, 
              importance, access_count, created_at, accessed_at
       FROM user_memories 
       WHERE user_id = $1 ${typeFilter}
       ORDER BY importance DESC, accessed_at DESC NULLS LAST
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    )

    const total = await fastify.db.query(
      `SELECT COUNT(*) FROM user_memories WHERE user_id = $1 ${typeFilter}`,
      [userId]
    )

    return {
      success: true,
      data: {
        memories: result.rows,
        total: parseInt(total.rows[0].count),
        limit,
        offset
      }
    }
  })

  // 添加记忆
  fastify.post('/personal/memories', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['个人Claw'],
      summary: '添加个人记忆',
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string' },
          memoryType: { type: 'string', enum: ['short_term', 'long_term'], default: 'short_term' },
          importance: { type: 'number', minimum: 0, maximum: 1, default: 0.5 }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { content, memoryType = 'short_term', importance = 0.5 } = request.body as any

    const memoryId = uuidv4()
    await fastify.db.query(
      `INSERT INTO user_memories (id, user_id, content, memory_type, importance)
       VALUES ($1, $2, $3, $4, $5)`,
      [memoryId, userId, content, memoryType, importance]
    )

    return {
      success: true,
      data: { memoryId }
    }
  })

  // 访问记忆（更新访问时间）
  fastify.get('/personal/memories/:memoryId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['个人Claw'],
      summary: '获取记忆详情（同时更新访问记录）'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { memoryId } = request.params as any

    const memory = await fastify.db.query(
      `UPDATE user_memories 
       SET accessed_at = NOW(), access_count = access_count + 1
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [memoryId, userId]
    )

    if (memory.rows.length === 0) {
      return reply.status(404).send({ error: '记忆不存在' })
    }

    return {
      success: true,
      data: memory.rows[0]
    }
  })

  // 删除记忆
  fastify.delete('/personal/memories/:memoryId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['个人Claw'],
      summary: '删除记忆'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { memoryId } = request.params as any

    const result = await fastify.db.query(
      `DELETE FROM user_memories WHERE id = $1 AND user_id = $2 RETURNING id`,
      [memoryId, userId]
    )

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: '记忆不存在' })
    }

    return { success: true, message: '记忆已删除' }
  })

  // ========================================
  // 个人Agent管理
  // ========================================

  // 获取Agent列表
  fastify.get('/personal/agents', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['个人Claw'],
      summary: '获取个人Agent列表'
    }
  }, async (request) => {
    const userId = (request.user as any).userId

    const result = await fastify.db.query(
      `SELECT id, name, description, model_provider, model_id, is_active, created_at
       FROM personal_agents 
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    )

    return {
      success: true,
      data: result.rows
    }
  })

  // 创建Agent
  fastify.post('/personal/agents', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['个人Claw'],
      summary: '创建个人Agent',
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          config: { type: 'object' },
          modelProvider: { type: 'string' },
          modelId: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { name, description, config, modelProvider, modelId } = request.body as any

    const agentId = uuidv4()
    await fastify.db.query(
      `INSERT INTO personal_agents (id, user_id, name, description, config, model_provider, model_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [agentId, userId, name, description || '', JSON.stringify(config || {}), 
       modelProvider || 'openai', modelId || 'gpt-4']
    )

    return {
      success: true,
      data: { agentId, name }
    }
  })

  // 更新Agent
  fastify.patch('/personal/agents/:agentId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['个人Claw'],
      summary: '更新个人Agent'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { agentId } = request.params as any
    const updates = request.body as any

    // 检查权限
    const agent = await fastify.db.query(
      'SELECT id FROM personal_agents WHERE id = $1 AND user_id = $2',
      [agentId, userId]
    )

    if (agent.rows.length === 0) {
      return reply.status(404).send({ error: 'Agent不存在' })
    }

    const updateFields: string[] = []
    const values: any[] = []
    let i = 1

    if (updates.name !== undefined) {
      updateFields.push(`name = $${i++}`)
      values.push(updates.name)
    }
    if (updates.description !== undefined) {
      updateFields.push(`description = $${i++}`)
      values.push(updates.description)
    }
    if (updates.config !== undefined) {
      updateFields.push(`config = $${i++}`)
      values.push(JSON.stringify(updates.config))
    }
    if (updates.modelProvider !== undefined) {
      updateFields.push(`model_provider = $${i++}`)
      values.push(updates.modelProvider)
    }
    if (updates.modelId !== undefined) {
      updateFields.push(`model_id = $${i++}`)
      values.push(updates.modelId)
    }
    if (updates.isActive !== undefined) {
      updateFields.push(`is_active = $${i++}`)
      values.push(updates.isActive)
    }

    if (updateFields.length === 0) {
      return { success: false, error: '没有需要更新的字段' }
    }

    values.push(agentId)
    await fastify.db.query(
      `UPDATE personal_agents SET ${updateFields.join(', ')} WHERE id = $${i}`,
      values
    )

    return { success: true, message: 'Agent已更新' }
  })

  // 删除Agent
  fastify.delete('/personal/agents/:agentId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['个人Claw'],
      summary: '删除个人Agent'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { agentId } = request.params as any

    const result = await fastify.db.query(
      `DELETE FROM personal_agents WHERE id = $1 AND user_id = $2 RETURNING id`,
      [agentId, userId]
    )

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Agent不存在' })
    }

    return { success: true, message: 'Agent已删除' }
  })

  // ========================================
  // 习惯分析
  // ========================================

  // 获取习惯分析报告
  fastify.get('/personal/habits/analysis', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['个人Claw'],
      summary: '获取习惯分析报告'
    }
  }, async (request) => {
    const userId = (request.user as any).userId

    // 获取所有习惯
    const habits = await fastify.db.query(
      `SELECT habit_type, habit_data, frequency, last_occurred, created_at
       FROM user_habits WHERE user_id = $1 ORDER BY frequency DESC`,
      [userId]
    )

    // 按类别分组
    const categories: Record<string, { count: number, totalFreq: number }> = {}
    let totalActions = 0

    habits.rows.forEach(h => {
      const cat = h.habit_type.split('_')[0] || 'other'
      if (!categories[cat]) categories[cat] = { count: 0, totalFreq: 0 }
      categories[cat].count++
      categories[cat].totalFreq += h.frequency
      totalActions += h.frequency
    })

    // 获取最近活动趋势（最近7天）
    const recentActivity = await fastify.db.query(
      `SELECT DATE(last_occurred) as date, SUM(frequency) as actions
       FROM user_habits
       WHERE user_id = $1 AND last_occurred >= NOW() - INTERVAL '7 days'
       GROUP BY DATE(last_occurred)
       ORDER BY date`,
      [userId]
    )

    // 获取最常用功能
    const topHabits = habits.rows.slice(0, 10)

    // 习惯类型分布
    const categoryDistribution = Object.entries(categories).map(([cat, data]) => ({
      category: cat,
      count: data.count,
      frequency: data.totalFreq,
      percent: Math.round((data.totalFreq / totalActions) * 100) || 0
    })).sort((a, b) => b.frequency - a.frequency)

    // 生成建议
    const suggestions: string[] = []
    if (habits.rows.length < 10) {
      suggestions.push('您的习惯记录较少，建议多使用平台功能，Claw会越来越懂您')
    }
    if (categoryDistribution.length < 3) {
      suggestions.push('建议尝试不同的功能模块，获得更全面的个性化服务')
    }
    const lowFreqHabits = habits.rows.filter(h => h.frequency < 5)
    if (lowFreqHabits.length > 0) {
      suggestions.push(`您有${lowFreqHabits.length}个低频习惯，可能需要调整使用方式`)
    }

    return {
      success: true,
      data: {
        totalHabits: habits.rows.length,
        totalActions,
        categories: categoryDistribution,
        topHabits: topHabits.map(h => ({
          type: h.habit_type,
          frequency: h.frequency,
          lastUsed: h.last_occurred
        })),
        recentActivity: recentActivity.rows,
        suggestions
      }
    }
  })

  // 批量导入习惯（用于入职时从原企业同步）
  fastify.post('/personal/habits/import', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['个人Claw'],
      summary: '批量导入习惯（用于换工作等场景）',
      body: {
        type: 'object',
        properties: {
          habits: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                frequency: { type: 'integer' },
                lastOccurred: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { habits } = request.body as any

    if (!habits || habits.length === 0) {
      return { success: false, error: '没有需要导入的习惯' }
    }

    let imported = 0
    for (const habit of habits) {
      await fastify.db.query(
        `INSERT INTO user_habits (user_id, habit_type, frequency, last_occurred)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, habit_type) DO UPDATE SET
           frequency = user_habits.frequency + EXCLUDED.frequency,
           last_occurred = GREATEST(user_habits.last_occurred, EXCLUDED.last_occurred)`,
        [userId, habit.type, habit.frequency, habit.lastOccurred || new Date()]
      )
      imported++
    }

    return {
      success: true,
      message: `成功导入${imported}项习惯`,
      data: { importedCount: imported }
    }
  })

  // ========================================
  // 连接管理
  // ========================================

  // 获取我的所有连接
  fastify.get('/personal/connections', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['个人Claw'],
      summary: '获取我的所有企业连接'
    }
  }, async (request) => {
    const userId = (request.user as any).userId

    const result = await fastify.db.query(
      `SELECT c.id, c.enterprise_id, c.status, c.connected_at, c.disconnected_at,
              e.name as enterprise_name, e.logo_url, e.plan,
              em.role,
              (SELECT COUNT(*) FROM claw_habit_pool WHERE enterprise_claw_id = ec.id) as learned_habits
       FROM user_enterprise_connections c
       JOIN enterprises e ON c.enterprise_id = e.id
       LEFT JOIN enterprise_members em ON em.enterprise_id = e.id AND em.user_id = c.user_id
       LEFT JOIN enterprise_claws ec ON ec.enterprise_id = e.id
       WHERE c.user_id = $1
       ORDER BY c.connected_at DESC`,
      [userId]
    )

    // 分类
    const active = result.rows.filter(r => r.status === 'active')
    const inactive = result.rows.filter(r => r.status === 'inactive')

    return {
      success: true,
      data: {
        connections: result.rows,
        activeCount: active.length,
        inactiveCount: inactive.length
      }
    }
  })

  // 获取连接详情
  fastify.get('/personal/connections/:connectionId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['个人Claw'],
      summary: '获取连接详情'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { connectionId } = request.params as any

    const connection = await fastify.db.query(
      `SELECT c.*, e.name as enterprise_name, e.logo_url, e.plan,
              em.role, em.department, em.job_title,
              pc.name as personal_claw_name,
              ec.id as enterprise_claw_id
       FROM user_enterprise_connections c
       JOIN enterprises e ON c.enterprise_id = e.id
       LEFT JOIN enterprise_members em ON em.enterprise_id = e.id AND em.user_id = c.user_id
       LEFT JOIN personal_claws pc ON pc.id = c.personal_claw_id
       LEFT JOIN enterprise_claws ec ON ec.enterprise_id = e.id
       WHERE c.id = $1 AND c.user_id = $2`,
      [connectionId, userId]
    )

    if (connection.rows.length === 0) {
      return reply.status(404).send({ error: '连接不存在' })
    }

    // 获取同步记录
    const syncRecords = await fastify.db.query(
      `SELECT * FROM habit_sync_records
       WHERE user_id = $1 AND enterprise_id = $2
       ORDER BY synced_at DESC LIMIT 5`,
      [userId, connection.rows[0].enterprise_id]
    )

    return {
      success: true,
      data: {
        ...connection.rows[0],
        syncRecords: syncRecords.rows
      }
    }
  })
}

// 辅助函数
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export default clawRoutes
