import { FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

// ============================================
// 触手档案路由 - 个人员工的完整工作档案
// 核心概念：触手（个人Claw）保存员工的私密工作数据
// ============================================

const employeeProfileRoutes: FastifyPluginAsync = async (fastify) => {
  
  // ========================================
  // 【触手档案】获取我的档案
  // ========================================
  fastify.get('/me/profile', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['触手档案'],
      summary: '获取我的触手档案（个人Claw持有）'
    }
  }, async (request) => {
    const userId = (request.user as any).userId

    // 获取档案
    let profile = await fastify.db.query(
      `SELECT ep.*, pc.name as claw_name
       FROM employee_profiles ep
       LEFT JOIN personal_claws pc ON pc.id = ep.personal_claw_id
       WHERE ep.user_id = $1`,
      [userId]
    )

    if (profile.rows.length === 0) {
      // 自动创建空档案
      const personalClaw = await fastify.db.query(
        'SELECT id FROM personal_claws WHERE user_id = $1',
        [userId]
      )
      
      if (personalClaw.rows.length === 0) {
        return { success: false, error: '请先创建个人Claw' }
      }

      const profileId = uuidv4()
      await fastify.db.query(
        `INSERT INTO employee_profiles (id, user_id, personal_claw_id)
         VALUES ($1, $2, $3)`,
        [profileId, userId, personalClaw.rows[0].id]
      )

      profile = await fastify.db.query(
        `SELECT ep.*, pc.name as claw_name
         FROM employee_profiles ep
         LEFT JOIN personal_claws pc ON pc.id = ep.personal_claw_id
         WHERE ep.id = $1`,
        [profileId]
      )
    }

    const p = profile.rows[0]

    // 获取关联的企业
    const connections = await fastify.db.query(
      `SELECT uec.enterprise_id, uec.status, uec.connected_at,
              e.name as enterprise_name, em.role, em.department, em.job_title,
              ep.employee_number
       FROM user_enterprise_connections uec
       JOIN enterprises e ON e.id = uec.enterprise_id
       LEFT JOIN enterprise_members em ON em.enterprise_id = e.id AND em.user_id = uec.user_id
       LEFT JOIN employee_profiles ep ON ep.user_id = uec.user_id
       WHERE uec.user_id = $1 AND uec.status = 'active'`,
      [userId]
    )

    // 获取证件数量
    const docs = await fastify.db.query(
      `SELECT COUNT(*) as count, 
              json_agg(doc_type) as types
       FROM employee_documents
       WHERE user_id = $1`,
      [userId]
    )

    // 获取入职进度
    const onboarding = await fastify.db.query(
      `SELECT 
         COUNT(*) FILTER (WHERE status = 'completed') as completed,
         COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress')) as pending,
         COUNT(*) as total
       FROM employee_onboarding_tasks
       WHERE employee_id = $1 AND status != 'skipped'`,
      [userId]
    )

    // 获取触手健康度
    const clawHealth = await fastify.db.query(
      `SELECT claw_health, last_active_at
       FROM claw_connection_status
       WHERE user_id = $1
       ORDER BY updated_at DESC LIMIT 1`,
      [userId]
    )

    return {
      success: true,
      data: {
        profile: {
          id: p.id,
          realName: p.real_name,
          gender: p.gender,
          birthday: p.birthday,
          idCardNumber: p.id_card_number ? '***' + p.id_card_number.slice(-4) : null,
          avatarUrl: p.avatar_url,
          personalPhone: p.personal_phone,
          emergencyContact: {
            name: p.emergency_contact_name,
            phone: p.emergency_contact_phone
          },
          workEmail: p.work_email,
          employeeNumber: p.employee_number,
          education: p.education,
          workExperience: p.work_experience,
          skills: p.skills,
          resumeUrl: p.resume_url,
          onboardedAt: p.onboarded_at,
          profileStatus: p.profile_status,
          clawName: p.claw_name
        },
        connections: connections.rows.map(c => ({
          enterpriseId: c.enterprise_id,
          enterpriseName: c.enterprise_name,
          role: c.role,
          department: c.department,
          jobTitle: c.job_title,
          employeeNumber: c.employee_number,
          connectedAt: c.connected_at,
          status: c.status
        })),
        stats: {
          documentCount: parseInt(docs.rows[0].count),
          documentTypes: docs.rows[0].types || [],
          onboardingCompleted: parseInt(onboarding.rows[0].completed),
          onboardingPending: parseInt(onboarding.rows[0].pending),
          onboardingTotal: parseInt(onboarding.rows[0].total),
          clawHealth: clawHealth.rows[0]?.claw_health || 'unknown',
          lastActive: clawHealth.rows[0]?.last_active_at
        }
      }
    }
  })

  // ========================================
  // 【触手档案】更新档案（触手保存）
  // ========================================
  fastify.patch('/me/profile', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['触手档案'],
      summary: '更新触手档案（仅触手侧，敏感信息）',
      body: {
        type: 'object',
        properties: {
          realName: { type: 'string' },
          gender: { type: 'string' },
          birthday: { type: 'string' },
          idCardNumber: { type: 'string' },
          personalPhone: { type: 'string' },
          emergencyContactName: { type: 'string' },
          emergencyContactPhone: { type: 'string' },
          workEmail: { type: 'string' },
          education: { type: 'array' },
          workExperience: { type: 'array' },
          skills: { type: 'array' },
          avatarUrl: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const updates = request.body as any

    // 验证档案存在
    const existing = await fastify.db.query(
      'SELECT id FROM employee_profiles WHERE user_id = $1',
      [userId]
    )

    if (existing.rows.length === 0) {
      return { success: false, error: '档案不存在' }
    }

    const fields: string[] = []
    const values: any[] = []
    let i = 1

    // 字段映射（camelCase -> snake_case）
    const fieldMap: Record<string, string> = {
      realName: 'real_name',
      gender: 'gender',
      birthday: 'birthday',
      idCardNumber: 'id_card_number',
      personalPhone: 'personal_phone',
      emergencyContactName: 'emergency_contact_name',
      emergencyContactPhone: 'emergency_contact_phone',
      workEmail: 'work_email',
      education: 'education',
      workExperience: 'work_experience',
      skills: 'skills',
      avatarUrl: 'avatar_url'
    }

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (updates[key] !== undefined) {
        fields.push(`${dbField} = $${i++}`)
        if (Array.isArray(updates[key])) {
          values.push(JSON.stringify(updates[key]))
        } else {
          values.push(updates[key])
        }
      }
    }

    if (fields.length === 0) {
      return { success: false, error: '没有需要更新的字段' }
    }

    fields.push(`updated_at = NOW()`)
    fields.push(`profile_status = CASE WHEN profile_status = 'incomplete' THEN 'complete' ELSE profile_status END`)
    values.push(userId)

    await fastify.db.query(
      `UPDATE employee_profiles SET ${fields.join(', ')} WHERE user_id = $${i}`,
      values
    )

    // 如果更新了技能，同步到 Claw 知识图谱
    if (updates.skills) {
      await syncSkillsToClaw(fastify, userId, updates.skills)
    }

    // 如果更新了简历，同步到企业
    if (updates.resumeUrl) {
      await notifyCompanyClaw(fastify, userId, 'resume_updated', { resumeUrl: updates.resumeUrl })
    }

    return { success: true, message: '档案已更新', updatedFields: Object.keys(updates) }
  })

  // ========================================
  // 【触手档案】上传证件/文件
  // ========================================
  fastify.post('/me/profile/documents', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['触手档案'],
      summary: '上传证件/文件到触手档案库',
      body: {
        type: 'object',
        required: ['docType', 'fileUrl', 'fileName'],
        properties: {
          docType: { type: 'string', enum: ['avatar', 'id_card', 'resume', 'contract', 'certificate', 'other'] },
          fileUrl: { type: 'string' },
          fileName: { type: 'string' },
          fileSize: { type: 'number' },
          mimeType: { type: 'string' },
          visibility: { type: 'string', enum: ['private', 'company_only', 'public'], default: 'private' },
          enterpriseId: { type: 'string' }, // 如果要分享给公司
          expiresAt: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { docType, fileUrl, fileName, fileSize, mimeType, visibility, enterpriseId, expiresAt } = request.body as any

    const docId = uuidv4()

    await fastify.db.query(
      `INSERT INTO employee_documents 
       (id, user_id, enterprise_id, doc_type, doc_name, file_url, file_size, mime_type, visibility, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [docId, userId, enterpriseId || null, docType, fileName, fileUrl, fileSize, mimeType, visibility || 'private', expiresAt]
    )

    // 如果是工牌照且设为 company_only，同步到企业
    if (docType === 'avatar' && visibility === 'company_only' && enterpriseId) {
      await fastify.db.query(
        `UPDATE employee_profiles SET avatar_url = $1 WHERE user_id = $2`,
        [fileUrl, userId]
      )
    }

    return { success: true, data: { docId, docType, fileName } }
  })

  // ========================================
  // 【触手档案】获取我的所有证件
  // ========================================
  fastify.get('/me/profile/documents', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['触手档案'],
      summary: '获取我的所有证件列表'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { type, visibility } = request.query as any

    let query = `
      SELECT ed.*, u.name as verified_by_name,
             e.name as enterprise_name
      FROM employee_documents ed
      LEFT JOIN users u ON u.id = ed.verified_by
      LEFT JOIN enterprises e ON e.id = ed.enterprise_id
      WHERE ed.user_id = $1
    `
    const params: any[] = [userId]

    if (type) {
      params.push(type)
      query += ` AND ed.doc_type = $${params.length}`
    }

    if (visibility) {
      params.push(visibility)
      query += ` AND ed.visibility = $${params.length}`
    }

    query += ' ORDER BY ed.uploaded_at DESC'

    const result = await fastify.db.query(query, params)

    return {
      success: true,
      data: result.rows.map(d => ({
        id: d.id,
        docType: d.doc_type,
        docName: d.doc_name,
        fileUrl: d.file_url,
        fileSize: d.file_size,
        mimeType: d.mime_type,
        visibility: d.visibility,
        enterpriseName: d.enterprise_name,
        metadata: d.metadata,
        uploadedAt: d.uploaded_at,
        verifiedAt: d.verified_at,
        verifiedByName: d.verified_by_name,
        expiresAt: d.expires_at
      }))
    }
  })

  // ========================================
  // 【触手档案】删除证件
  // ========================================
  fastify.delete('/me/profile/documents/:docId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['触手档案'],
      summary: '删除证件（仅私有证件可删除）'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { docId } = request.params as any

    const doc = await fastify.db.query(
      `SELECT id, visibility FROM employee_documents WHERE id = $1 AND user_id = $2`,
      [docId, userId]
    )

    if (doc.rows.length === 0) {
      return reply.status(404).send({ error: '证件不存在' })
    }

    if (doc.rows[0].visibility !== 'private') {
      return reply.status(403).send({ error: '公司证件需联系管理员删除' })
    }

    await fastify.db.query(
      'DELETE FROM employee_documents WHERE id = $1',
      [docId]
    )

    return { success: true, message: '证件已删除' }
  })

  // ========================================
  // 【触手档案】上传/更新简历
  // ========================================
  fastify.post('/me/profile/resume', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['触手档案'],
      summary: '上传简历（触手持有）',
      body: {
        type: 'object',
        required: ['resumeUrl', 'fileName'],
        properties: {
          resumeUrl: { type: 'string' },
          fileName: { type: 'string' },
          fileSize: { type: 'number' },
          parsedData: { type: 'object' }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { resumeUrl, fileName, fileSize, parsedData } = request.body as any

    // 先删除旧简历
    await fastify.db.query(
      `DELETE FROM employee_documents WHERE user_id = $1 AND doc_type = 'resume'`,
      [userId]
    )

    // 插入新简历
    const docId = uuidv4()
    await fastify.db.query(
      `INSERT INTO employee_documents 
       (id, user_id, doc_type, doc_name, file_url, file_size, visibility)
       VALUES ($1, $2, 'resume', $3, $4, $5, 'private')`,
      [docId, userId, fileName, resumeUrl, fileSize]
    )

    // 更新档案中的简历链接
    await fastify.db.query(
      `UPDATE employee_profiles 
       SET resume_url = $1, resume_parsed = $2, updated_at = NOW()
       WHERE user_id = $3`,
      [resumeUrl, JSON.stringify(parsedData || {}), userId]
    )

    // 提取技能并同步到 Claw
    if (parsedData?.skills) {
      await syncSkillsToClaw(fastify, userId, parsedData.skills)
    }

    // 提取工作经历同步
    if (parsedData?.workExperience) {
      await syncWorkExperienceToClaw(fastify, userId, parsedData.workExperience)
    }

    return {
      success: true,
      message: '简历已上传',
      data: {
        docId,
        resumeUrl,
        skillsExtracted: parsedData?.skills?.length || 0,
        workExperienceCount: parsedData?.workExperience?.length || 0
      }
    }
  })

  // ========================================
  // 【触手档案】获取我的所有企业连接（触手视角）
  // ========================================
  fastify.get('/me/connections', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['触手档案'],
      summary: '获取我的所有企业连接（触手视角）'
    }
  }, async (request) => {
    const userId = (request.user as any).userId

    const result = await fastify.db.query(
      `SELECT uec.*,
              e.name as enterprise_name,
              e.logo_url as enterprise_logo,
              e.plan,
              ec.id as enterprise_claw_id,
              pc.id as personal_claw_id,
              em.role, em.department, em.job_title, em.joined_at,
              ep.employee_number,
              -- 触手连接状态
              ccs.connection_status,
              ccs.claw_health,
              ccs.last_active_at,
              ccs.sync_status,
              -- 入职进度
              (SELECT COUNT(*) FROM employee_onboarding_tasks eot 
               WHERE eot.employee_id = uec.user_id AND eot.enterprise_id = uec.enterprise_id 
               AND eot.status = 'completed') as onboarding_completed,
              (SELECT COUNT(*) FROM employee_onboarding_tasks eot 
               WHERE eot.employee_id = uec.user_id AND eot.enterprise_id = uec.enterprise_id) as onboarding_total
       FROM user_enterprise_connections uec
       JOIN enterprises e ON e.id = uec.enterprise_id
       LEFT JOIN enterprise_claws ec ON ec.enterprise_id = e.id
       LEFT JOIN personal_claws pc ON pc.user_id = uec.user_id
       LEFT JOIN enterprise_members em ON em.enterprise_id = e.id AND em.user_id = uec.user_id
       LEFT JOIN employee_profiles ep ON ep.user_id = uec.user_id
       LEFT JOIN claw_connection_status ccs ON ccs.personal_claw_id = pc.id AND ccs.enterprise_id = e.id
       WHERE uec.user_id = $1
       ORDER BY uec.status = 'active' DESC, uec.connected_at DESC`,
      [userId]
    )

    return {
      success: true,
      data: result.rows.map(r => ({
        connectionId: r.id,
        enterprise: {
          id: r.enterprise_id,
          name: r.enterprise_name,
          logo: r.enterprise_logo,
          plan: r.plan
        },
        enterpriseClaw: {
          id: r.enterprise_claw_id,
          connected: !!r.enterprise_claw_id
        },
        role: r.role,
        department: r.department,
        jobTitle: r.job_title,
        employeeNumber: r.employee_number,
        joinedAt: r.joined_at,
        connection: {
          status: r.status,
          connectedAt: r.connected_at,
          disconnectedAt: r.disconnected_at
        },
        claw: {
          connectionStatus: r.connection_status,
          health: r.claw_health,
          lastActive: r.last_active_at,
          syncStatus: r.sync_status
        },
        onboarding: {
          completed: parseInt(r.onboarding_completed),
          total: parseInt(r.onboarding_total),
          rate: r.onboarding_total > 0 
            ? Math.round((parseInt(r.onboarding_completed) / parseInt(r.onboarding_total)) * 100) 
            : 0
        }
      }))
    }
  })

  // ========================================
  // 【触手档案】申请加入企业（触手发起）
  // ========================================
  fastify.post('/me/connections/apply', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['触手档案'],
      summary: '申请加入企业（触手发起连接请求）',
      body: {
        type: 'object',
        required: ['enterpriseId'],
        properties: {
          enterpriseId: { type: 'string' },
          message: { type: 'string' },
          applyRole: { type: 'string', enum: ['member', 'admin', 'guest'] }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId, message, applyRole = 'member' } = request.body as any

    // 检查企业是否存在
    const enterprise = await fastify.db.query(
      'SELECT id, name, require_approval FROM enterprises WHERE id = $1',
      [enterpriseId]
    )

    if (enterprise.rows.length === 0) {
      return { success: false, error: '企业不存在' }
    }

    // 检查是否已有连接
    const existing = await fastify.db.query(
      `SELECT id, status FROM user_enterprise_connections 
       WHERE user_id = $1 AND enterprise_id = $2`,
      [userId, enterpriseId]
    )

    if (existing.rows.length > 0) {
      if (existing.rows[0].status === 'active') {
        return { success: false, error: '您已是该企业成员' }
      }
      // 重新激活
      await fastify.db.query(
        `UPDATE user_enterprise_connections 
         SET status = 'active', disconnected_at = NULL, connected_at = NOW()
         WHERE id = $1`,
        [existing.rows[0].id]
      )

      // 重新连接触手
      await reconnectClaw(fastify, userId, enterpriseId)

      return { success: true, message: '已重新连接到该企业', reconnected: true }
    }

    // 检查是否有待处理申请
    const pending = await fastify.db.query(
      `SELECT id FROM enterprise_join_requests 
       WHERE user_id = $1 AND enterprise_id = $2 AND status = 'pending'`,
      [userId, enterpriseId]
    )

    if (pending.rows.length > 0) {
      return { success: false, error: '您已有待处理的申请' }
    }

    // 如果企业不需要审批，直接连接
    if (!enterprise.rows[0].require_approval) {
      return await createDirectConnection(fastify, userId, enterpriseId, applyRole)
    }

    // 创建申请
    const requestId = uuidv4()
    await fastify.db.query(
      `INSERT INTO enterprise_join_requests 
       (id, enterprise_id, user_id, apply_role, message)
       VALUES ($1, $2, $3, $4, $5)`,
      [requestId, enterpriseId, userId, applyRole, message]
    )

    // 记录生命周期
    await fastify.db.query(
      `INSERT INTO employee_lifecycle_records 
       (id, employee_id, enterprise_id, event_type, event_name, event_date, action_taken, action_details)
       VALUES ($1, $2, $3, 'apply_request', '提交加入申请', CURRENT_DATE, 'pending', $4)`,
      [uuidv4(), userId, enterpriseId, JSON.stringify({ requestId, message })]
    )

    // 通知企业管理员（通过 Claw）
    await notifyEnterpriseClaw(fastify, enterpriseId, userId, 'new_application', {
      message: `新员工 ${userId} 申请加入企业`
    })

    return {
      success: true,
      message: '申请已提交，等待企业管理员审批',
      data: {
        requestId,
        requiresApproval: true
      }
    }
  })

  // ========================================
  // 【触手档案】主动断开与企业连接（离职）
  // ========================================
  fastify.post('/me/connections/:enterpriseId/disconnect', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['触手档案'],
      summary: '主动断开与企业连接（离职）'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any

    const conn = await fastify.db.query(
      `SELECT uec.*, em.role
       FROM user_enterprise_connections uec
       LEFT JOIN enterprise_members em ON em.enterprise_id = uec.enterprise_id AND em.user_id = uec.user_id
       WHERE uec.user_id = $1 AND uec.enterprise_id = $2`,
      [userId, enterpriseId]
    )

    if (conn.rows.length === 0) {
      return reply.status(404).send({ error: '连接不存在' })
    }

    if (conn.rows[0].status !== 'active') {
      return { success: false, error: '连接已断开' }
    }

    if (conn.rows[0].role === 'owner') {
      return reply.status(403).send({ error: '企业所有者不能直接退出，请先转让所有权' })
    }

    // 执行断开
    await fastify.db.query(
      `UPDATE user_enterprise_connections 
       SET status = 'inactive', disconnected_at = NOW()
       WHERE user_id = $1 AND enterprise_id = $2`,
      [userId, enterpriseId]
    )

    // 断开触手连接
    await disconnectClaw(fastify, userId, enterpriseId)

    // 记录生命周期
    await fastify.db.query(
      `INSERT INTO employee_lifecycle_records 
       (id, employee_id, enterprise_id, event_type, event_name, event_date, action_taken)
       VALUES ($1, $2, $3, 'offboarding_initiated', '员工发起离职', CURRENT_DATE, 'disconnected')`,
      [uuidv4(), userId, enterpriseId]
    )

    // 通知企业 Claw
    await notifyEnterpriseClaw(fastify, enterpriseId, userId, 'employee_disconnected', {
      message: '员工主动断开与企业连接',
      type: 'voluntary'
    })

    return {
      success: true,
      message: '已断开与企业连接',
      tips: '您的个人数据（简历、技能、工作经历）仍保存在您的触手（个人Claw）中。公司的入职资料如有需要可联系管理员导出。'
    }
  })

  // ========================================
  // 【触手档案】我的入职进度
  // ========================================
  fastify.get('/me/onboarding', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['触手档案'],
      summary: '获取我的入职进度（可指定企业）'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.query as any

    let query = `
      SELECT eot.*,
             u.name as approved_by_name,
             e.name as enterprise_name
      FROM employee_onboarding_tasks eot
      JOIN enterprises e ON e.id = eot.enterprise_id
      LEFT JOIN users u ON u.id = eot.approved_by
      WHERE eot.employee_id = $1
    `
    const params: any[] = [userId]

    if (enterpriseId) {
      params.push(enterpriseId)
      query += ` AND eot.enterprise_id = $${params.length}`
    }

    query += ' ORDER BY eot.category, eot.due_days'

    const result = await fastify.db.query(query, params)

    // 分类统计
    const byCategory: Record<string, { total: number, completed: number }> = {}
    result.rows.forEach(task => {
      if (!byCategory[task.category]) {
        byCategory[task.category] = { total: 0, completed: 0 }
      }
      byCategory[task.category].total++
      if (task.status === 'completed') {
        byCategory[task.category].completed++
      }
    })

    return {
      success: true,
      data: {
        tasks: result.rows.map(t => ({
          id: t.id,
          enterpriseId: t.enterprise_id,
          enterpriseName: t.enterprise_name,
          itemId: t.item_id,
          title: t.title,
          description: t.description,
          category: t.category,
          status: t.status,
          required: t.required,
          dueDate: t.due_date,
          completedAt: t.completed_at,
          submittedDocs: t.submitted_docs,
          needApproval: t.need_approval,
          approvedByName: t.approved_by_name,
          approvedAt: t.approved_at,
          clawSuggestion: t.claw_suggestion
        })),
        summary: {
          total: result.rows.length,
          completed: result.rows.filter(t => t.status === 'completed').length,
          inProgress: result.rows.filter(t => t.status === 'in_progress').length,
          pending: result.rows.filter(t => t.status === 'pending').length,
          byCategory,
          overallRate: result.rows.length > 0
            ? Math.round((result.rows.filter(t => t.status === 'completed').length / result.rows.length) * 100)
            : 0
        }
      }
    }
  })

  // ========================================
  // 【触手档案】完成入职任务
  // ========================================
  fastify.post('/me/onboarding/:taskId/complete', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['触手档案'],
      summary: '完成入职任务并提交材料',
      body: {
        type: 'object',
        properties: {
          submittedDocs: { type: 'array' },
          note: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { taskId } = request.params as any
    const { submittedDocs, note } = request.body as any

    const task = await fastify.db.query(
      `SELECT * FROM employee_onboarding_tasks 
       WHERE id = $1 AND employee_id = $2`,
      [taskId, userId]
    )

    if (task.rows.length === 0) {
      return reply.status(404).send({ error: '任务不存在' }
)
    }

    if (task.rows[0].status === 'completed') {
      return { success: false, error: '任务已完成' }
    }

    const newStatus = task.rows[0].need_approval ? 'pending' : 'completed'
    const completedAt = newStatus === 'completed' ? 'NOW()' : 'NULL'

    await fastify.db.query(
      `UPDATE employee_onboarding_tasks 
       SET status = $1, completed_at = ${completedAt}, submitted_docs = $2, updated_at = NOW()
       WHERE id = $3`,
      [newStatus, JSON.stringify(submittedDocs || []), taskId]
    )

    // 如果需要审批，通知企业
    if (newStatus === 'pending') {
      await notifyEnterpriseClaw(fastify, task.rows[0].enterprise_id, userId, 'onboarding_task_pending', {
        taskTitle: task.rows[0].title,
        taskId
      })
    }

    return {
      success: true,
      message: newStatus === 'completed' ? '任务已完成' : '已提交，等待审批',
      status: newStatus
    }
  })
}

// ============================================
// 辅助函数
// ============================================

async function syncSkillsToClaw(fastify: any, userId: string, skills: string[]) {
  // 同步技能到 Claw 知识图谱
  for (const skill of skills) {
    await fastify.db.query(
      `INSERT INTO personal_knowledge_nodes (id, user_id, node_type, name, metadata)
       VALUES ($1, $2, 'skill', $3, $4)
       ON CONFLICT (user_id, node_type, name) DO UPDATE SET
         metadata = personal_knowledge_nodes.metadata || EXCLUDED.metadata,
         updated_at = NOW()`,
      [uuidv4(), userId, skill, JSON.stringify({ source: 'resume', syncedAt: new Date() })]
    )
  }
}

async function syncWorkExperienceToClaw(fastify: any, userId: string, experiences: any[]) {
  for (const exp of experiences) {
    await fastify.db.query(
      `INSERT INTO personal_knowledge_nodes (id, user_id, node_type, name, metadata)
       VALUES ($1, $2, 'work_experience', $3, $4)
       ON CONFLICT (user_id, node_type, name) DO UPDATE SET
         metadata = EXCLUDED.metadata, updated_at = NOW()`,
      [uuidv4(), userId, exp.company || '未知公司', JSON.stringify({ ...exp, source: 'resume' })]
    )
  }
}

async function notifyCompanyClaw(fastify: any, userId: string, event: string, data: any) {
  // 通知企业 Claw（如果有活跃连接）
  await fastify.db.query(
    `INSERT INTO claw_suggestions (id, user_id, suggestion_type, title, content, priority)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [uuidv4(), userId, 'profile_sync', '简历已更新', `您已更新简历，技能数据已同步到个人Claw`, 3]
  )
}

async function createDirectConnection(fastify: any, userId: string, enterpriseId: string, role: string) {
  // 直接创建连接（不需要审批）
  const personalClaw = await fastify.db.query(
    'SELECT id FROM personal_claws WHERE user_id = $1',
    [userId]
  )
  const enterpriseClaw = await fastify.db.query(
    'SELECT id FROM enterprise_claws WHERE enterprise_id = $1',
    [enterpriseId]
  )

  const connId = uuidv4()
  await fastify.db.query(
    `INSERT INTO user_enterprise_connections 
     (id, user_id, enterprise_id, status, personal_claw_id, enterprise_claw_id)
     VALUES ($1, $2, $3, 'active', $4, $5)`,
    [connId, userId, enterpriseId, personalClaw.rows[0]?.id, enterpriseClaw.rows[0]?.id]
  )

  // 创建企业成员
  await fastify.db.query(
    `INSERT INTO enterprise_members (id, enterprise_id, user_id, role, status)
     VALUES ($1, $2, $3, $4, 'active')`,
    [uuidv4(), enterpriseId, userId, role]
  )

  // 连接触手
  await reconnectClaw(fastify, userId, enterpriseId)

  // 记录生命周期
  await fastify.db.query(
    `INSERT INTO employee_lifecycle_records 
     (id, employee_id, enterprise_id, event_type, event_name, event_date, action_taken)
     VALUES ($1, $2, $3, 'onboarding_day', '入职日', CURRENT_DATE, 'connected')`,
    [uuidv4(), userId, enterpriseId]
  )

  return {
    success: true,
    message: '已成功加入企业，触手已连接',
    data: { connectionId: connId }
  }
}

async function reconnectClaw(fastify: any, userId: string, enterpriseId: string) {
  const personalClaw = await fastify.db.query(
    'SELECT id FROM personal_claws WHERE user_id = $1',
    [userId]
  )
  const enterpriseClaw = await fastify.db.query(
    'SELECT id FROM enterprise_claws WHERE enterprise_id = $1',
    [enterpriseId]
  )

  if (personalClaw.rows.length && enterpriseClaw.rows.length) {
    await fastify.db.query(
      `INSERT INTO claw_connection_status 
       (id, enterprise_claw_id, enterprise_id, personal_claw_id, user_id, connection_status, last_active_at)
       VALUES ($1, $2, $3, $4, $5, 'connected', NOW())
       ON CONFLICT (enterprise_claw_id, personal_claw_id) DO UPDATE SET
         connection_status = 'connected',
         last_active_at = NOW(),
         updated_at = NOW()`,
      [uuidv4(), enterpriseClaw.rows[0].id, enterpriseId, personalClaw.rows[0].id, userId]
    )
  }
}

async function disconnectClaw(fastify: any, userId: string, enterpriseId: string) {
  await fastify.db.query(
    `UPDATE claw_connection_status 
     SET connection_status = 'disconnected', updated_at = NOW()
     WHERE user_id = $1 AND enterprise_id = $2`,
    [userId, enterpriseId]
  )

  // 记录同步日志
  const conn = await fastify.db.query(
    `SELECT personal_claw_id, enterprise_claw_id FROM user_enterprise_connections 
     WHERE user_id = $1 AND enterprise_id = $2`,
    [userId, enterpriseId]
  )

  if (conn.rows.length) {
    await fastify.db.query(
      `INSERT INTO info_sync_logs 
       (id, user_id, enterprise_id, personal_claw_id, enterprise_claw_id, direction, data_type, status)
       VALUES ($1, $2, $3, $4, $5, 'personal_to_company', 'disconnect', 'success')`,
      [uuidv4(), userId, enterpriseId, conn.rows[0].personal_claw_id, conn.rows[0].enterprise_claw_id]
    )
  }
}

async function notifyEnterpriseClaw(fastify: any, enterpriseId: string, userId: string, event: string, data: any) {
  // 通过 Claw 建议系统通知企业管理员
  const admins = await fastify.db.query(
    `SELECT em.user_id FROM enterprise_members em 
     WHERE em.enterprise_id = $1 AND em.role IN ('owner', 'admin')`,
    [enterpriseId]
  )

  const eventTitles: Record<string, string> = {
    new_application: '新成员申请',
    onboarding_task_pending: '入职任务待审批',
    employee_disconnected: '成员断开连接'
  }

  for (const admin of admins.rows) {
    await fastify.db.query(
      `INSERT INTO claw_suggestions (id, user_id, suggestion_type, title, content, priority)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), admin.user_id, 'enterprise_notification', eventTitles[event] || event, 
       data.message || JSON.stringify(data), event === 'employee_disconnected' ? 9 : 5]
    )
  }
}

export default employeeProfileRoutes
