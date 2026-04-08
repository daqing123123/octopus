import { FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

const enterpriseRoutes: FastifyPluginAsync = async (fastify) => {

  // ========================================
  // 企业基本信息
  // ========================================

  // 创建企业
  fastify.post('/', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业'],
      summary: '创建企业',
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          slug: { type: 'string' },
          description: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { name, slug, description } = request.body as any

    // 生成唯一 slug
    const enterpriseSlug = slug || name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') + '-' + uuidv4().slice(0, 8)

    // 创建企业
    const enterpriseId = uuidv4()
    await fastify.db.query(
      `INSERT INTO enterprises (id, name, slug, description)
       VALUES ($1, $2, $3, $4)`,
      [enterpriseId, name, enterpriseSlug, description]
    )

    // 创建企业 Claw
    await fastify.db.query(
      `INSERT INTO enterprise_claws (enterprise_id)
       VALUES ($1)`,
      [enterpriseId]
    )

    // 添加创建者为 owner
    await fastify.db.query(
      `INSERT INTO enterprise_members (enterprise_id, user_id, role, status)
       VALUES ($1, $2, 'owner', 'active')`,
      [enterpriseId, userId]
    )

    // 建立连接
    const personalClaw = await fastify.db.query(
      'SELECT id FROM personal_claws WHERE user_id = $1',
      [userId]
    )

    await fastify.db.query(
      `INSERT INTO user_enterprise_connections 
       (user_id, enterprise_id, personal_claw_id, enterprise_claw_id, status)
       VALUES ($1, $2, $3, $4, 'active')`,
      [userId, enterpriseId, personalClaw.rows[0].id, enterpriseId]
    )

    return {
      success: true,
      data: {
        enterpriseId,
        name,
        slug: enterpriseSlug,
        role: 'owner'
      }
    }
  })

  // 获取用户的企业列表
  fastify.get('/my', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业'],
      summary: '获取我的企业列表'
    }
  }, async (request) => {
    const userId = (request.user as any).userId

    const result = await fastify.db.query(
      `SELECT e.id, e.name, e.slug, e.logo_url, e.plan, 
              em.role, em.joined_at,
              c.status as connection_status,
              c.connected_at, c.disconnected_at
       FROM enterprises e
       JOIN enterprise_members em ON e.id = em.enterprise_id
       JOIN user_enterprise_connections c ON c.enterprise_id = e.id AND c.user_id = $1
       WHERE em.user_id = $1 AND em.status = 'active'
       ORDER BY em.joined_at DESC`,
      [userId]
    )

    return {
      success: true,
      data: result.rows
    }
  })

  // 获取企业详情
  fastify.get('/:id', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业'],
      summary: '获取企业详情'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { id } = request.params as any

    // 检查用户是否是企业成员
    const memberCheck = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [id, userId]
    )

    if (memberCheck.rows.length === 0) {
      return reply.status(403).send({ error: '无权访问此企业' })
    }

    const result = await fastify.db.query(
      `SELECT id, name, slug, logo_url, description, plan, max_members, settings, created_at
       FROM enterprises WHERE id = $1`,
      [id]
    )

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: '企业不存在' })
    }

    // 获取成员数量
    const memberCount = await fastify.db.query(
      'SELECT COUNT(*) FROM enterprise_members WHERE enterprise_id = $1 AND status = $2',
      [id, 'active']
    )

    // 获取企业 Claw 信息
    const clawInfo = await fastify.db.query(
      `SELECT id, config, created_at FROM enterprise_claws WHERE enterprise_id = $1`,
      [id]
    )

    return {
      success: true,
      data: {
        ...result.rows[0],
        memberCount: parseInt(memberCount.rows[0].count),
        myRole: memberCheck.rows[0].role,
        claw: clawInfo.rows[0] || null
      }
    }
  })

  // ========================================
  // 成员管理
  // ========================================

  // 邀请成员
  fastify.post('/:id/invite', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业'],
      summary: '邀请成员',
      body: {
        type: 'object',
        required: ['emails'],
        properties: {
          emails: { type: 'array', items: { type: 'string', format: 'email' } },
          role: { type: 'string', enum: ['admin', 'member', 'guest'] }
        }
      }
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { id } = request.params as any
    const { emails, role = 'member' } = request.body as any

    // 检查权限
    const memberCheck = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [id, userId]
    )

    if (memberCheck.rows.length === 0 || 
        !['owner', 'admin'].includes(memberCheck.rows[0].role)) {
      return reply.status(403).send({ error: '无权邀请成员' })
    }

    const invitedUsers = []

    for (const email of emails) {
      // 查找用户
      const userResult = await fastify.db.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      )

      if (userResult.rows.length > 0) {
        const invitedUserId = userResult.rows[0].id

        // 检查是否已是成员
        const existingMember = await fastify.db.query(
          'SELECT id FROM enterprise_members WHERE enterprise_id = $1 AND user_id = $2',
          [id, invitedUserId]
        )

        if (existingMember.rows.length > 0) {
          continue // 已是成员，跳过
        }

        // 添加成员
        await fastify.db.query(
          `INSERT INTO enterprise_members (enterprise_id, user_id, role, invited_by, status)
           VALUES ($1, $2, $3, $4, 'active')`,
          [id, invitedUserId, role, userId]
        )

        // 建立连接
        const personalClaw = await fastify.db.query(
          'SELECT id FROM personal_claws WHERE user_id = $1',
          [invitedUserId]
        )

        if (personalClaw.rows.length > 0) {
          await fastify.db.query(
            `INSERT INTO user_enterprise_connections 
             (user_id, enterprise_id, personal_claw_id, enterprise_claw_id, status)
             VALUES ($1, $2, $3, $4, 'active')
             ON CONFLICT (user_id, enterprise_id) 
             DO UPDATE SET status = 'active', disconnected_at = NULL`,
            [invitedUserId, id, personalClaw.rows[0].id, id]
          )
        }

        invitedUsers.push({ email, userId: invitedUserId })
      }
    }

    return {
      success: true,
      data: { invitedCount: invitedUsers.length, invitedUsers }
    }
  })

  // 移除成员（离职断开连接）
  fastify.delete('/:id/members/:memberId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业'],
      summary: '移除成员'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { id, memberId } = request.params as any

    // 检查权限
    const memberCheck = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [id, userId]
    )

    if (memberCheck.rows.length === 0 || 
        !['owner', 'admin'].includes(memberCheck.rows[0].role)) {
      return reply.status(403).send({ error: '无权移除成员' })
    }

    // 检查目标成员
    const targetMember = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2`,
      [id, memberId]
    )

    if (targetMember.rows.length === 0) {
      return reply.status(404).send({ error: '成员不存在' })
    }

    if (targetMember.rows[0].role === 'owner') {
      return reply.status(403).send({ error: '无法移除企业所有者' })
    }

    // 断开连接（核心功能：员工离职）
    await fastify.db.query(
      `UPDATE enterprise_members SET status = 'inactive' 
       WHERE enterprise_id = $1 AND user_id = $2`,
      [id, memberId]
    )

    await fastify.db.query(
      `UPDATE user_enterprise_connections 
       SET status = 'inactive', disconnected_at = NOW() 
       WHERE enterprise_id = $1 AND user_id = $2`,
      [id, memberId]
    )

    return {
      success: true,
      message: '成员已移除，连接已断开。个人数据保留在个人Claw中，企业数据留在企业。'
    }
  })

  // 获取企业成员列表
  fastify.get('/:id/members', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业'],
      summary: '获取企业成员列表'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { id } = request.params as any

    // 检查权限
    const memberCheck = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [id, userId]
    )

    if (memberCheck.rows.length === 0) {
      return reply.status(403).send({ error: '无权访问此企业' })
    }

    const result = await fastify.db.query(
      `SELECT u.id, u.name, u.email, u.avatar_url, 
              em.role, em.department, em.job_title, em.joined_at,
              pc.id as personal_claw_id
       FROM users u
       JOIN enterprise_members em ON u.id = em.user_id
       LEFT JOIN personal_claws pc ON pc.user_id = u.id
       WHERE em.enterprise_id = $1 AND em.status = 'active'
       ORDER BY em.joined_at DESC`,
      [id]
    )

    return {
      success: true,
      data: result.rows
    }
  })

  // ========================================
  // 【新增】连接申请流程
  // ========================================

  // 用户申请加入企业
  fastify.post('/:id/apply', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业'],
      summary: '申请加入企业',
      body: {
        type: 'object',
        properties: {
          message: { type: 'string', description: '申请留言' },
          applyRole: { type: 'string', enum: ['member', 'guest'], default: 'member' }
        }
      }
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { id } = request.params as any
    const { message, applyRole = 'member' } = request.body as any

    // 检查企业是否存在
    const enterprise = await fastify.db.query(
      'SELECT id, name, plan, max_members FROM enterprises WHERE id = $1',
      [id]
    )
    if (enterprise.rows.length === 0) {
      return reply.status(404).send({ error: '企业不存在' })
    }

    // 检查是否已是成员
    const existingMember = await fastify.db.query(
      `SELECT id, status FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2`,
      [id, userId]
    )
    if (existingMember.rows.length > 0) {
      if (existingMember.rows[0].status === 'active') {
        return reply.status(400).send({ error: '您已是该企业成员' })
      }
      // 之前是成员但已离职 - 重新激活
      await fastify.db.query(
        `UPDATE enterprise_members SET status = 'active', role = $1, joined_at = NOW()
         WHERE enterprise_id = $2 AND user_id = $3`,
        [applyRole, id, userId]
      )
      await fastify.db.query(
        `UPDATE user_enterprise_connections 
         SET status = 'active', disconnected_at = NULL, connected_at = NOW()
         WHERE enterprise_id = $1 AND user_id = $2`,
        [id, userId]
      )
      return { success: true, message: '已重新加入企业', reactivated: true }
    }

    // 检查是否有待处理的申请
    const existingRequest = await fastify.db.query(
      `SELECT id FROM enterprise_join_requests 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'pending'`,
      [id, userId]
    )
    if (existingRequest.rows.length > 0) {
      return reply.status(400).send({ error: '您已有待处理的申请' })
    }

    // 获取用户信息
    const userInfo = await fastify.db.query(
      'SELECT name, email, avatar_url FROM users WHERE id = $1',
      [userId]
    )

    // 创建申请记录
    const requestId = uuidv4()
    await fastify.db.query(
      `INSERT INTO enterprise_join_requests 
       (id, enterprise_id, user_id, apply_role, message, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [requestId, id, userId, applyRole, message || null]
    )

    // 获取企业当前成员数
    const memberCount = await fastify.db.query(
      'SELECT COUNT(*) FROM enterprise_members WHERE enterprise_id = $1 AND status = $2',
      [id, 'active']
    )

    // 获取管理员/owner 列表用于通知
    const admins = await fastify.db.query(
      `SELECT user_id FROM enterprise_members 
       WHERE enterprise_id = $1 AND role IN ('owner', 'admin') AND status = 'active'`,
      [id]
    )

    // TODO: 发送通知给管理员（通过 WebSocket 或消息队列）
    // for (const admin of admins.rows) {
    //   await sendNotification(admin.user_id, {
    //     type: 'join_request',
    //     enterpriseId: id,
    //     requestId: requestId,
    //     userName: userInfo.rows[0].name
    //   })
    // }

    return {
      success: true,
      data: {
        requestId,
        enterpriseName: enterprise.rows[0].name,
        status: 'pending',
        memberCount: parseInt(memberCount.rows[0].count),
        maxMembers: enterprise.rows[0].max_members
      }
    }
  })

  // 获取我的申请列表
  fastify.get('/my/applications', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业'],
      summary: '获取我的申请列表'
    }
  }, async (request) => {
    const userId = (request.user as any).userId

    const result = await fastify.db.query(
      `SELECT r.id, r.enterprise_id, r.apply_role, r.message, r.status, 
              r.created_at, r.processed_at,
              e.name as enterprise_name, e.logo_url as enterprise_logo,
              p.name as processor_name,
              u.name as processor_admin_name
       FROM enterprise_join_requests r
       JOIN enterprises e ON r.enterprise_id = e.id
       LEFT JOIN users p ON r.processed_by = p.id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [userId]
    )

    return {
      success: true,
      data: result.rows
    }
  })

  // 管理员：获取待处理的申请列表
  fastify.get('/:id/applications', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业'],
      summary: '获取企业申请列表（管理员）',
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'all'], default: 'pending' }
        }
      }
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { id } = request.params as any
    const { status = 'pending' } = request.query as any

    // 检查权限
    const memberCheck = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [id, userId]
    )

    if (memberCheck.rows.length === 0 || 
        !['owner', 'admin'].includes(memberCheck.rows[0].role)) {
      return reply.status(403).send({ error: '无权查看申请列表' })
    }

    let statusFilter = ''
    if (status !== 'all') {
      statusFilter = `AND r.status = '${status}'`
    }

    const result = await fastify.db.query(
      `SELECT r.id, r.user_id, r.apply_role, r.message, r.status,
              r.created_at, r.processed_at,
              u.name as applicant_name, u.email as applicant_email, 
              u.avatar_url as applicant_avatar,
              p.name as processor_name,
              (SELECT COUNT(*) FROM user_enterprise_connections WHERE user_id = r.user_id AND status = 'active') as other_enterprises
       FROM enterprise_join_requests r
       JOIN users u ON r.user_id = u.id
       LEFT JOIN users p ON r.processed_by = p.id
       WHERE r.enterprise_id = $1 ${statusFilter}
       ORDER BY r.created_at DESC`,
      [id]
    )

    // 统计
    const stats = await fastify.db.query(
      `SELECT status, COUNT(*) as count 
       FROM enterprise_join_requests WHERE enterprise_id = $1
       GROUP BY status`,
      [id]
    )

    return {
      success: true,
      data: {
        applications: result.rows,
        stats: stats.rows.reduce((acc, s) => { acc[s.status] = parseInt(s.count); return acc }, {})
      }
    }
  })

  // 管理员：审批申请
  fastify.post('/:id/applications/:appId/approve', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业'],
      summary: '批准加入申请'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { id, appId } = request.params as any

    // 检查权限
    const memberCheck = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [id, userId]
    )

    if (memberCheck.rows.length === 0 || 
        !['owner', 'admin'].includes(memberCheck.rows[0].role)) {
      return reply.status(403).send({ error: '无权审批申请' })
    }

    // 获取申请信息
    const application = await fastify.db.query(
      `SELECT r.*, e.name as enterprise_name 
       FROM enterprise_join_requests r
       JOIN enterprises e ON r.enterprise_id = e.id
       WHERE r.id = $1 AND r.enterprise_id = $2 AND r.status = 'pending'`,
      [appId, id]
    )

    if (application.rows.length === 0) {
      return reply.status(404).send({ error: '申请不存在或已处理' })
    }

    const applicantId = application.rows[0].user_id
    const applyRole = application.rows[0].apply_role

    // 添加为成员
    await fastify.db.query(
      `INSERT INTO enterprise_members (enterprise_id, user_id, role, status)
       VALUES ($1, $2, $3, 'active')
       ON CONFLICT (enterprise_id, user_id) 
       DO UPDATE SET status = 'active', role = EXCLUDED.role`,
      [id, applicantId, applyRole]
    )

    // 建立连接
    const personalClaw = await fastify.db.query(
      'SELECT id FROM personal_claws WHERE user_id = $1',
      [applicantId]
    )
    const enterpriseClaw = await fastify.db.query(
      'SELECT id FROM enterprise_claws WHERE enterprise_id = $1',
      [id]
    )

    await fastify.db.query(
      `INSERT INTO user_enterprise_connections 
       (user_id, enterprise_id, personal_claw_id, enterprise_claw_id, status)
       VALUES ($1, $2, $3, $4, 'active')
       ON CONFLICT (user_id, enterprise_id) 
       DO UPDATE SET status = 'active', disconnected_at = NULL, connected_at = NOW()`,
      [applicantId, id, personalClaw.rows[0]?.id, enterpriseClaw.rows[0]?.id]
    )

    // 更新申请状态
    await fastify.db.query(
      `UPDATE enterprise_join_requests 
       SET status = 'approved', processed_by = $1, processed_at = NOW()
       WHERE id = $2`,
      [userId, appId]
    )

    // 触发习惯同步（可选）
    // await triggerHabitSync(applicantId, id)

    return {
      success: true,
      message: `已批准加入${application.rows[0].enterprise_name}，正在建立连接...`,
      data: {
        enterpriseName: application.rows[0].enterprise_name,
        role: applyRole
      }
    }
  })

  // 管理员：拒绝申请
  fastify.post('/:id/applications/:appId/reject', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业'],
      summary: '拒绝加入申请',
      body: {
        type: 'object',
        properties: {
          reason: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { id, appId } = request.params as any
    const { reason } = request.body as any

    // 检查权限
    const memberCheck = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [id, userId]
    )

    if (memberCheck.rows.length === 0 || 
        !['owner', 'admin'].includes(memberCheck.rows[0].role)) {
      return reply.status(403).send({ error: '无权审批申请' })
    }

    // 获取申请信息
    const application = await fastify.db.query(
      `SELECT r.* FROM enterprise_join_requests r
       WHERE r.id = $1 AND r.enterprise_id = $2 AND r.status = 'pending'`,
      [appId, id]
    )

    if (application.rows.length === 0) {
      return reply.status(404).send({ error: '申请不存在或已处理' })
    }

    // 更新申请状态
    await fastify.db.query(
      `UPDATE enterprise_join_requests 
       SET status = 'rejected', processed_by = $1, processed_at = NOW(), 
           reject_reason = $2
       WHERE id = $3`,
      [userId, reason || null, appId]
    )

    return {
      success: true,
      message: '已拒绝申请'
    }
  })

  // ========================================
  // 【新增】个人习惯跨企业同步
  // ========================================

  // 获取企业在该连接的同步状态
  fastify.get('/:id/habit-sync', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业'],
      summary: '获取习惯同步状态'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { id } = request.params as any

    // 检查连接状态
    const connection = await fastify.db.query(
      `SELECT * FROM user_enterprise_connections 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [id, userId]
    )

    if (connection.rows.length === 0) {
      return reply.status(403).send({ error: '未连接到该企业' })
    }

    // 获取个人习惯统计
    const habitStats = await fastify.db.query(
      `SELECT COUNT(*) as total, 
              SUM(frequency) as total_actions,
              MAX(last_occurred) as last_activity
       FROM user_habits WHERE user_id = $1`,
      [userId]
    )

    // 获取已同步的习惯（如果有同步记录）
    const syncedHabits = await fastify.db.query(
      `SELECT COUNT(*) as count FROM habit_sync_records
       WHERE user_id = $1 AND enterprise_id = $2`,
      [userId, id]
    )

    // 获取最近同步时间
    const lastSync = await fastify.db.query(
      `SELECT synced_at, habits_synced FROM habit_sync_records
       WHERE user_id = $1 AND enterprise_id = $2
       ORDER BY synced_at DESC LIMIT 1`,
      [userId, id]
    )

    return {
      success: true,
      data: {
        connectionId: connection.rows[0].id,
        personalHabitCount: parseInt(habitStats.rows[0].total),
        totalActions: parseInt(habitStats.rows[0].total_actions || 0),
        lastActivity: habitStats.rows[0].last_activity,
        syncedToEnterprise: parseInt(syncedHabits.rows[0].count) > 0,
        lastSyncTime: lastSync.rows[0]?.synced_at || null,
        syncStatus: lastSync.rows[0] ? 'synced' : 'not_synced'
      }
    }
  })

  // 获取可同步给企业的习惯（去重）
  fastify.get('/:id/habit-sync/available', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业'],
      summary: '获取可同步的习惯列表'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { id } = request.params as any

    // 检查连接状态
    const connection = await fastify.db.query(
      `SELECT * FROM user_enterprise_connections 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [id, userId]
    )

    if (connection.rows.length === 0) {
      return reply.status(403).send({ error: '未连接到该企业' })
    }

    // 获取个人习惯列表
    const habits = await fastify.db.query(
      `SELECT habit_type, habit_data, frequency, last_occurred, created_at
       FROM user_habits 
       WHERE user_id = $1 AND frequency >= 3
       ORDER BY frequency DESC, last_occurred DESC`,
      [userId]
    )

    // 按类型分组
    const grouped = habits.rows.reduce((acc, habit) => {
      const type = habit.habit_type.split('_')[0] || 'other'
      if (!acc[type]) acc[type] = []
      acc[type].push(habit)
      return acc
    }, {})

    return {
      success: true,
      data: {
        habits: habits.rows,
        grouped,
        totalCount: habits.rows.length,
        suggestedSync: habits.rows.filter(h => h.frequency >= 10).length
      }
    }
  })

  // 同步习惯到企业
  fastify.post('/:id/habit-sync', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业'],
      summary: '同步习惯到企业Claw',
      body: {
        type: 'object',
        properties: {
          habitTypes: { 
            type: 'array', 
            items: { type: 'string' },
            description: '指定要同步的习惯类型，为空则同步全部'
          },
          minFrequency: { type: 'integer', default: 1 },
          includeWorkingStyle: { type: 'boolean', default: true },
          includeAiPreferences: { type: 'boolean', default: true }
        }
      }
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { id } = request.params as any
    const { habitTypes, minFrequency = 3, includeWorkingStyle = true, includeAiPreferences = true } = request.body as any

    // 检查连接状态
    const connection = await fastify.db.query(
      `SELECT * FROM user_enterprise_connections 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [id, userId]
    )

    if (connection.rows.length === 0) {
      return reply.status(403).send({ error: '未连接到该企业' })
    }

    // 获取个人 Claw ID
    const personalClaw = await fastify.db.query(
      'SELECT id FROM personal_claws WHERE user_id = $1',
      [userId]
    )

    // 获取企业 Claw ID
    const enterpriseClaw = await fastify.db.query(
      'SELECT id FROM enterprise_claws WHERE enterprise_id = $1',
      [id]
    )

    if (personalClaw.rows.length === 0 || enterpriseClaw.rows.length === 0) {
      return reply.status(400).send({ error: 'Claw实例不存在' })
    }

    const personalClawId = personalClaw.rows[0].id
    const enterpriseClawId = enterpriseClaw.rows[0].id

    // 构建查询条件
    let typeFilter = ''
    let params: any[] = [userId, minFrequency]

    if (habitTypes && habitTypes.length > 0) {
      typeFilter = `AND habit_type = ANY($3)`
      params.push(habitTypes)
    }

    // 获取要同步的习惯
    const habits = await fastify.db.query(
      `SELECT * FROM user_habits 
       WHERE user_id = $1 AND frequency >= $2 ${typeFilter}
       ORDER BY frequency DESC`,
      params
    )

    // 过滤习惯类型
    let filteredHabits = habits.rows
    if (includeWorkingStyle) {
      filteredHabits = filteredHabits.filter(h => 
        h.habit_type.startsWith('doc_') || 
        h.habit_type.startsWith('table_') ||
        h.habit_type.startsWith('task_')
      )
    }
    if (includeAiPreferences) {
      filteredHabits = filteredHabits.filter(h => 
        h.habit_type.startsWith('ai_') || 
        h.habit_type.startsWith('chat_')
      )
    }

    // 存储到企业 Claw 的习惯池（脱敏处理）
    const syncId = uuidv4()
    let syncedCount = 0

    for (const habit of filteredHabits) {
      // 脱敏：只保留类型和频率，不保留具体内容
      const sanitizedData = {
        habit_type: habit.habit_type,
        frequency: habit.frequency,
        // 只保留聚合统计，不保留原始数据
        aggregated: true,
        last_occurred: habit.last_occurred
      }

      await fastify.db.query(
        `INSERT INTO claw_habit_pool 
         (id, enterprise_claw_id, user_id, habit_type, aggregated_data, frequency, synced_from_claw_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (enterprise_claw_id, user_id, habit_type) DO UPDATE SET
           aggregated_data = EXCLUDED.aggregated_data,
           frequency = EXCLUDED.frequency,
           synced_at = NOW()`,
        [uuidv4(), enterpriseClawId, userId, habit.habit_type, 
         JSON.stringify(sanitizedData), habit.frequency, personalClawId]
      )
      syncedCount++
    }

    // 记录同步历史
    await fastify.db.query(
      `INSERT INTO habit_sync_records 
       (id, user_id, enterprise_id, personal_claw_id, enterprise_claw_id, habits_synced)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [syncId, userId, id, personalClawId, enterpriseClawId, syncedCount]
    )

    return {
      success: true,
      message: `已同步 ${syncedCount} 项习惯到企业Claw`,
      data: {
        syncId,
        syncedCount,
        syncedAt: new Date().toISOString(),
        tips: '企业Claw学习了您的习惯，可以提供更个性化的服务。离职时可一键断开连接。'
      }
    }
  })

  // 获取企业Claw从该用户学习的习惯（汇总视图）
  fastify.get('/:id/habit-sync/learned', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业'],
      summary: '获取企业Claw从个人Claw学习的习惯'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { id } = request.params as any

    // 检查连接状态
    const connection = await fastify.db.query(
      `SELECT * FROM user_enterprise_connections 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [id, userId]
    )

    if (connection.rows.length === 0) {
      return reply.status(403).send({ error: '未连接到该企业' })
    }

    // 获取企业 Claw ID
    const enterpriseClaw = await fastify.db.query(
      'SELECT id FROM enterprise_claws WHERE enterprise_id = $1',
      [id]
    )

    if (enterpriseClaw.rows.length === 0) {
      return reply.status(404).send({ error: '企业Claw不存在' })
    }

    // 获取从该用户学习的习惯
    const learnedHabits = await fastify.db.query(
      `SELECT habit_type, aggregated_data, frequency, synced_at
       FROM claw_habit_pool
       WHERE enterprise_claw_id = $1 AND user_id = $2
       ORDER BY frequency DESC`,
      [enterpriseClaw.rows[0].id, userId]
    )

    // 按类别分组
    const grouped = learnedHabits.rows.reduce((acc, habit) => {
      const category = habit.habit_type.split('_')[0] || 'other'
      if (!acc[category]) acc[category] = []
      acc[category].push(habit)
      return acc
    }, {})

    return {
      success: true,
      data: {
        habits: learnedHabits.rows,
        grouped,
        totalCount: learnedHabits.rows.length,
        categories: Object.keys(grouped)
      }
    }
  })

  // 一键断开连接（离职）
  fastify.post('/:id/disconnect', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业'],
      summary: '断开与企业连接（离职/退出）'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { id } = request.params as any

    // 获取连接信息
    const connection = await fastify.db.query(
      `SELECT c.*, e.name as enterprise_name,
              (SELECT role FROM enterprise_members WHERE enterprise_id = $1 AND user_id = $2) as role
       FROM user_enterprise_connections c
       JOIN enterprises e ON c.enterprise_id = e.id
       WHERE c.enterprise_id = $1 AND c.user_id = $2 AND c.status = 'active'`,
      [id, userId]
    )

    if (connection.rows.length === 0) {
      return reply.status(404).send({ error: '未连接到该企业' })
    }

    const role = connection.rows[0].role

    // owner 不能主动断开，需要先转让所有权
    if (role === 'owner') {
      return reply.status(403).send({ 
        error: '企业所有者不能直接退出，请先转让所有权',
        code: 'OWNER_CANNOT_DISCONNECT'
      })
    }

    // 断开连接
    await fastify.db.query(
      `UPDATE user_enterprise_connections 
       SET status = 'inactive', disconnected_at = NOW()
       WHERE enterprise_id = $1 AND user_id = $2`,
      [id, userId]
    )

    // 更新成员状态
    await fastify.db.query(
      `UPDATE enterprise_members SET status = 'inactive'
       WHERE enterprise_id = $1 AND user_id = $2`,
      [id, userId]
    )

    // 保留习惯同步记录（企业Claw仍可参考，但不再更新）
    // 如果需要彻底删除，可以在这里添加删除逻辑

    return {
      success: true,
      message: `已成功退出${connection.rows[0].enterprise_name}`,
      data: {
        enterpriseName: connection.rows[0].enterprise_name,
        personalDataRetained: true,
        enterpriseDataRetained: true,
        rejoinPossible: true
      }
    }
  })
}

export default enterpriseRoutes
