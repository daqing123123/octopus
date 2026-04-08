import { FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

const clawAgentRoutes: FastifyPluginAsync = async (fastify) => {

  // ========================================
  // Agent克隆（工作分身）
  // ========================================

  // 获取Agent克隆列表
  fastify.get('/agent-clones', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Agent克隆'],
      summary: '获取Agent克隆列表'
    }
  }, async (request) => {
    const userId = (request.user as any).userId

    const clones = await fastify.db.query(
      `SELECT id, clone_name, clone_description, learned_from, training_data_sources,
              clone_config, autonomy_level, max_actions_per_day, is_active,
              total_runs, success_rate, last_run_at, created_at
       FROM agent_clones
       WHERE user_id = $1
       ORDER BY is_active DESC, created_at DESC`,
      [userId]
    )

    return {
      success: true,
      data: {
        clones: clones.rows.map((c: any) => ({
          id: c.id,
          name: c.clone_name,
          description: c.clone_description,
          learnedFrom: c.learned_from,
          trainingSources: c.training_data_sources,
          config: c.clone_config,
          autonomyLevel: c.autonomy_level,
          maxActionsPerDay: c.max_actions_per_day,
          isActive: c.is_active,
          totalRuns: c.total_runs,
          successRate: c.success_rate,
          lastRunAt: c.last_run_at,
          createdAt: c.created_at
        })),
        totalClones: clones.rows.length,
        activeClones: clones.rows.filter((c: any) => c.is_active).length
      }
    }
  })

  // 创建Agent克隆
  fastify.post('/agent-clones', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Agent克隆'],
      summary: '创建Agent克隆',
      body: {
        type: 'object',
        required: ['cloneName'],
        properties: {
          cloneName: { type: 'string', maxLength: 100 },
          cloneDescription: { type: 'string' },
          learnedFrom: { type: 'string', enum: ['personal', 'enterprise', 'hybrid'], default: 'personal' },
          trainingSources: { type: 'array', items: { type: 'string' } },
          cloneConfig: { type: 'object' },
          autonomyLevel: { type: 'integer', minimum: 1, maximum: 5, default: 3 },
          maxActionsPerDay: { type: 'integer', minimum: 10, maximum: 500, default: 50 }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { cloneName, cloneDescription, learnedFrom = 'personal', trainingSources = [], cloneConfig = {}, autonomyLevel = 3, maxActionsPerDay = 50 } = request.body as any

    const cloneId = uuidv4()
    await fastify.db.query(
      `INSERT INTO agent_clones 
       (id, user_id, clone_name, clone_description, learned_from, training_data_sources, clone_config, autonomy_level, max_actions_per_day)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [cloneId, userId, cloneName, cloneDescription || '', learnedFrom, JSON.stringify(trainingSources), JSON.stringify(cloneConfig), autonomyLevel, maxActionsPerDay]
    )

    return { success: true, data: { id: cloneId, name: cloneName }, message: 'Agent克隆已创建' }
  })

  // 激活/停用Agent克隆
  fastify.post('/agent-clones/:cloneId/toggle', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Agent克隆'],
      summary: '激活/停用Agent克隆'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { cloneId } = request.params as any

    const result = await fastify.db.query(
      `UPDATE agent_clones SET is_active = NOT is_active WHERE id = $1 AND user_id = $2 RETURNING is_active, clone_name`,
      [cloneId, userId]
    )

    if (result.rows.length === 0) {
      return { success: false, error: 'Agent克隆不存在' }
    }

    const action = result.rows[0].is_active ? '已激活' : '已停用'
    return { success: true, data: { isActive: result.rows[0].is_active }, message: `${result.rows[0].clone_name} ${action}` }
  })

  // 更新Agent克隆配置
  fastify.patch('/agent-clones/:cloneId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Agent克隆'],
      summary: '更新Agent克隆'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { cloneId } = request.params as any
    const updates = request.body as any

    const fields: string[] = []
    const values: any[] = []
    let i = 1

    if (updates.cloneName !== undefined) { fields.push(`clone_name = $${i++}`); values.push(updates.cloneName) }
    if (updates.cloneDescription !== undefined) { fields.push(`clone_description = $${i++}`); values.push(updates.cloneDescription) }
    if (updates.cloneConfig !== undefined) { fields.push(`clone_config = $${i++}`); values.push(JSON.stringify(updates.cloneConfig)) }
    if (updates.autonomyLevel !== undefined) { fields.push(`autonomy_level = $${i++}`); values.push(updates.autonomyLevel) }
    if (updates.maxActionsPerDay !== undefined) { fields.push(`max_actions_per_day = $${i++}`); values.push(updates.maxActionsPerDay) }

    if (fields.length === 0) return { success: false, error: '没有更新字段' }

    fields.push('updated_at = NOW()')
    values.push(cloneId, userId)

    await fastify.db.query(
      `UPDATE agent_clones SET ${fields.join(', ')} WHERE id = $${i++} AND user_id = $${i}`,
      values
    )

    return { success: true, message: 'Agent克隆已更新' }
  })

  // 删除Agent克隆
  fastify.delete('/agent-clones/:cloneId', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['Agent克隆'], summary: '删除Agent克隆' }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { cloneId } = request.params as any

    await fastify.db.query(
      `DELETE FROM agent_clones WHERE id = $1 AND user_id = $2`,
      [cloneId, userId]
    )

    return { success: true, message: 'Agent克隆已删除' }
  })

  // 获取Agent行为日志
  fastify.get('/agent-clones/:cloneId/actions', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Agent克隆'],
      summary: '获取Agent行为日志',
      querystring: { type: 'object', properties: { limit: { type: 'integer', default: 50 } } }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { cloneId } = request.params as any
    const { limit = 50 } = request.query as any

    const logs = await fastify.db.query(
      `SELECT aal.id, aal.action_type, aal.action_data, aal.status, aal.review_feedback,
              aal.executed_at, aal.reviewed_at, ac.clone_name
       FROM agent_action_logs aal
       JOIN agent_clones ac ON ac.id = aal.clone_id
       WHERE aal.clone_id = $1 AND aal.user_id = $2
       ORDER BY aal.executed_at DESC
       LIMIT $3`,
      [cloneId, userId, limit]
    )

    // 统计
    const stats = await fastify.db.query(
      `SELECT 
         COUNT(*) FILTER (WHERE status = 'success') as success_count,
         COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
         COUNT(*) FILTER (WHERE review_feedback = 'pending') as pending_review
       FROM agent_action_logs WHERE clone_id = $1`,
      [cloneId]
    )

    return {
      success: true,
      data: {
        logs: logs.rows.map((l: any) => ({
          id: l.id,
          actionType: l.action_type,
          actionData: l.action_data,
          status: l.status,
          reviewFeedback: l.review_feedback,
          executedAt: l.executed_at,
          reviewedAt: l.reviewed_at
        })),
        stats: {
          success: parseInt(stats.rows[0].success_count),
          failed: parseInt(stats.rows[0].failed_count),
          pendingReview: parseInt(stats.rows[0].pending_review)
        }
      }
    }
  })

  // 审核Agent行为
  fastify.post('/agent-clones/:cloneId/actions/:actionId/review', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Agent克隆'],
      summary: '审核Agent行为',
      body: {
        type: 'object',
        required: ['feedback'],
        properties: {
          feedback: { type: 'string', enum: ['approved', 'rejected'] }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { cloneId, actionId } = request.params as any
    const { feedback } = request.body as any

    await fastify.db.query(
      `UPDATE agent_action_logs SET review_feedback = $1, reviewed_at = NOW()
       WHERE id = $2 AND clone_id = $3 AND user_id = $4`,
      [feedback, actionId, cloneId, userId]
    )

    // 更新成功率
    await fastify.db.query(
      `UPDATE agent_clones SET
         success_rate = (
           SELECT COUNT(*) FILTER (WHERE status = 'success' OR review_feedback = 'approved')::FLOAT /
                  NULLIF(COUNT(*), 0)
           FROM agent_action_logs WHERE clone_id = $1
         )
       WHERE id = $1`,
      [cloneId]
    )

    return { success: true, message: `行为已标记为${feedback === 'approved' ? '已批准' : '已拒绝'}` }
  })

  // ========================================
  // Agent模板商店
  // ========================================

  // 获取Agent模板列表
  fastify.get('/agent-templates', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Agent商店'],
      summary: '获取Agent模板商店',
      querystring: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          search: { type: 'string' },
          sort: { type: 'string', enum: ['rating', 'usage', 'newest'], default: 'rating' }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { category, search, sort = 'rating' } = request.query as any

    let conditions = ['(is_public = TRUE OR creator_id = $1)']
    const params: any[] = [userId]
    let pIdx = 2

    if (category) {
      conditions.push(`template_category = $${pIdx++}`)
      params.push(category)
    }
    if (search) {
      conditions.push(`(template_name ILIKE $${pIdx++} OR template_description ILIKE $${pIdx++})`)
      params.push(`%${search}%`, `%${search}%`)
    }

    let orderBy = 'rating DESC, usage_count DESC'
    if (sort === 'usage') orderBy = 'usage_count DESC'
    if (sort === 'newest') orderBy = 'created_at DESC'

    params.push(100)
    const templates = await fastify.db.query(
      `SELECT id, creator_id, creator_type, template_name, template_description,
              template_category, usage_count, rating, tags, is_public, created_at
       FROM agent_templates
       WHERE ${conditions.join(' AND ')}
       ORDER BY ${orderBy}
       LIMIT $${pIdx}`,
      params
    )

    // 统计
    const categories = await fastify.db.query(
      `SELECT template_category, COUNT(*) as count FROM agent_templates
       WHERE is_public = TRUE GROUP BY template_category`
    )

    return {
      success: true,
      data: {
        templates: templates.rows.map((t: any) => ({
          id: t.id,
          creatorId: t.creator_id,
          creatorType: t.creator_type,
          name: t.template_name,
          description: t.template_description,
          category: t.template_category,
          usageCount: t.usage_count,
          rating: t.rating,
          tags: t.tags,
          isPublic: t.is_public,
          isOwn: t.creator_id === userId,
          createdAt: t.created_at
        })),
        categories: categories.rows.map((c: any) => ({
          name: c.template_category,
          count: parseInt(c.count)
        }))
      }
    }
  })

  // 创建Agent模板
  fastify.post('/agent-templates', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Agent商店'],
      summary: '创建Agent模板',
      body: {
        type: 'object',
        required: ['templateName', 'templateConfig'],
        properties: {
          templateName: { type: 'string', maxLength: 100 },
          templateDescription: { type: 'string' },
          templateCategory: { type: 'string', enum: ['productivity', 'communication', 'analysis', 'creative', 'technical', 'management'] },
          templateConfig: { type: 'object' },
          isPublic: { type: 'boolean', default: false },
          tags: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { templateName, templateDescription, templateCategory, templateConfig, isPublic = false, tags = [] } = request.body as any

    const templateId = uuidv4()
    await fastify.db.query(
      `INSERT INTO agent_templates 
       (id, creator_id, template_name, template_description, template_category, template_config, is_public, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [templateId, userId, templateName, templateDescription || '', templateCategory || 'productivity',
       JSON.stringify(templateConfig), isPublic, JSON.stringify(tags)]
    )

    return { success: true, data: { id: templateId }, message: '模板已创建' }
  })

  // 使用模板创建Agent克隆
  fastify.post('/agent-templates/:templateId/use', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Agent商店'],
      summary: '使用模板创建Agent克隆'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { templateId } = request.params as any

    const template = await fastify.db.query(
      `SELECT * FROM agent_templates WHERE id = $1 AND (is_public = TRUE OR creator_id = $2)`,
      [templateId, userId]
    )

    if (template.rows.length === 0) {
      return { success: false, error: '模板不存在或无权访问' }
    }

    const t = template.rows[0]
    const cloneId = uuidv4()

    await fastify.db.query(
      `INSERT INTO agent_clones 
       (id, user_id, clone_name, clone_description, learned_from, clone_config)
       VALUES ($1, $2, $3, $4, 'personal', $5)`,
      [cloneId, userId, `${t.template_name} (基于模板)`, t.template_description || '', t.template_config]
    )

    // 增加使用次数
    await fastify.db.query(
      `UPDATE agent_templates SET usage_count = usage_count + 1 WHERE id = $1`,
      [templateId]
    )

    return { success: true, data: { cloneId }, message: '已基于模板创建Agent克隆' }
  })

  // 更新Agent模板
  fastify.patch('/agent-templates/:templateId', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['Agent商店'], summary: '更新Agent模板' }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { templateId } = request.params as any
    const updates = request.body as any

    const fields: string[] = []
    const values: any[] = []
    let i = 1

    if (updates.templateName !== undefined) { fields.push(`template_name = $${i++}`); values.push(updates.templateName) }
    if (updates.templateDescription !== undefined) { fields.push(`template_description = $${i++}`); values.push(updates.templateDescription) }
    if (updates.isPublic !== undefined) { fields.push(`is_public = $${i++}`); values.push(updates.isPublic) }
    if (updates.tags !== undefined) { fields.push(`tags = $${i++}`); values.push(JSON.stringify(updates.tags)) }

    if (fields.length === 0) return { success: false, error: '没有更新字段' }

    fields.push('updated_at = NOW()')
    values.push(templateId, userId)

    const result = await fastify.db.query(
      `UPDATE agent_templates SET ${fields.join(', ')} 
       WHERE id = $${i++} AND creator_id = $${i}
       RETURNING id`,
      values
    )

    if (result.rows.length === 0) {
      return { success: false, error: '模板不存在或无权修改' }
    }

    return { success: true, message: '模板已更新' }
  })

  // 删除Agent模板
  fastify.delete('/agent-templates/:templateId', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['Agent商店'], summary: '删除Agent模板' }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { templateId } = request.params as any

    const result = await fastify.db.query(
      `DELETE FROM agent_templates WHERE id = $1 AND creator_id = $2 RETURNING id`,
      [templateId, userId]
    )

    if (result.rows.length === 0) {
      return { success: false, error: '模板不存在或无权删除' }
    }

    return { success: true, message: '模板已删除' }
  })

  // ========================================
  // Agent学习反馈
  // ========================================

  // 提交学习反馈
  fastify.post('/agent-feedback', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Agent学习'],
      summary: '提交Agent学习反馈（点赞/踩）',
      body: {
        type: 'object',
        required: ['feedbackType', 'targetType', 'targetId'],
        properties: {
          feedbackType: { type: 'string', enum: ['like', 'dislike', 'helpful', 'not_helpful'] },
          targetType: { type: 'string', enum: ['suggestion', 'reminder', 'summary', 'agent_action'] },
          targetId: { type: 'string' },
          comment: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { feedbackType, targetType, targetId, comment } = request.body as any

    // 记录反馈
    await fastify.db.query(
      `INSERT INTO agent_action_logs 
       (id, user_id, action_type, action_data, status, review_feedback)
       VALUES (uuid_generate_v4(), $1, 'feedback', $2, 'success', $3)`,
      [userId, JSON.stringify({ type: feedbackType, targetType, targetId, comment }), feedbackType === 'helpful' || feedbackType === 'like' ? 'approved' : 'rejected']
    )

    // 根据反馈类型调整Claw配置
    if (targetType === 'suggestion') {
      // 调整建议优先级
      const adjustment = feedbackType === 'like' || feedbackType === 'helpful' ? 0.1 : -0.1
      await fastify.db.query(
        `UPDATE claw_suggestions SET priority = GREATEST(0, LEAST(10, priority + $1))
         WHERE id = $2 AND user_id = $3`,
        [adjustment, targetId, userId]
      )
    }

    return { success: true, message: '感谢您的反馈' }
  })
}

export default clawAgentRoutes
