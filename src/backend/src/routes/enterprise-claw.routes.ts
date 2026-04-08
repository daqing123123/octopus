import { FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

// ============================================
// 企业 Claw 路由 - 八爪鱼大脑管理
// 核心概念：企业管理所有触手的连接、入职、离职
// ============================================

const enterpriseClawRoutes: FastifyPluginAsync = async (fastify) => {
  
  // ========================================
  // 【大脑总览】企业 Claw 状态面板
  // ========================================
  fastify.get('/enterprises/:enterpriseId/claw/dashboard', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业Claw管理'],
      summary: '企业Claw状态总览（大脑仪表盘）'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any

    // 权限检查
    const perm = await fastify.db.query(
      `SELECT role FROM enterprise_members WHERE enterprise_id = $1 AND user_id = $2`,
      [enterpriseId, userId]
    )

    if (perm.rows.length === 0 || !['owner', 'admin'].includes(perm.rows[0].role)) {
      return { success: false, error: '需要管理员权限' }
    }

    // 获取企业 Claw 信息
    const claw = await fastify.db.query(
      `SELECT * FROM enterprise_claws WHERE enterprise_id = $1`,
      [enterpriseId]
    )

    // 获取触手连接统计
    const connectionStats = await fastify.db.query(
      `SELECT 
         COUNT(*) as total_connected,
         COUNT(*) FILTER (WHERE ccs.connection_status = 'connected') as active,
         COUNT(*) FILTER (WHERE ccs.connection_status = 'idle') as idle,
         COUNT(*) FILTER (WHERE ccs.connection_status = 'disconnected') as disconnected,
         COUNT(*) FILTER (WHERE ccs.claw_health = 'healthy') as healthy,
         COUNT(*) FILTER (WHERE ccs.claw_health = 'warning') as warning,
         COUNT(*) FILTER (WHERE ccs.claw_health = 'error') as error
       FROM claw_connection_status ccs
       WHERE ccs.enterprise_id = $1`,
      [enterpriseId]
    )

    // 入职统计
    const onboardingStats = await fastify.db.query(
      `SELECT 
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE onboarding_status = 'not_started') as not_started,
         COUNT(*) FILTER (WHERE onboarding_status = 'in_progress') as in_progress,
         COUNT(*) FILTER (WHERE onboarding_status = 'completed') as completed
       FROM claw_connection_status ccs
       WHERE ccs.enterprise_id = $1 AND ccs.onboarding_status IS NOT NULL`,
      [enterpriseId]
    )

    // 今日入职/离职
    const todayEvents = await fastify.db.query(
      `SELECT event_type, COUNT(*) as count
       FROM employee_lifecycle_records
       WHERE enterprise_id = $1 AND event_date = CURRENT_DATE
       GROUP BY event_type`,
      [enterpriseId]
    )

    // 待处理申请
    const pendingApplications = await fastify.db.query(
      `SELECT COUNT(*) FROM enterprise_join_requests 
       WHERE enterprise_id = $1 AND status = 'pending'`,
      [enterpriseId]
    )

    // 待审批入职任务
    const pendingTasks = await fastify.db.query(
      `SELECT COUNT(*) FROM employee_onboarding_tasks 
       WHERE enterprise_id = $1 AND status = 'pending'`,
      [enterpriseId]
    )

    // 最近活动
    const recentActivity = await fastify.db.query(
      `SELECT elr.*, u.name as employee_name, u.avatar_url as employee_avatar
       FROM employee_lifecycle_records elr
       JOIN users u ON u.id = elr.employee_id
       WHERE elr.enterprise_id = $1
       ORDER BY elr.created_at DESC
       LIMIT 10`,
      [enterpriseId]
    )

    return {
      success: true,
      data: {
        enterpriseClaw: claw.rows[0] || null,
        connections: {
          total: parseInt(connectionStats.rows[0].total_connected),
          active: parseInt(connectionStats.rows[0].active),
          idle: parseInt(connectionStats.rows[0].idle),
          disconnected: parseInt(connectionStats.rows[0].disconnected),
          health: {
            healthy: parseInt(connectionStats.rows[0].healthy),
            warning: parseInt(connectionStats.rows[0].warning),
            error: parseInt(connectionStats.rows[0].error)
          }
        },
        onboarding: {
          total: parseInt(onboardingStats.rows[0].total),
          notStarted: parseInt(onboardingStats.rows[0].not_started),
          inProgress: parseInt(onboardingStats.rows[0].in_progress),
          completed: parseInt(onboardingStats.rows[0].completed)
        },
        pending: {
          applications: parseInt(pendingApplications.rows[0].count),
          tasks: parseInt(pendingTasks.rows[0].count)
        },
        todayEvents: todayEvents.rows.reduce((acc: any, e) => {
          acc[e.event_type] = parseInt(e.count)
          return acc
        }, {}),
        recentActivity: recentActivity.rows.map(a => ({
          id: a.id,
          eventType: a.event_type,
          eventName: a.event_name,
          eventDate: a.event_date,
          actionTaken: a.action_taken,
          employee: {
            id: a.employee_id,
            name: a.employee_name,
            avatarUrl: a.employee_avatar
          },
          createdAt: a.created_at
        }))
      }
    }
  })

  // ========================================
  // 【触手列表】查看所有连接的触手
  // ========================================
  fastify.get('/enterprises/:enterpriseId/claw/tentacles', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业Claw管理'],
      summary: '获取所有触手列表（企业Claw连接状态）'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any
    const { status, health, search, limit = 50, offset = 0 } = request.query as any

    const perm = await fastify.db.query(
      `SELECT role FROM enterprise_members WHERE enterprise_id = $1 AND user_id = $2`,
      [enterpriseId, userId]
    )

    if (perm.rows.length === 0 || !['owner', 'admin'].includes(perm.rows[0].role)) {
      return { success: false, error: '需要管理员权限' }
    }

    let query = `
      SELECT ccs.*,
             u.id as user_id, u.name as user_name, u.email as user_email, u.avatar_url,
             em.role, em.department, em.job_title, em.joined_at,
             ep.employee_number, ep.real_name,
             pc.name as claw_name,
             -- 入职进度
             (SELECT COUNT(*) FROM employee_onboarding_tasks eot 
              WHERE eot.employee_id = u.id AND eot.enterprise_id = $1 
              AND eot.status = 'completed') as onboarding_completed,
             (SELECT COUNT(*) FROM employee_onboarding_tasks eot 
              WHERE eot.employee_id = u.id AND eot.enterprise_id = $1) as onboarding_total
      FROM claw_connection_status ccs
      JOIN users u ON u.id = ccs.user_id
      JOIN enterprise_members em ON em.enterprise_id = ccs.enterprise_id AND em.user_id = u.id
      LEFT JOIN employee_profiles ep ON ep.user_id = u.id
      LEFT JOIN personal_claws pc ON pc.id = ccs.personal_claw_id
      WHERE ccs.enterprise_id = $1
    `
    const params: any[] = [enterpriseId]

    if (status) {
      params.push(status)
      query += ` AND ccs.connection_status = $${params.length}`
    }

    if (health) {
      params.push(health)
      query += ` AND ccs.claw_health = $${params.length}`
    }

    if (search) {
      params.push(`%${search}%`)
      query += ` AND (u.name ILIKE $${params.length} OR em.department ILIKE $${params.length} OR em.job_title ILIKE $${params.length})`
    }

    query += ` ORDER BY ccs.last_active_at DESC NULLS LAST LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
    params.push(limit, offset)

    const result = await fastify.db.query(query, params)

    return {
      success: true,
      data: result.rows.map(t => ({
        userId: t.user_id,
        userName: t.user_name,
        realName: t.real_name,
        email: t.email,
        avatarUrl: t.avatar_url,
        employeeNumber: t.employee_number,
        department: t.department,
        jobTitle: t.job_title,
        role: t.role,
        joinedAt: t.joined_at,
        claw: {
          id: t.personal_claw_id,
          name: t.claw_name,
          connectionStatus: t.connection_status,
          health: t.claw_health,
          healthDetails: t.claw_health_details,
          lastActive: t.last_active_at,
          lastSynced: t.last_synced_at,
          syncStatus: t.sync_status,
          pendingSyncItems: t.pending_sync_items,
          unreadNotifications: t.unread_claw_notifications
        },
        onboarding: {
          completed: parseInt(t.onboarding_completed),
          total: parseInt(t.onboarding_total),
          rate: t.onboarding_total > 0 ? Math.round((parseInt(t.onboarding_completed) / parseInt(t.onboarding_total)) * 100) : 0
        }
      }))
    }
  })

  // ========================================
  // 【触手详情】查看单个触手详情
  // ========================================
  fastify.get('/enterprises/:enterpriseId/claw/tentacles/:userId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业Claw管理'],
      summary: '获取触手详情'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId, userId: targetUserId } = request.params as any

    const perm = await fastify.db.query(
      `SELECT role FROM enterprise_members WHERE enterprise_id = $1 AND user_id = $2`,
      [enterpriseId, userId]
    )

    if (perm.rows.length === 0 || !['owner', 'admin'].includes(perm.rows[0].role)) {
      return { success: false, error: '需要管理员权限' }
    }

    // 触手连接状态
    const clawStatus = await fastify.db.query(
      `SELECT ccs.*,
              pc.name as claw_name, pc.storage_used, pc.storage_quota,
              u.name, u.email, u.avatar_url,
              em.role, em.department, em.job_title,
              ep.employee_number, ep.real_name, ep.avatar_url as profile_avatar,
              ep.skills, ep.education, ep.work_experience
       FROM claw_connection_status ccs
       JOIN users u ON u.id = ccs.user_id
       JOIN enterprise_members em ON em.enterprise_id = ccs.enterprise_id AND em.user_id = ccs.user_id
       LEFT JOIN personal_claws pc ON pc.id = ccs.personal_claw_id
       LEFT JOIN employee_profiles ep ON ep.user_id = ccs.user_id
       WHERE ccs.enterprise_id = $1 AND ccs.user_id = $2`,
      [enterpriseId, targetUserId]
    )

    if (clawStatus.rows.length === 0) {
      return { success: false, error: '触手未连接' }
    }

    const t = clawStatus.rows[0]

    // 同步历史
    const syncHistory = await fastify.db.query(
      `SELECT * FROM info_sync_logs
       WHERE user_id = $1 AND enterprise_id = $2
       ORDER BY synced_at DESC LIMIT 10`,
      [targetUserId, enterpriseId]
    )

    // 生命周期历史
    const lifecycleHistory = await fastify.db.query(
      `SELECT * FROM employee_lifecycle_records
       WHERE employee_id = $1 AND enterprise_id = $2
       ORDER BY created_at DESC LIMIT 20`,
      [targetUserId, enterpriseId]
    )

    // 入职任务进度
    const onboardingTasks = await fastify.db.query(
      `SELECT * FROM employee_onboarding_tasks
       WHERE employee_id = $1 AND enterprise_id = $2
       ORDER BY category, due_days`,
      [targetUserId, enterpriseId]
    )

    return {
      success: true,
      data: {
        tentacle: {
          userId: t.user_id,
          userName: t.user_name,
          realName: t.real_name,
          email: t.email,
          avatarUrl: t.avatar_url || t.profile_avatar,
          employeeNumber: t.employee_number,
          department: t.department,
          jobTitle: t.job_title,
          role: t.role
        },
        claw: {
          id: t.personal_claw_id,
          name: t.claw_name,
          connectionStatus: t.connection_status,
          health: t.claw_health,
          lastActive: t.last_active_at,
          lastSynced: t.last_synced_at,
          syncStatus: t.sync_status,
          storage: {
            used: parseInt(t.storage_used) || 0,
            quota: parseInt(t.storage_quota) || 5368709120
          }
        },
        profile: {
          skills: t.skills,
          education: t.education,
          workExperience: t.work_experience
        },
        onboardingTasks: onboardingTasks.rows.map(task => ({
          id: task.id,
          title: task.title,
          category: task.category,
          status: task.status,
          required: task.required,
          dueDate: task.due_date,
          completedAt: task.completed_at,
          clawSuggestion: task.claw_suggestion
        })),
        syncHistory: syncHistory.rows.map(s => ({
          id: s.id,
          direction: s.direction,
          dataType: s.data_type,
          status: s.status,
          sanitized: s.sanitized,
          syncedAt: s.synced_at
        })),
        lifecycleHistory: lifecycleHistory.rows.map(l => ({
          id: l.id,
          eventType: l.event_type,
          eventName: l.event_name,
          eventDate: l.event_date,
          actionTaken: l.action_taken,
          clawInsight: l.claw_insight,
          createdAt: l.created_at
        }))
      }
    }
  })

  // ========================================
  // 【入职模板】获取入职模板列表
  // ========================================
  fastify.get('/enterprises/:enterpriseId/onboarding/templates', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业Claw管理'],
      summary: '获取入职模板列表'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any

    const perm = await fastify.db.query(
      `SELECT role FROM enterprise_members WHERE enterprise_id = $1 AND user_id = $2`,
      [enterpriseId, userId]
    )

    if (perm.rows.length === 0 || !['owner', 'admin'].includes(perm.rows[0].role)) {
      return { success: false, error: '需要管理员权限' }
    }

    const result = await fastify.db.query(
      `SELECT ot.*, u.name as creator_name,
              (SELECT COUNT(*) FROM employee_onboarding_tasks eot WHERE eot.template_id = ot.id) as used_count
       FROM onboarding_templates ot
       LEFT JOIN users u ON u.id = ot.created_by
       WHERE ot.enterprise_id = $1 AND ot.is_active = true
       ORDER BY ot.is_default DESC, ot.created_at DESC`,
      [enterpriseId]
    )

    return {
      success: true,
      data: result.rows.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        icon: t.icon,
        items: t.items,
        conditions: t.conditions,
        isDefault: t.is_default,
        usedCount: parseInt(t.used_count),
        createdAt: t.created_at,
        createdBy: t.creator_name
      }))
    }
  })

  // ========================================
  // 【入职模板】创建入职模板（管理员）
  // ========================================
  fastify.post('/enterprises/:enterpriseId/onboarding/templates', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业Claw管理'],
      summary: '创建入职模板（管理员）',
      body: {
        type: 'object',
        required: ['name', 'items'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          icon: { type: 'string' },
          items: { type: 'array' },
          conditions: { type: 'object' },
          isDefault: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any
    const { name, description, icon, items, conditions, isDefault } = request.body as any

    const perm = await fastify.db.query(
      `SELECT role FROM enterprise_members WHERE enterprise_id = $1 AND user_id = $2`,
      [enterpriseId, userId]
    )

    if (perm.rows.length === 0 || !['owner', 'admin'].includes(perm.rows[0].role)) {
      return reply.status(403).send({ error: '需要管理员权限' })
    }

    // 如果设为默认，取消其他默认
    if (isDefault) {
      await fastify.db.query(
        `UPDATE onboarding_templates SET is_default = false WHERE enterprise_id = $1`,
        [enterpriseId]
      )
    }

    const templateId = uuidv4()
    await fastify.db.query(
      `INSERT INTO onboarding_templates 
       (id, enterprise_id, created_by, name, description, icon, items, conditions, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [templateId, enterpriseId, userId, name, description, icon || '📋',
       JSON.stringify(items), JSON.stringify(conditions || {}), isDefault || false]
    )

    return {
      success: true,
      data: { templateId, name },
      message: '入职模板已创建'
    }
  })

  // ========================================
  // 【入职任务】为新员工创建入职任务
  // ========================================
  fastify.post('/enterprises/:enterpriseId/onboarding/assign', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业Claw管理'],
      summary: '为员工分配入职任务（企业Claw派发）',
      body: {
        type: 'object',
        required: ['employeeId', 'templateId'],
        properties: {
          employeeId: { type: 'string' },
          templateId: { type: 'string' },
          customItems: { type: 'array' }
        }
      }
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any
    const { employeeId, templateId, customItems } = request.body as any

    const perm = await fastify.db.query(
      `SELECT role FROM enterprise_members WHERE enterprise_id = $1 AND user_id = $2`,
      [enterpriseId, userId]
    )

    if (perm.rows.length === 0 || !['owner', 'admin'].includes(perm.rows[0].role)) {
      return reply.status(403).send({ error: '需要管理员权限' })
    }

    // 获取模板
    const template = await fastify.db.query(
      `SELECT * FROM onboarding_templates WHERE id = $1 AND enterprise_id = $2`,
      [templateId, enterpriseId]
    )

    if (template.rows.length === 0) {
      return reply.status(404).send({ error: '模板不存在' })
    }

    const items = template.rows[0].items
    const onboardingDate = new Date()

    // 获取 Claw ID
    const personalClaw = await fastify.db.query(
      'SELECT id FROM personal_claws WHERE user_id = $1',
      [employeeId]
    )
    const enterpriseClaw = await fastify.db.query(
      'SELECT id FROM enterprise_claws WHERE enterprise_id = $1',
      [enterpriseId]
    )

    let created = 0
    for (const item of items) {
      const taskId = uuidv4()
      const dueDate = new Date(onboardingDate)
      dueDate.setDate(dueDate.getDate() + (item.days || 7))

      // 生成 Claw 建议
      const clawSuggestion = generateClawSuggestion(item, employeeId)

      await fastify.db.query(
        `INSERT INTO employee_onboarding_tasks 
         (id, employee_id, enterprise_id, template_id, personal_claw_id, enterprise_claw_id,
          item_id, title, description, category, required, due_days, due_date, claw_suggestion)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (employee_id, enterprise_id, item_id) DO NOTHING`,
        [taskId, employeeId, enterpriseId, templateId,
         personalClaw.rows[0]?.id, enterpriseClaw.rows[0]?.id,
         item.id, item.title, item.description, item.category, item.required || true,
         item.days || 7, dueDate, clawSuggestion]
      )
      created++
    }

    // 添加自定义项
    if (customItems && customItems.length > 0) {
      for (const item of customItems) {
        const taskId = uuidv4()
        const dueDate = new Date(onboardingDate)
        dueDate.setDate(dueDate.getDate() + (item.days || 7))

        await fastify.db.query(
          `INSERT INTO employee_onboarding_tasks 
           (id, employee_id, enterprise_id, personal_claw_id, enterprise_claw_id,
            item_id, title, description, category, required, due_days, due_date, claw_suggestion)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [taskId, employeeId, enterpriseId, personalClaw.rows[0]?.id, enterpriseClaw.rows[0]?.id,
           item.id || uuidv4(), item.title, item.description, item.category || 'custom',
           item.required !== false, item.days || 7, dueDate, item.clawSuggestion || null]
        )
        created++
      }
    }

    // 更新触手连接状态
    await fastify.db.query(
      `UPDATE claw_connection_status 
       SET onboarding_status = 'in_progress', updated_at = NOW()
       WHERE user_id = $1 AND enterprise_id = $2`,
      [employeeId, enterpriseId]
    )

    // 记录生命周期
    await fastify.db.query(
      `INSERT INTO employee_lifecycle_records 
       (id, employee_id, enterprise_id, event_type, event_name, event_date, action_taken, action_details)
       VALUES ($1, $2, $3, 'onboarding_day', '分配入职任务', CURRENT_DATE, 'tasks_assigned', $4)`,
      [uuidv4(), employeeId, enterpriseId, JSON.stringify({ templateId, created })]
    )

    // 通过 Claw 通知触手
    await fastify.db.query(
      `INSERT INTO claw_suggestions (id, user_id, suggestion_type, title, content, priority, action_url)
       VALUES ($1, $2, 'onboarding_tasks', '入职任务已到达', 
       '企业Claw为您分配了${created}项入职任务，请登录查看', 7, '/me/onboarding')`,
      [uuidv4(), employeeId]
    )

    return {
      success: true,
      message: `已分配${created}项入职任务给员工`,
      data: { created, templateName: template.rows[0].name }
    }
  })

  // ========================================
  // 【入职审批】审批入职任务
  // ========================================
  fastify.post('/enterprises/:enterpriseId/onboarding/tasks/:taskId/approve', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业Claw管理'],
      summary: '审批入职任务',
      body: {
        type: 'object',
        properties: {
          approved: { type: 'boolean' },
          note: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { enterpriseId, taskId } = request.params as any
    const { approved, note } = request.body as any

    const perm = await fastify.db.query(
      `SELECT role FROM enterprise_members WHERE enterprise_id = $1 AND user_id = $2`,
      [enterpriseId, userId]
    )

    if (perm.rows.length === 0 || !['owner', 'admin'].includes(perm.rows[0].role)) {
      return reply.status(403).send({ error: '需要管理员权限' })
    }

    const task = await fastify.db.query(
      `SELECT * FROM employee_onboarding_tasks WHERE id = $1 AND enterprise_id = $2`,
      [taskId, enterpriseId]
    )

    if (task.rows.length === 0) {
      return reply.status(404).send({ error: '任务不存在' })
    }

    const newStatus = approved ? 'completed' : 'pending'

    await fastify.db.query(
      `UPDATE employee_onboarding_tasks 
       SET status = $1, completed_at = ${approved ? 'NOW()' : 'NULL'},
           approved_by = $2, approved_at = NOW(), approval_note = $3, updated_at = NOW()
       WHERE id = $4`,
      [newStatus, userId, note, taskId]
    )

    // 通知员工
    const notifType = approved ? 'task_approved' : 'task_rejected'
    const notifContent = approved 
      ? `您的入职任务"${task.rows[0].title}"已通过审批` 
      : `您的入职任务"${task.rows[0].title}"需要补充：${note}`

    await fastify.db.query(
      `INSERT INTO claw_suggestions (id, user_id, suggestion_type, title, content, priority)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), task.rows[0].employee_id, notifType,
       approved ? '入职任务已通过' : '入职任务需要补充',
       notifContent, approved ? 3 : 7]
    )

    return {
      success: true,
      message: approved ? '任务已批准' : '已要求补充'
    }
  })

  // ========================================
  // 【离职管理】获取离职物品清单
  // ========================================
  fastify.get('/enterprises/:enterpriseId/offboarding/items', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业Claw管理'],
      summary: '获取离职物品清单'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any
    const { employeeId, status } = request.query as any

    const perm = await fastify.db.query(
      `SELECT role FROM enterprise_members WHERE enterprise_id = $1 AND user_id = $2`,
      [enterpriseId, userId]
    )

    if (perm.rows.length === 0 || !['owner', 'admin'].includes(perm.rows[0].role)) {
      return { success: false, error: '需要管理员权限' }
    }

    let query = `
      SELECT oi.*,
             u.name as employee_name, u.avatar_url as employee_avatar,
             ru.name as returned_to_name
      FROM offboarding_items oi
      JOIN users u ON u.id = oi.employee_id
      LEFT JOIN users ru ON ru.id = oi.returned_to
      WHERE oi.enterprise_id = $1
    `
    const params: any[] = [enterpriseId]

    if (employeeId) {
      params.push(employeeId)
      query += ` AND oi.employee_id = $${params.length}`
    }

    if (status) {
      params.push(status)
      query += ` AND oi.return_status = $${params.length}`
    }

    query += ' ORDER BY oi.employee_id, oi.item_type'

    const result = await fastify.db.query(query, params)

    // 按员工分组
    const grouped: Record<string, any> = {}
    result.rows.forEach(item => {
      if (!grouped[item.employee_id]) {
        grouped[item.employee_id] = {
          employeeId: item.employee_id,
          employeeName: item.employee_name,
          employeeAvatar: item.employee_avatar,
          items: []
        }
      }
      grouped[item.employee_id].items.push({
        id: item.id,
        itemType: item.item_type,
        itemName: item.item_name,
        description: item.description,
        serialNumber: item.serial_number,
        returnStatus: item.return_status,
        returnedAt: item.returned_at,
        returnedToName: item.returned_to_name,
        returnNote: item.return_note,
        compensationAmount: item.compensation_amount,
        compensationStatus: item.compensation_status
      })
    })

    return {
      success: true,
      data: Object.values(grouped)
    }
  })

  // ========================================
  // 【离职管理】添加离职物品
  // ========================================
  fastify.post('/enterprises/:enterpriseId/offboarding/items', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业Claw管理'],
      summary: '添加离职物品（设备/账号等）'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any
    const item = request.body as any

    const perm = await fastify.db.query(
      `SELECT role FROM enterprise_members WHERE enterprise_id = $1 AND user_id = $2`,
      [enterpriseId, userId]
    )

    if (perm.rows.length === 0 || !['owner', 'admin'].includes(perm.rows[0].role)) {
      return { success: false, error: '需要管理员权限' }
    }

    // 获取员工 Claw ID
    const personalClaw = await fastify.db.query(
      'SELECT id FROM personal_claws WHERE user_id = $1',
      [item.employeeId]
    )

    const itemId = uuidv4()
    await fastify.db.query(
      `INSERT INTO offboarding_items 
       (id, employee_id, enterprise_id, personal_claw_id, item_type, item_name, description,
        serial_number, assigned_at, estimated_value)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [itemId, item.employeeId, enterpriseId, personalClaw.rows[0]?.id,
       item.itemType, item.itemName, item.description, item.serialNumber, item.assignedAt, item.estimatedValue]
    )

    return { success: true, data: { itemId, itemName: item.itemName } }
  })

  // ========================================
  // 【离职管理】标记物品已归还
  // ========================================
  fastify.post('/enterprises/:enterpriseId/offboarding/items/:itemId/return', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业Claw管理'],
      summary: '标记物品已归还'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId, itemId } = request.params as any
    const { returnNote, returnPhotos } = request.body as any

    await fastify.db.query(
      `UPDATE offboarding_items 
       SET return_status = 'returned', returned_at = NOW(), returned_to = $1,
           return_note = $2, return_photos = $3, updated_at = NOW()
       WHERE id = $4 AND enterprise_id = $5`,
      [userId, returnNote, JSON.stringify(returnPhotos || []), itemId, enterpriseId]
    )

    return { success: true, message: '物品已标记为已归还' }
  })

  // ========================================
  // 【申请审批】获取待审批申请
  // ========================================
  fastify.get('/enterprises/:enterpriseId/join-requests', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业Claw管理'],
      summary: '获取加入申请列表（管理员）'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any
    const { status = 'pending', limit = 50, offset = 0 } = request.query as any

    const perm = await fastify.db.query(
      `SELECT role FROM enterprise_members WHERE enterprise_id = $1 AND user_id = $2`,
      [enterpriseId, userId]
    )

    if (perm.rows.length === 0 || !['owner', 'admin'].includes(perm.rows[0].role)) {
      return { success: false, error: '需要管理员权限' }
    }

    const result = await fastify.db.query(
      `SELECT r.*, u.name as user_name, u.email as user_email, u.avatar_url,
              pu.name as processed_by_name,
              ep.real_name, ep.employee_number, ep.skills
       FROM enterprise_join_requests r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN users pu ON pu.id = r.processed_by
       LEFT JOIN employee_profiles ep ON ep.user_id = r.user_id
       WHERE r.enterprise_id = $1 AND r.status = $2
       ORDER BY r.created_at DESC
       LIMIT $3 OFFSET $4`,
      [enterpriseId, status, limit, offset]
    )

    const countResult = await fastify.db.query(
      `SELECT COUNT(*) FROM enterprise_join_requests WHERE enterprise_id = $1 AND status = $2`,
      [enterpriseId, status]
    )

    return {
      success: true,
      data: {
        requests: result.rows.map(r => ({
          id: r.id,
          applicant: {
            id: r.user_id,
            name: r.user_name,
            email: r.user_email,
            avatarUrl: r.avatar_url,
            realName: r.real_name,
            employeeNumber: r.employee_number,
            skills: r.skills
          },
          applyRole: r.apply_role,
          message: r.message,
          status: r.status,
          rejectReason: r.reject_reason,
          processedBy: r.processed_by_name,
          processedAt: r.processed_at,
          createdAt: r.created_at
        })),
        pendingCount: parseInt(countResult.rows[0].count)
      }
    }
  })

  // ========================================
  // 【申请审批】处理加入申请
  // ========================================
  fastify.post('/enterprises/:enterpriseId/join-requests/:requestId/process', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业Claw管理'],
      summary: '处理加入申请（审批/拒绝）',
      body: {
        type: 'object',
        required: ['approved'],
        properties: {
          approved: { type: 'boolean' },
          role: { type: 'string', enum: ['admin', 'member', 'guest'] },
          rejectReason: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { enterpriseId, requestId } = request.params as any
    const { approved, role = 'member', rejectReason } = request.body as any

    const perm = await fastify.db.query(
      `SELECT role FROM enterprise_members WHERE enterprise_id = $1 AND user_id = $2`,
      [enterpriseId, userId]
    )

    if (perm.rows.length === 0 || !['owner', 'admin'].includes(perm.rows[0].role)) {
      return reply.status(403).send({ error: '需要管理员权限' })
    }

    const req = await fastify.db.query(
      'SELECT * FROM enterprise_join_requests WHERE id = $1 AND enterprise_id = $2',
      [requestId, enterpriseId]
    )

    if (req.rows.length === 0) {
      return reply.status(404).send({ error: '申请不存在' })
    }

    if (req.rows[0].status !== 'pending') {
      return { success: false, error: '申请已被处理' }
    }

    const applicantId = req.rows[0].user_id

    if (approved) {
      // 创建连接
      const personalClaw = await fastify.db.query(
        'SELECT id FROM personal_claws WHERE user_id = $1',
        [applicantId]
      )
      const enterpriseClaw = await fastify.db.query(
        'SELECT id FROM enterprise_claws WHERE enterprise_id = $1',
        [enterpriseId]
      )

      // 创建连接
      await fastify.db.query(
        `INSERT INTO user_enterprise_connections 
         (id, user_id, enterprise_id, status, personal_claw_id, enterprise_claw_id)
         VALUES ($1, $2, $3, 'active', $4, $5)
         ON CONFLICT (user_id, enterprise_id) DO UPDATE SET
           status = 'active', disconnected_at = NULL`,
        [uuidv4(), applicantId, enterpriseId, personalClaw.rows[0]?.id, enterpriseClaw.rows[0]?.id]
      )

      // 创建成员
      await fastify.db.query(
        `INSERT INTO enterprise_members (id, enterprise_id, user_id, role, status)
         VALUES ($1, $2, $3, $4, 'active')
         ON CONFLICT (enterprise_id, user_id) DO UPDATE SET
           role = $4, status = 'active'`,
        [uuidv4(), enterpriseId, applicantId, role]
      )

      // 连接触手
      await fastify.db.query(
        `INSERT INTO claw_connection_status 
         (id, enterprise_claw_id, enterprise_id, personal_claw_id, user_id, 
          connection_status, onboarding_status, last_active_at)
         VALUES ($1, $2, $3, $4, $5, 'connected', 'not_started', NOW())
         ON CONFLICT (enterprise_claw_id, personal_claw_id) DO UPDATE SET
           connection_status = 'connected', last_active_at = NOW()`,
        [uuidv4(), enterpriseClaw.rows[0]?.id, enterpriseId, personalClaw.rows[0]?.id, applicantId]
      )

      // 记录生命周期
      await fastify.db.query(
        `INSERT INTO employee_lifecycle_records 
         (id, employee_id, enterprise_id, event_type, event_name, event_date, action_taken)
         VALUES ($1, $2, $3, 'onboarding_day', '申请通过，正式入职', CURRENT_DATE, 'connected')`,
        [uuidv4(), applicantId, enterpriseId]
      )

      // 通知触手
      await fastify.db.query(
        `INSERT INTO claw_suggestions (id, user_id, suggestion_type, title, content, priority, action_url)
         VALUES ($1, $2, 'application_approved', '加入申请已通过！', 
         '恭喜！您已成功加入企业。触手已连接到企业Claw，开始您的入职之旅吧！', 9, '/me/profile')`,
        [uuidv4(), applicantId]
      )

      // 同步公司信息给触手
      await syncCompanyInfoToTentacle(fastify, applicantId, enterpriseId)

    } else {
      await fastify.db.query(
        `UPDATE enterprise_join_requests 
         SET status = 'rejected', processed_by = $1, processed_at = NOW(), reject_reason = $2
         WHERE id = $3`,
        [userId, rejectReason, requestId]
      )

      // 通知触手
      await fastify.db.query(
        `INSERT INTO claw_suggestions (id, user_id, suggestion_type, title, content, priority)
         VALUES ($1, $2, 'application_rejected', '加入申请未通过', $3, 5)`,
        [uuidv4(), applicantId, `很抱歉，您的加入申请未通过。${rejectReason ? '原因：' + rejectReason : ''}`]
      )
    }

    // 更新申请状态
    await fastify.db.query(
      `UPDATE enterprise_join_requests 
       SET status = $1, processed_by = $2, processed_at = NOW()
       WHERE id = $3`,
      [approved ? 'approved' : 'rejected', userId, requestId]
    )

    return {
      success: true,
      message: approved ? '已批准加入申请，触手已连接' : '已拒绝申请'
    }
  })

  // ========================================
  // 【离职管理】发起员工离职
  // ========================================
  fastify.post('/enterprises/:enterpriseId/offboarding/initiate', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业Claw管理'],
      summary: '管理员发起员工离职'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any
    const { employeeId, lastWorkDate, offboardingItems } = request.body as any

    const perm = await fastify.db.query(
      `SELECT role FROM enterprise_members WHERE enterprise_id = $1 AND user_id = $2`,
      [enterpriseId, userId]
    )

    if (perm.rows.length === 0 || !['owner', 'admin'].includes(perm.rows[0].role)) {
      return { success: false, error: '需要管理员权限' }
    }

    // 获取 Claw ID
    const personalClaw = await fastify.db.query(
      'SELECT id FROM personal_claws WHERE user_id = $1',
      [employeeId]
    )
    const enterpriseClaw = await fastify.db.query(
      'SELECT id FROM enterprise_claws WHERE enterprise_id = $1',
      [enterpriseId]
    )

    // 添加离职物品
    let itemsAdded = 0
    if (offboardingItems && offboardingItems.length > 0) {
      for (const item of offboardingItems) {
        await fastify.db.query(
          `INSERT INTO offboarding_items 
           (id, employee_id, enterprise_id, personal_claw_id, item_type, item_name, description, serial_number)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [uuidv4(), employeeId, enterpriseId, personalClaw.rows[0]?.id,
           item.itemType, item.itemName, item.description, item.serialNumber]
        )
        itemsAdded++
      }
    }

    // 记录生命周期
    await fastify.db.query(
      `INSERT INTO employee_lifecycle_records 
       (id, employee_id, enterprise_id, event_type, event_name, event_date, action_taken, action_details)
       VALUES ($1, $2, $3, 'offboarding_initiated', '管理员发起离职', $4, 'pending_disconnect', $5)`,
      [uuidv4(), employeeId, enterpriseId, lastWorkDate || new Date(),
       JSON.stringify({ initiatedBy: userId, itemsAdded })]
    )

    // 断开触手连接
    await fastify.db.query(
      `UPDATE claw_connection_status 
       SET connection_status = 'disconnected', updated_at = NOW()
       WHERE user_id = $1 AND enterprise_id = $2`,
      [employeeId, enterpriseId]
    )

    // 通知触手
    await fastify.db.query(
      `INSERT INTO claw_suggestions (id, user_id, suggestion_type, title, content, priority, action_url)
       VALUES ($1, $2, 'offboarding_initiated', '离职流程已启动', 
       '企业Claw已启动您的离职流程。请在最后工作日前完成所有物品归还。', 9, '/me/offboarding')`,
      [uuidv4(), employeeId]
    )

    return {
      success: true,
      message: '已启动离职流程',
      data: {
        itemsAdded,
        tips: '员工可继续使用触手查看个人数据，公司的企业Claw数据将保留在企业侧'
      }
    }
  })

  // ========================================
  // 【大脑洞察】获取团队洞察（基于所有触手的聚合数据）
  // ========================================
  fastify.get('/enterprises/:enterpriseId/claw/insights', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业Claw管理'],
      summary: '获取团队洞察（基于所有触手的聚合数据）'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any

    const perm = await fastify.db.query(
      `SELECT role FROM enterprise_members WHERE enterprise_id = $1 AND user_id = $2`,
      [enterpriseId, userId]
    )

    if (perm.rows.length === 0 || !['owner', 'admin'].includes(perm.rows[0].role)) {
      return { success: false, error: '需要管理员权限' }
    }

    // 技能分布（从所有触手的技能标签聚合）
    const skillsDistribution = await fastify.db.query(
      `SELECT ep.skills, COUNT(*) as count
       FROM employee_profiles ep
       JOIN user_enterprise_connections uec ON uec.user_id = ep.user_id
       WHERE uec.enterprise_id = $1 AND uec.status = 'active' AND ep.skills IS NOT NULL
       GROUP BY ep.skills`,
      [enterpriseId]
    )

    // 聚合技能
    const allSkills: Record<string, number> = {}
    skillsDistribution.rows.forEach(row => {
      const skills = row.skills || []
      skills.forEach((skill: string) => {
        allSkills[skill] = (allSkills[skill] || 0) + parseInt(row.count)
      })
    })
    const topSkills = Object.entries(allSkills)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([skill, count]) => ({ skill, count }))

    // 入职阶段分布
    const stageDistribution = await fastify.db.query(
      `SELECT 
         COUNT(*) FILTER (WHERE em.joined_at >= CURRENT_DATE - INTERVAL '7 days') as week_1,
         COUNT(*) FILTER (WHERE em.joined_at >= CURRENT_DATE - INTERVAL '30 days') as month_1,
         COUNT(*) FILTER (WHERE em.joined_at >= CURRENT_DATE - INTERVAL '90 days') as quarter_1,
         COUNT(*) FILTER (WHERE em.joined_at < CURRENT_DATE - INTERVAL '365 days') as veteran
       FROM enterprise_members em
       WHERE em.enterprise_id = $1 AND em.status = 'active'`,
      [enterpriseId]
    )

    // 部门分布
    const deptDistribution = await fastify.db.query(
      `SELECT COALESCE(em.department, '未分配') as department, COUNT(*) as count
       FROM enterprise_members em
       WHERE em.enterprise_id = $1 AND em.status = 'active'
       GROUP BY em.department
       ORDER BY count DESC`,
      [enterpriseId]
    )

    // Claw 健康度分布
    const clawHealth = await fastify.db.query(
      `SELECT claw_health, COUNT(*) as count
       FROM claw_connection_status
       WHERE enterprise_id = $1
       GROUP BY claw_health`,
      [enterpriseId]
    )

    // 入职完成率
    const onboardingCompletion = await fastify.db.query(
      `SELECT 
         AVG(onboarding_completion_rate) as avg_completion_rate,
         COUNT(*) FILTER (WHERE onboarding_completion_rate = 100) as fully_onboarded,
         COUNT(*) FILTER (WHERE onboarding_completion_rate < 50) as needs_attention
       FROM claw_connection_status
       WHERE enterprise_id = $1 AND onboarding_status IS NOT NULL`,
      [enterpriseId]
    )

    return {
      success: true,
      data: {
        teamComposition: {
          totalMembers: deptDistribution.rows.reduce((s: number, d: any) => s + parseInt(d.count), 0),
          byDepartment: deptDistribution.rows.map(d => ({
            department: d.department,
            count: parseInt(d.count)
          })),
          byTenure: {
            thisWeek: parseInt(stageDistribution.rows[0].week_1),
            thisMonth: parseInt(stageDistribution.rows[0].month_1),
            thisQuarter: parseInt(stageDistribution.rows[0].quarter_1),
            veteran: parseInt(stageDistribution.rows[0].veteran)
          }
        },
        skills: {
          top: topSkills,
          total: Object.keys(allSkills).length
        },
        clawHealth: {
          healthy: clawHealth.rows.find((r: any) => r.claw_health === 'healthy')?.count || 0,
          warning: clawHealth.rows.find((r: any) => r.claw_health === 'warning')?.count || 0,
          error: clawHealth.rows.find((r: any) => r.claw_health === 'error')?.count || 0,
          disconnected: clawHealth.rows.find((r: any) => r.claw_health === 'disconnected')?.count || 0
        },
        onboarding: {
          avgCompletionRate: parseFloat(onboardingCompletion.rows[0].avg_completion_rate) || 0,
          fullyOnboarded: parseInt(onboardingCompletion.rows[0].fully_onboarded),
          needsAttention: parseInt(onboardingCompletion.rows[0].needs_attention)
        }
      }
    }
  })
}

// ============================================
// 辅助函数
// ============================================

function generateClawSuggestion(item: any, employeeId: string): string {
  const suggestions: Record<string, string> = {
    setup: '💡 Claw建议：请准备好相关材料，如有疑问可联系HR。',
    paperwork: '📋 Claw建议：请确保所有文件清晰可读，扫描件更佳。',
    training: '📚 Claw建议：建议提前阅读相关文档，带着问题参加培训效果更好。',
    team: '👥 Claw建议：主动介绍自己，大多数同事都很乐意帮助新成员！',
    introduction: '🎯 Claw建议：在自我介绍时可以突出您的专业背景和技能。'
  }
  return suggestions[item.category] || '💡 Claw建议：如有疑问，请联系您的导师或HR。'
}

async function syncCompanyInfoToTentacle(fastify: any, userId: string, enterpriseId: string) {
  // 同步公司公开信息到触手
  const companyInfo = await fastify.db.query(
    `SELECT category, title FROM company_public_info WHERE enterprise_id = $1`,
    [enterpriseId]
  )

  if (companyInfo.rows.length > 0) {
    await fastify.db.query(
      `INSERT INTO claw_suggestions (id, user_id, suggestion_type, title, content, priority)
       VALUES ($1, $2, 'company_info', '公司信息已同步', $3, 3)`,
      [uuidv4(), userId, 
       `触手已同步${companyInfo.rows.length}项公司公开信息，可在触手档案中查看。`]
    )
  }
}

export default enterpriseClawRoutes
