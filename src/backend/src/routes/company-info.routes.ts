import { FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

// ============================================
// 企业公共信息路由 - 八爪鱼大脑侧
// 核心概念：企业 Claw（大脑）保存和下发公共信息
// 触手（员工）可以读取这些信息
// ============================================

const companyInfoRoutes: FastifyPluginAsync = async (fastify) => {
  
  // ========================================
  // 【大脑公共信息】获取公司公开信息
  // ========================================
  fastify.get('/enterprises/:enterpriseId/info', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['公司公共信息'],
      summary: '获取公司公开信息（触手可读）'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any

    // 检查用户是否有权访问该企业
    const memberCheck = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2`,
      [enterpriseId, userId]
    )

    if (memberCheck.rows.length === 0) {
      return { success: false, error: '您不是该企业成员' }
    }

    const userRole = memberCheck.rows[0].role

    // 获取所有公开信息
    const result = await fastify.db.query(
      `SELECT * FROM company_public_info
       WHERE enterprise_id = $1
       AND (visibility = 'public' 
         OR visibility = 'all_members' 
         OR (visibility = 'admins_only' AND $2 IN ('owner', 'admin')))
       ORDER BY category`,
      [enterpriseId, userRole]
    )

    // 获取企业基本信息
    const enterprise = await fastify.db.query(
      `SELECT id, name, logo_url, description, plan FROM enterprises WHERE id = $1`,
      [enterpriseId]
    )

    // 获取组织架构
    const orgChart = await fastify.db.query(
      `SELECT em.id, em.user_id, em.department, em.job_title, em.role,
              u.name, u.avatar_url
       FROM enterprise_members em
       JOIN users u ON u.id = em.user_id
       WHERE em.enterprise_id = $1 AND em.status = 'active'
       ORDER BY em.department, em.job_title`,
      [enterpriseId]
    )

    return {
      success: true,
      data: {
        enterprise: enterprise.rows[0] || null,
        info: result.rows.map(i => ({
          id: i.id,
          category: i.category,
          title: i.title,
          content: i.content,
          contentHtml: i.content_html,
          visibility: i.visibility,
          updatedAt: i.updated_at
        })),
        orgChart: orgChart.rows.map(m => ({
          id: m.id,
          userId: m.user_id,
          name: m.name,
          avatarUrl: m.avatar_url,
          department: m.department,
          jobTitle: m.job_title,
          role: m.role
        }))
      }
    }
  })

  // ========================================
  // 【大脑公共信息】更新公司公开信息（管理员）
  // ========================================
  fastify.patch('/enterprises/:enterpriseId/info/:category', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['公司公共信息'],
      summary: '更新公司公开信息（管理员）',
      body: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          content: { type: 'string' },
          contentHtml: { type: 'string' },
          visibility: { type: 'string', enum: ['admins_only', 'all_members', 'public'] },
          changeSummary: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { enterpriseId, category } = request.params as any
    const updates = request.body as any

    // 权限检查
    const perm = await fastify.db.query(
      `SELECT role FROM enterprise_members WHERE enterprise_id = $1 AND user_id = $2`,
      [enterpriseId, userId]
    )

    if (perm.rows.length === 0 || !['owner', 'admin'].includes(perm.rows[0].role)) {
      return reply.status(403).send({ error: '需要管理员权限' })
    }

    // 获取当前版本
    const existing = await fastify.db.query(
      `SELECT id, version FROM company_public_info 
       WHERE enterprise_id = $1 AND category = $2`,
      [enterpriseId, category]
    )

    if (existing.rows.length === 0) {
      // 新建
      const id = uuidv4()
      await fastify.db.query(
        `INSERT INTO company_public_info 
         (id, enterprise_id, category, title, content, content_html, visibility, change_summary, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, enterpriseId, category, updates.title || category, updates.content, updates.contentHtml,
         updates.visibility || 'all_members', updates.changeSummary, userId]
      )
    } else {
      // 更新
      const fields = ['title = $1', 'content = $2', 'content_html = $3', 
                      'visibility = $4', 'change_summary = $5',
                      'version = version + 1', 'updated_at = NOW()']
      await fastify.db.query(
        `UPDATE company_public_info SET ${fields.join(', ')}
         WHERE enterprise_id = $6 AND category = $7`,
        [updates.title, updates.content, updates.contentHtml, updates.visibility,
         updates.changeSummary, enterpriseId, category]
      )
    }

    // 如果设为同步到触手，触发全员推送
    if (updates.syncToClaws) {
      await pushToAllClaws(fastify, enterpriseId, category, updates.title || category)
    }

    return { success: true, message: '公开信息已更新' }
  })

  // ========================================
  // 【公告板】获取公告列表
  // ========================================
  fastify.get('/enterprises/:enterpriseId/announcements', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['公司公共信息'],
      summary: '获取公告列表（触手可读）'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any
    const { category, status = 'published', limit = 20, offset = 0 } = request.query as any

    // 检查成员身份
    const memberCheck = await fastify.db.query(
      `SELECT role FROM enterprise_members WHERE enterprise_id = $1 AND user_id = $2`,
      [enterpriseId, userId]
    )

    if (memberCheck.rows.length === 0) {
      return { success: false, error: '您不是该企业成员' }
    }

    const userRole = memberCheck.rows[0].role

    let query = `
      SELECT a.*, u.name as author_name, u.avatar_url as author_avatar,
             $2 = ANY(a.read_by) as is_read,
             CASE WHEN a.priority = 'urgent' THEN 1 
                  WHEN a.priority = 'important' THEN 2 
                  ELSE 3 END as sort_order
      FROM announcements a
      JOIN users u ON u.id = a.author_id
      WHERE a.enterprise_id = $1 AND a.status = $3
    `
    const params: any[] = [enterpriseId, userId, status]

    if (category) {
      params.push(category)
      query += ` AND a.category = $${params.length}`
    }

    query += ` ORDER BY a.pinned DESC, sort_order ASC, a.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
    params.push(limit, offset)

    const result = await fastify.db.query(query, params)

    // 获取总数
    const countResult = await fastify.db.query(
      `SELECT COUNT(*) FROM announcements WHERE enterprise_id = $1 AND status = $2`,
      [enterpriseId, status]
    )

    // 获取未读数
    const unreadResult = await fastify.db.query(
      `SELECT COUNT(*) FROM announcements 
       WHERE enterprise_id = $1 AND status = 'published' 
       AND NOT ($2 = ANY(read_by))`,
      [enterpriseId, userId]
    )

    return {
      success: true,
      data: {
        announcements: result.rows.map(a => ({
          id: a.id,
          title: a.title,
          content: a.content,
          contentHtml: a.content_html,
          category: a.category,
          priority: a.priority,
          visibility: a.visibility,
          attachments: a.attachments,
          pinned: a.pinned,
          readCount: a.read_count,
          isRead: a.is_read,
          expiresAt: a.expires_at,
          createdAt: a.created_at,
          author: {
            id: a.author_id,
            name: a.author_name,
            avatarUrl: a.author_avatar
          }
        })),
        unreadCount: parseInt(unreadResult.rows[0].count),
        pagination: {
          total: parseInt(countResult.rows[0].count),
          limit,
          offset
        }
      }
    }
  })

  // ========================================
  // 【公告板】发布公告（管理员）
  // ========================================
  fastify.post('/enterprises/:enterpriseId/announcements', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['公司公共信息'],
      summary: '发布公告（管理员）',
      body: {
        type: 'object',
        required: ['title', 'content'],
        properties: {
          title: { type: 'string' },
          content: { type: 'string' },
          contentHtml: { type: 'string' },
          category: { type: 'string', default: 'general' },
          priority: { type: 'string', enum: ['low', 'normal', 'important', 'urgent'], default: 'normal' },
          visibility: { type: 'string', default: 'all' },
          visibleTo: { type: 'array' },
          pushToClaws: { type: 'boolean', default: true },
          pinned: { type: 'boolean', default: false },
          expiresAt: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = this.params as any

    const {
      title, content, contentHtml, category, priority,
      visibility, visibleTo, pushToClaws, pinned, expiresAt
    } = request.body as any

    // 权限检查
    const perm = await fastify.db.query(
      `SELECT role FROM enterprise_members WHERE enterprise_id = $1 AND user_id = $2`,
      [enterpriseId, userId]
    )

    if (perm.rows.length === 0 || !['owner', 'admin'].includes(perm.rows[0].role)) {
      return reply.status(403).send({ error: '需要管理员权限' })
    }

    const announcementId = uuidv4()
    await fastify.db.query(
      `INSERT INTO announcements 
       (id, enterprise_id, author_id, title, content, content_html, category, 
        priority, visibility, visible_to, push_to_claws, pinned, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [announcementId, enterpriseId, userId, title, content, contentHtml, 
       category || 'general', priority || 'normal', visibility || 'all',
       JSON.stringify(visibleTo || []), pushToClaws, pinned, expiresAt]
    )

    // 如果推送到 Claw
    if (pushToClaws) {
      await pushAnnouncementToClaws(fastify, enterpriseId, {
        id: announcementId,
        title,
        content,
        category,
        priority,
        authorId: userId
      })
    }

    return {
      success: true,
      message: '公告已发布',
      data: { announcementId }
    }
  })

  // ========================================
  // 【公告板】标记已读
  // ========================================
  fastify.post('/enterprises/:enterpriseId/announcements/:announcementId/read', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['公司公共信息'],
      summary: '标记公告已读'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId, announcementId } = this.params as any

    await fastify.db.query(
      `UPDATE announcements 
       SET read_count = read_count + 1,
           read_by = array_distinct(array_append(read_by, $1))
       WHERE id = $2 AND enterprise_id = $3
       AND NOT ($1 = ANY(read_by))`,
      [userId, announcementId, enterpriseId]
    )

    return { success: true }
  })

  // ========================================
  // 【触手知识库】获取触手保存的知识
  // ========================================
  fastify.get('/me/knowledge', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['触手知识库'],
      summary: '获取我的个人知识库'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { category, enterpriseId, visibility, limit = 50, offset = 0 } = request.query as any

    let query = `
      SELECT pkb.*, e.name as enterprise_name,
             (SELECT COUNT(*) FROM personal_knowledge_base WHERE user_id = $1) as total_count
      FROM personal_knowledge_base pkb
      LEFT JOIN enterprises e ON e.id = pkb.enterprise_id
      WHERE pkb.user_id = $1
    `
    const params: any[] = [userId]

    if (category) {
      params.push(category)
      query += ` AND pkb.category = $${params.length}`
    }

    if (enterpriseId) {
      params.push(enterpriseId)
      query += ` AND pkb.enterprise_id = $${params.length}`
    }

    // 可见性过滤
    if (visibility) {
      params.push(visibility)
      query += ` AND pkb.visibility = $${params.length}`
    } else {
      // 默认只显示自己的 + 企业的
      query += ` AND (pkb.visibility IN ('private', 'team', 'enterprise', 'public') OR pkb.enterprise_id IS NOT NULL)`
    }

    query += ` ORDER BY pkb.updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
    params.push(limit, offset)

    const result = await fastify.db.query(query, params)

    return {
      success: true,
      data: {
        items: result.rows.map(k => ({
          id: k.id,
          title: k.title,
          content: k.content,
          contentHtml: k.content_html,
          category: k.category,
          tags: k.tags,
          visibility: k.visibility,
          enterpriseId: k.enterprise_id,
          enterpriseName: k.enterprise_name,
          aiSummary: k.ai_summary,
          aiTags: k.ai_tags,
          viewCount: k.view_count,
          createdAt: k.created_at,
          updatedAt: k.updated_at
        })),
        pagination: {
          total: parseInt(result.rows[0]?.total_count) || 0,
          limit,
          offset
        }
      }
    }
  })

  // ========================================
  // 【触手知识库】创建知识条目
  // ========================================
  fastify.post('/me/knowledge', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['触手知识库'],
      summary: '创建知识条目',
      body: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string' },
          content: { type: 'string' },
          contentHtml: { type: 'string' },
          category: { type: 'string' },
          tags: { type: 'array' },
          visibility: { type: 'string', enum: ['private', 'team', 'enterprise', 'public'] },
          enterpriseId: { type: 'string' },
          relatedEnterpriseIds: { type: 'array' }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { title, content, contentHtml, category, tags, visibility, enterpriseId, relatedEnterpriseIds } = request.body as any

    const knowledgeId = uuidv4()
    await fastify.db.query(
      `INSERT INTO personal_knowledge_base 
       (id, user_id, enterprise_id, title, content, content_html, category, tags, visibility, related_enterprise_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [knowledgeId, userId, enterpriseId, title, content, contentHtml,
       category || 'work_notes', JSON.stringify(tags || []),
       visibility || 'private', JSON.stringify(relatedEnterpriseIds || [])]
    )

    // AI 自动摘要
    if (content && content.length > 100) {
      // 触发 AI 摘要（异步）
      generateAiSummary(fastify, knowledgeId, content).catch(() => {})
    }

    return {
      success: true,
      data: { id: knowledgeId, title }
    }
  })

  // ========================================
  // 【触手知识库】更新知识条目
  // ========================================
  fastify.patch('/me/knowledge/:knowledgeId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['触手知识库'],
      summary: '更新知识条目'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { knowledgeId } = this.params as any
    const updates = request.body as any

    const existing = await fastify.db.query(
      'SELECT id FROM personal_knowledge_base WHERE id = $1 AND user_id = $2',
      [knowledgeId, userId]
    )

    if (existing.rows.length === 0) {
      return reply.status(404).send({ error: '知识条目不存在' })
    }

    const fields: string[] = []
    const values: any[] = []
    let i = 1

    if (updates.title !== undefined) { fields.push(`title = $${i++}`); values.push(updates.title) }
    if (updates.content !== undefined) { fields.push(`content = $${i++}`; values.push(updates.content) }
    if (updates.contentHtml !== undefined) { fields.push(`content_html = $${i++}`; values.push(updates.contentHtml) }
    if (updates.category !== undefined) { fields.push(`category = $${i++}`; values.push(updates.category) }
    if (updates.tags !== undefined) { fields.push(`tags = $${i++}`; values.push(JSON.stringify(updates.tags)) }
    if (updates.visibility !== undefined) { fields.push(`visibility = $${i++}`; values.push(updates.visibility) }

    if (fields.length === 0) {
      return { success: false, error: '没有需要更新的字段' }
    }

    fields.push(`version = version + 1`)
    fields.push(`updated_at = NOW()`)
    values.push(knowledgeId)

    await fastify.db.query(
      `UPDATE personal_knowledge_base SET ${fields.join(', ')} WHERE id = $${i}`,
      values
    )

    return { success: true, message: '知识条目已更新' }
  })

  // ========================================
  // 【触手知识库】删除知识条目
  // ========================================
  fastify.delete('/me/knowledge/:knowledgeId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['触手知识库'],
      summary: '删除知识条目'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { knowledgeId } = this.params as any

    const result = await fastify.db.query(
      'DELETE FROM personal_knowledge_base WHERE id = $1 AND user_id = $2 RETURNING id',
      [knowledgeId, userId]
    )

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: '知识条目不存在' })
    }

    return { success: true, message: '知识条目已删除' }
  })

  // ========================================
  // 【企业知识库】获取企业知识（触手可读）
  // ========================================
  fastify.get('/enterprises/:enterpriseId/knowledge', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['公司公共信息'],
      summary: '获取企业知识库（触手可读）'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = this.params as any
    const { space, tags, limit = 50, offset = 0 } = request.query as any

    // 成员检查
    const member = await fastify.db.query(
      `SELECT role, department FROM enterprise_members WHERE enterprise_id = $1 AND user_id = $2`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0) {
      return reply.status(403).send({ error: '您不是该企业成员' })
    }

    const userRole = member.rows[0].role
    const userDept = member.rows[0].department

    let query = `
      SELECT ekb.*, u.name as creator_name,
             $2 = ANY(ekb.visible_to) OR ekb.visibility = 'all_members' OR 
             (ekb.visibility = 'departments' AND $3 = ANY(ekb.visible_to)) OR
             $4 IN ('owner', 'admin') as can_view
      FROM enterprise_knowledge_base ekb
      LEFT JOIN users u ON u.id = ekb.created_by
      WHERE ekb.enterprise_id = $1 AND ekb.visibility != 'admins_only'
    `
    const params: any[] = [enterpriseId, userId, userDept, userRole]

    if (space) {
      params.push(space)
      query += ` AND ekb.space = $${params.length}`
    }

    query += ` HAVING ($2 = ANY(ekb.visible_to) OR ekb.visibility = 'all_members' OR 
             (ekb.visibility = 'departments' AND $3 = ANY(ekb.visible_to)) OR $4 IN ('owner', 'admin'))`
    query += ` ORDER BY ekb.view_count DESC, ekb.updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
    params.push(limit, offset)

    const result = await fastify.db.query(query, params)

    // 获取推荐给该员工的知识（基于技能标签匹配）
    const recommended = await fastify.db.query(
      `SELECT ekb.*, u.name as creator_name
       FROM enterprise_knowledge_base ekb
       LEFT JOIN users u ON u.id = ekb.created_by
       CROSS JOIN LATERAL (
         SELECT skills FROM employee_profiles WHERE user_id = $2
       ) ep
       WHERE ekb.enterprise_id = $1 
       AND $2 = ANY(ekb.recommended_for)
       AND ekb.visibility != 'admins_only'
       ORDER BY ekb.view_count DESC LIMIT 5`,
      [enterpriseId, userId]
    )

    return {
      success: true,
      data: {
        articles: result.rows.map(a => ({
          id: a.id,
          space: a.space,
          title: a.title,
          content: a.content,
          contentHtml: a.content_html,
          tags: a.tags,
          visibility: a.visibility,
          viewCount: a.view_count,
          likedCount: a.liked_count,
          creatorName: a.creator_name,
          createdAt: a.created_at,
          updatedAt: a.updated_at
        })),
        recommended: recommended.rows.map(r => ({
          id: r.id,
          title: r.title,
          space: r.space,
          creatorName: r.creator_name
        })),
        pagination: { limit, offset }
      }
    }
  })
}

// ============================================
// 辅助函数
// ============================================

async function pushToAllClaws(fastify: any, enterpriseId: string, category: string, title: string) {
  // 获取所有活跃连接的触手
  const claws = await fastify.db.query(
    `SELECT ccs.personal_claw_id, ccs.user_id
     FROM claw_connection_status ccs
     WHERE ccs.enterprise_id = $1 AND ccs.connection_status = 'connected'`,
    [enterpriseId]
  )

  for (const claw of claws.rows) {
    await fastify.db.query(
      `INSERT INTO claw_suggestions (id, user_id, suggestion_type, title, content, priority, action_url)
       VALUES ($1, $2, 'company_info_update', $3, $4, 3, $5)`,
      [uuidv4(), claw.user_id, '公司信息已更新', 
       `${title} 信息已更新，请查看`, `/company/info?category=${category}`]
    )
  }

  // 更新同步状态
  await fastify.db.query(
    `UPDATE company_public_info SET synced_to_claws = TRUE WHERE enterprise_id = $1 AND category = $2`,
    [enterpriseId, category]
  )
}

async function pushAnnouncementToClaws(fastify: any, enterpriseId: string, announcement: any) {
  // 获取所有活跃触手
  const claws = await fastify.db.query(
    `SELECT ccs.personal_claw_id, ccs.user_id
     FROM claw_connection_status ccs
     WHERE ccs.enterprise_id = $1 AND ccs.connection_status = 'connected'`,
    [enterpriseId]
  )

  const priorityScore = announcement.priority === 'urgent' ? 9 : announcement.priority === 'important' ? 6 : 3

  for (const claw of claws.rows) {
    await fastify.db.query(
      `INSERT INTO claw_suggestions (id, user_id, suggestion_type, title, content, priority, action_url)
       VALUES ($1, $2, 'announcement', $3, $4, $5, $6)`,
      [uuidv4(), claw.user_id, `[${announcement.category}] ${announcement.title}`,
       announcement.content.substring(0, 200), priorityScore,
       `/company/announcements/${announcement.id}`]
    )
  }
}

async function generateAiSummary(fastify: any, knowledgeId: string, content: string) {
  try {
    // 简单提取前200字作为摘要
    const summary = content.substring(0, 200) + (content.length > 200 ? '...' : '')
    
    // 简单提取标签（用逗号分隔的词）
    const words = content.match(/[\u4e00-\u9fa5]{2,}/g) || []
    const wordCount: Record<string, number> = {}
    words.forEach(w => { wordCount[w] = (wordCount[w] || 0) + 1 })
    
    const topWords = Object.entries(wordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(e => e[0])

    await fastify.db.query(
      `UPDATE personal_knowledge_base 
       SET ai_summary = $1, ai_tags = $2, updated_at = NOW()
       WHERE id = $3`,
      [summary, JSON.stringify(topWords), knowledgeId]
    )
  } catch (e) {
    // AI 摘要失败不影响主流程
  }
}

export default companyInfoRoutes
