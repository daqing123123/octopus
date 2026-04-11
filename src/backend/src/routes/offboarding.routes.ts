import { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

// ================================================
// 离职阶段功能路由
// 功能：
// 1. 智能交接清单
// 2. 一键权限回收
// 3. 数据导出
// 4. 离职满意度调查
// 5. 经验带走
// ================================================

export default async function offboardingRoutes(fastify: FastifyInstance) {
  // 所有路由需要认证
  fastify.addHook('preHandler', fastify.authenticate)

  // ================================================
  // 交接清单模板管理
  // ================================================

  // 获取企业交接清单模板
  fastify.get('/enterprises/:enterpriseId/offboarding/templates', {
    schema: {
      tags: ['离职管理'],
      summary: '获取交接清单模板列表',
      params: {
        type: 'object',
        properties: {
          enterpriseId: { type: 'string', format: 'uuid' }
        }
      }
    }
  }, async (request) => {
    const { enterpriseId } = request.params as { enterpriseId: string }

    const templates = await fastify.db.query(
      `SELECT t.*, 
              (SELECT COUNT(*) FROM offboarding_checklist_template_items WHERE template_id = t.id) as item_count
       FROM offboarding_checklist_templates t
       WHERE t.enterprise_id = $1 OR t.is_system = TRUE
       ORDER BY t.is_system DESC, t.created_at DESC`,
      [enterpriseId]
    )

    return { success: true, data: templates.rows }
  })

  // 获取模板详情（含模板项）
  fastify.get('/offboarding/templates/:templateId', {
    schema: {
      tags: ['离职管理'],
      summary: '获取模板详情'
    }
  }, async (request) => {
    const { templateId } = request.params as { templateId: string }

    const template = await fastify.db.query(
      `SELECT * FROM offboarding_checklist_templates WHERE id = $1`,
      [templateId]
    )

    if (template.rows.length === 0) {
      return { success: false, error: '模板不存在' }
    }

    const items = await fastify.db.query(
      `SELECT * FROM offboarding_checklist_template_items
       WHERE template_id = $1 ORDER BY order_index`,
      [templateId]
    )

    return {
      success: true,
      data: {
        ...template.rows[0],
        items: items.rows
      }
    }
  })

  // 创建交接清单模板
  fastify.post('/enterprises/:enterpriseId/offboarding/templates', {
    schema: {
      tags: ['离职管理'],
      summary: '创建交接清单模板',
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                itemType: { type: 'string' },
                priority: { type: 'integer' },
                assigneeType: { type: 'string' },
                estimatedMinutes: { type: 'integer' },
                requiresApproval: { type: 'boolean' }
              }
            }
          }
        }
      }
    }
  }, async (request) => {
    const { enterpriseId } = request.params as { enterpriseId: string }
    const { name, description, category, items } = request.body as any
    const userId = (request.user as any).userId

    const templateId = uuidv4()

    await fastify.db.query(
      `INSERT INTO offboarding_checklist_templates 
       (id, enterprise_id, name, description, category, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [templateId, enterpriseId, name, description, category || 'general', userId]
    )

    // 添加模板项
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        await fastify.db.query(
          `INSERT INTO offboarding_checklist_template_items 
           (id, template_id, title, description, item_type, priority, assignee_type, estimated_minutes, requires_approval, order_index)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [uuidv4(), templateId, item.title, item.description, item.itemType, item.priority || 3,
           item.assigneeType || 'manager', item.estimatedMinutes || 30, item.requiresApproval || false, i]
        )
      }
    }

    return { success: true, data: { id: templateId, name }, message: '模板创建成功' }
  })

  // ================================================
  // 员工离职交接清单
  // ================================================

  // 发起离职交接流程（自动生成清单）
  fastify.post('/offboarding/initiate', {
    schema: {
      tags: ['离职管理'],
      summary: '发起离职交接流程',
      body: {
        type: 'object',
        properties: {
          enterpriseId: { type: 'string' },
          connectionId: { type: 'string' },
          templateId: { type: 'string' },
          customItems: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                itemType: { type: 'string' },
                priority: { type: 'integer' }
              }
            }
          }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId, connectionId, templateId, customItems } = request.body as any

    // 检查是否已有进行中的交接清单
    const existing = await fastify.db.query(
      `SELECT id FROM employee_offboarding_checklists
       WHERE employee_id = $1 AND enterprise_id = $2 AND status = 'pending'`,
      [userId, enterpriseId]
    )

    if (existing.rows.length > 0) {
      return { success: false, error: '您已有进行中的离职交接流程' }
    }

    const checklistId = uuidv4()
    const now = new Date()

    // 确定模板ID
    let finalTemplateId = templateId
    if (!finalTemplateId) {
      // 尝试查找通用模板
      const defaultTemplate = await fastify.db.query(
        `SELECT id FROM offboarding_checklist_templates
         WHERE (enterprise_id = $1 OR is_system = TRUE)
         ORDER BY is_system ASC LIMIT 1`,
        [enterpriseId]
      )
      if (defaultTemplate.rows.length > 0) {
        finalTemplateId = defaultTemplate.rows[0].id
      }
    }

    // 获取模板信息
    let title = '离职交接清单'
    if (finalTemplateId) {
      const template = await fastify.db.query(
        `SELECT name FROM offboarding_checklist_templates WHERE id = $1`,
        [finalTemplateId]
      )
      if (template.rows.length > 0) {
        title = `${template.rows[0].name} - ${new Date().toLocaleDateString()}`
      }
    }

    // 创建交接清单
    await fastify.db.query(
      `INSERT INTO employee_offboarding_checklists
       (id, employee_id, enterprise_id, template_id, connection_id, title, start_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [checklistId, userId, enterpriseId, finalTemplateId, connectionId, title, now, userId]
    )

    // 从模板复制交接项
    if (finalTemplateId) {
      const templateItems = await fastify.db.query(
        `SELECT * FROM offboarding_checklist_template_items WHERE template_id = $1 ORDER BY order_index`,
        [finalTemplateId]
      )

      for (let i = 0; i < templateItems.rows.length; i++) {
        const tItem = templateItems.rows[i]
        await fastify.db.query(
          `INSERT INTO offboarding_checklist_items
           (id, checklist_id, template_item_id, title, description, item_type, priority, assignee_type, estimated_minutes, requires_approval, order_index)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [uuidv4(), checklistId, tItem.id, tItem.title, tItem.description, tItem.item_type,
           tItem.priority, tItem.assignee_type, tItem.estimated_minutes, tItem.requires_approval, i]
        )
      }
    }

    // 添加自定义项
    if (customItems && customItems.length > 0) {
      const currentItems = await fastify.db.query(
        `SELECT MAX(order_index) as max_order FROM offboarding_checklist_items WHERE checklist_id = $1`,
        [checklistId]
      )
      let orderIndex = (currentItems.rows[0]?.max_order || 0) + 1

      for (const item of customItems) {
        await fastify.db.query(
          `INSERT INTO offboarding_checklist_items
           (id, checklist_id, title, description, item_type, priority, order_index)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [uuidv4(), checklistId, item.title, item.description, item.itemType || 'task', item.priority || 3, orderIndex++]
        )
      }
    }

    // 创建离职满意度调查
    await fastify.db.query(
      `INSERT INTO offboarding_surveys (id, enterprise_id, employee_id, checklist_id, survey_type)
       VALUES ($1, $2, $3, $4, 'exit')`,
      [uuidv4(), enterpriseId, userId, checklistId]
    )

    // 创建数据导出记录
    await fastify.db.query(
      `INSERT INTO data_export_records (id, employee_id, enterprise_id, checklist_id, export_type, file_format)
       VALUES ($1, $2, $3, $4, 'all', 'zip')`,
      [uuidv4(), userId, enterpriseId, checklistId]
    )

    return {
      success: true,
      data: { checklistId, title },
      message: '离职交接流程已发起，系统已自动生成交接清单'
    }
  })

  // 获取当前用户的离职交接清单
  fastify.get('/offboarding/my-checklist', {
    schema: {
      tags: ['离职管理'],
      summary: '获取我的离职交接清单'
    }
  }, async (request) => {
    const userId = (request.user as any).userId

    const checklist = await fastify.db.query(
      `SELECT c.*, e.name as enterprise_name,
              (SELECT COUNT(*) FROM offboarding_checklist_items WHERE checklist_id = c.id) as total_items,
              (SELECT COUNT(*) FROM offboarding_checklist_items WHERE checklist_id = c.id AND status = 'completed') as completed_items
       FROM employee_offboarding_checklists c
       JOIN enterprises e ON e.id = c.enterprise_id
       WHERE c.employee_id = $1 AND c.status IN ('pending', 'in_progress')
       ORDER BY c.created_at DESC LIMIT 1`,
      [userId]
    )

    if (checklist.rows.length === 0) {
      return { success: true, data: null, message: '暂无离职交接清单' }
    }

    // 获取清单项
    const items = await fastify.db.query(
      `SELECT i.*, u.name as assignee_name
       FROM offboarding_checklist_items i
       LEFT JOIN users u ON u.id = i.assignee_id
       WHERE i.checklist_id = $1
       ORDER BY i.priority ASC, i.order_index`,
      [checklist.rows[0].id]
    )

    return {
      success: true,
      data: {
        ...checklist.rows[0],
        items: items.rows
      }
    }
  })

  // 获取企业所有离职交接清单（管理员视图）
  fastify.get('/enterprises/:enterpriseId/offboarding/checklists', {
    schema: {
      tags: ['离职管理'],
      summary: '获取企业所有离职交接清单（管理员）'
    }
  }, async (request) => {
    const { enterpriseId } = request.params as { enterpriseId: string }
    const { status } = request.query as { status?: string }

    let query = `
      SELECT c.*, u.name as employee_name, u.email as employee_email,
             (SELECT COUNT(*) FROM offboarding_checklist_items WHERE checklist_id = c.id) as total_items,
             (SELECT COUNT(*) FROM offboarding_checklist_items WHERE checklist_id = c.id AND status = 'completed') as completed_items
      FROM employee_offboarding_checklists c
      JOIN users u ON u.id = c.employee_id
      WHERE c.enterprise_id = $1
    `
    const params: any[] = [enterpriseId]

    if (status) {
      query += ` AND c.status = $2`
      params.push(status)
    }

    query += ` ORDER BY c.created_at DESC`

    const checklists = await fastify.db.query(query, params)

    return { success: true, data: checklists.rows }
  })

  // 更新交接项状态
  fastify.patch('/offboarding/items/:itemId/status', {
    schema: {
      tags: ['离职管理'],
      summary: '更新交接项状态',
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'verified'] },
          completedBy: { type: 'string' },
          verificationNotes: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { itemId } = request.params as { itemId: string }
    const { status, completedBy, verificationNotes } = request.body as any
    const userId = (request.user as any).userId

    const updates: string[] = ['status = $1']
    const params: any[] = [status]

    if (status === 'completed') {
      updates.push('completed_at = NOW()')
      updates.push('completed_by = $' + (params.length + 1))
      params.push(completedBy || userId)
    }

    if (verificationNotes) {
      updates.push('verification_notes = $' + (params.length + 1))
      params.push(verificationNotes)
    }

    updates.push('updated_at = NOW()')
    params.push(itemId)

    await fastify.db.query(
      `UPDATE offboarding_checklist_items SET ${updates.join(', ')} WHERE id = $${params.length}`,
      params
    )

    // 检查清单是否全部完成
    const item = await fastify.db.query(
      `SELECT checklist_id FROM offboarding_checklist_items WHERE id = $1`,
      [itemId]
    )

    if (item.rows.length > 0) {
      const checklistId = item.rows[0].checklist_id
      const pending = await fastify.db.query(
        `SELECT COUNT(*) FROM offboarding_checklist_items 
         WHERE checklist_id = $1 AND status NOT IN ('completed', 'verified')`,
        [checklistId]
      )

      if (parseInt(pending.rows[0].count) === 0) {
        await fastify.db.query(
          `UPDATE employee_offboarding_checklists SET status = 'completed', complete_date = NOW() WHERE id = $1`,
          [checklistId]
        )
      }
    }

    return { success: true, message: '状态已更新' }
  })

  // 指派交接项
  fastify.patch('/offboarding/items/:itemId/assign', {
    schema: {
      tags: ['离职管理'],
      summary: '指派交接项',
      body: {
        type: 'object',
        required: ['assigneeId'],
        properties: {
          assigneeId: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { itemId } = request.params as { itemId: string }
    const { assigneeId } = request.body as { assigneeId: string }

    await fastify.db.query(
      `UPDATE offboarding_checklist_items SET assignee_id = $1, updated_at = NOW() WHERE id = $2`,
      [assigneeId, itemId]
    )

    return { success: true, message: '已指派' }
  })

  // ================================================
  // 权限回收
  // ================================================

  // 获取待回收权限列表
  fastify.get('/offboarding/:checklistId/permissions', {
    schema: {
      tags: ['离职管理'],
      summary: '获取待回收权限列表'
    }
  }, async (request) => {
    const { checklistId } = request.params as { checklistId: string }

    // 从连接记录中获取员工拥有的权限
    const checklist = await fastify.db.query(
      `SELECT employee_id, enterprise_id FROM employee_offboarding_checklists WHERE id = $1`,
      [checklistId]
    )

    if (checklist.rows.length === 0) {
      return { success: false, error: '交接清单不存在' }
    }

    const { employee_id, enterprise_id } = checklist.rows[0]

    // 获取企业的权限配置
    const config = await fastify.db.query(
      `SELECT * FROM offboarding_permission_config WHERE enterprise_id = $1 AND enabled = TRUE`,
      [enterprise_id]
    )

    // 获取员工在各系统中的具体权限
    const permissions = await fastify.db.query(
      `SELECT * FROM offboarding_permission_revocations
       WHERE checklist_id = $1 ORDER BY permission_type`,
      [checklistId]
    )

    // 如果没有记录，生成待回收权限列表
    if (permissions.rows.length === 0) {
      const pendingPermissions: any[] = []
      
      for (const c of config.rows) {
        pendingPermissions.push({
          permission_type: c.permission_type,
          resource_name: getPermissionResourceName(c.permission_type),
          status: 'pending'
        })
      }

      return {
        success: true,
        data: {
          config: config.rows,
          permissions: pendingPermissions
        }
      }
    }

    return {
      success: true,
      data: {
        config: config.rows,
        permissions: permissions.rows
      }
    }
  })

  // 一键回收所有权限
  fastify.post('/offboarding/:checklistId/revoke-all', {
    schema: {
      tags: ['离职管理'],
      summary: '一键回收所有权限',
      body: {
        type: 'object',
        properties: {
          transferTo: { type: 'string' } // 可选：转移给谁
        }
      }
    }
  }, async (request) => {
    const { checklistId } = request.params as { checklistId: string }
    const { transferTo } = request.body as { transferTo?: string }
    const userId = (request.user as any).userId

    // 获取交接清单信息
    const checklist = await fastify.db.query(
      `SELECT employee_id, enterprise_id FROM employee_offboarding_checklists WHERE id = $1`,
      [checklistId]
    )

    if (checklist.rows.length === 0) {
      return { success: false, error: '交接清单不存在' }
    }

    const { employee_id, enterprise_id } = checklist.rows[0]

    // 获取权限配置
    const config = await fastify.db.query(
      `SELECT * FROM offboarding_permission_config WHERE enterprise_id = $1 AND enabled = TRUE`,
      [enterprise_id]
    )

    const results: any[] = []

    for (const c of config.rows) {
      try {
        // 执行权限回收（这里需要根据不同的权限类型调用不同的服务）
        await revokePermission(fastify, employee_id, enterprise_id, c.permission_type, transferTo)

        // 记录
        await fastify.db.query(
          `INSERT INTO offboarding_permission_revocations
           (id, checklist_id, employee_id, enterprise_id, permission_type, resource_name, previous_holder, revoked_by, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'completed')`,
          [uuidv4(), checklistId, employee_id, enterprise_id, c.permission_type,
           getPermissionResourceName(c.permission_type), transferTo, userId]
        )

        results.push({ type: c.permission_type, status: 'completed' })
      } catch (error: any) {
        await fastify.db.query(
          `INSERT INTO offboarding_permission_revocations
           (id, checklist_id, employee_id, enterprise_id, permission_type, resource_name, revoked_by, status, error_message)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'failed', $8)`,
          [uuidv4(), checklistId, employee_id, enterprise_id, c.permission_type,
           getPermissionResourceName(c.permission_type), userId, error.message]
        )

        results.push({ type: c.permission_type, status: 'failed', error: error.message })
      }
    }

    const successCount = results.filter(r => r.status === 'completed').length
    const failCount = results.filter(r => r.status === 'failed').length

    return {
      success: true,
      data: { results, successCount, failCount },
      message: `权限回收完成：成功 ${successCount} 项，失败 ${failCount} 项`
    }
  })

  // ================================================
  // 数据导出
  // ================================================

  // 获取导出记录
  fastify.get('/offboarding/exports', {
    schema: {
      tags: ['离职管理'],
      summary: '获取我的导出记录'
    }
  }, async (request) => {
    const userId = (request.user as any).userId

    const exports = await fastify.db.query(
      `SELECT * FROM data_export_records WHERE employee_id = $1 ORDER BY created_at DESC`,
      [userId]
    )

    return { success: true, data: exports.rows }
  })

  // 请求导出
  fastify.post('/offboarding/:checklistId/export', {
    schema: {
      tags: ['离职管理'],
      summary: '请求数据导出',
      body: {
        type: 'object',
        properties: {
          exportTypes: {
            type: 'array',
            items: { type: 'string', enum: ['documents', 'files', 'calendar', 'tasks', 'all'] }
          },
          fileFormat: { type: 'string', enum: ['zip', 'pdf', 'csv', 'json'], default: 'zip' }
        }
      }
    }
  }, async (request) => {
    const { checklistId } = request.params as { checklistId: string }
    const { exportTypes, fileFormat } = request.body as any
    const userId = (request.user as any).userId

    const checklist = await fastify.db.query(
      `SELECT employee_id, enterprise_id FROM employee_offboarding_checklists WHERE id = $1`,
      [checklistId]
    )

    if (checklist.rows.length === 0) {
      return { success: false, error: '交接清单不存在' }
    }

    // 创建导出记录
    const exportId = uuidv4()
    await fastify.db.query(
      `INSERT INTO data_export_records
       (id, employee_id, enterprise_id, checklist_id, export_type, file_format, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'processing')`,
      [exportId, checklist.rows[0].employee_id, checklist.rows[0].enterprise_id, checklistId,
       (exportTypes || ['all']).join(','), fileFormat || 'zip']
    )

    // TODO: 触发后台导出任务
    // 这里应该发送到消息队列处理

    return {
      success: true,
      data: { exportId },
      message: '导出任务已创建，请在稍后下载'
    }
  })

  // 下载导出文件
  fastify.get('/offboarding/exports/:exportId/download', {
    schema: {
      tags: ['离职管理'],
      summary: '下载导出文件'
    }
  }, async (request) => {
    const { exportId } = request.params as { exportId: string }
    const userId = (request.user as any).userId

    const exportRecord = await fastify.db.query(
      `SELECT * FROM data_export_records WHERE id = $1 AND employee_id = $2`,
      [exportId, userId]
    )

    if (exportRecord.rows.length === 0) {
      return { success: false, error: '导出记录不存在' }
    }

    const record = exportRecord.rows[0]

    if (record.status !== 'completed') {
      return { success: false, error: '导出尚未完成', status: record.status }
    }

    // 更新下载次数
    await fastify.db.query(
      `UPDATE data_export_records SET download_count = download_count + 1 WHERE id = $1`,
      [exportId]
    )

    // 返回下载链接
    return {
      success: true,
      data: {
        downloadUrl: record.file_url,
        expiresAt: record.download_expires_at
      }
    }
  })

  // ================================================
  // 离职满意度调查
  // ================================================

  // 获取我的离职调查
  fastify.get('/offboarding/survey', {
    schema: {
      tags: ['离职管理'],
      summary: '获取离职调查问卷'
    }
  }, async (request) => {
    const userId = (request.user as any).userId

    const survey = await fastify.db.query(
      `SELECT s.*, e.name as enterprise_name
       FROM offboarding_surveys s
       JOIN enterprises e ON e.id = s.enterprise_id
       WHERE s.employee_id = $1 AND s.status = 'pending'
       ORDER BY s.created_at DESC LIMIT 1`,
      [userId]
    )

    if (survey.rows.length === 0) {
      return { success: true, data: null }
    }

    // 获取预设问题
    const questions = await getExitSurveyQuestions(fastify)

    return {
      success: true,
      data: {
        ...survey.rows[0],
        questions
      }
    }
  })

  // 提交离职调查
  fastify.post('/offboarding/survey/:surveyId/submit', {
    schema: {
      tags: ['离职管理'],
      summary: '提交离职调查',
      body: {
        type: 'object',
        properties: {
          responses: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                questionId: { type: 'string' },
                answerType: { type: 'string' },
                ratingValue: { type: 'integer' },
                textValue: { type: 'string' },
                multipleChoiceValues: { type: 'array', items: { type: 'string' } }
              }
            }
          }
        }
      }
    }
  }, async (request) => {
    const { surveyId } = request.params as { surveyId: string }
    const { responses } = request.body as any
    const userId = (request.user as any).userId

    // 保存答案
    for (const r of responses) {
      await fastify.db.query(
        `INSERT INTO offboarding_survey_responses
         (id, survey_id, question_id, answer_type, rating_value, text_value, multiple_choice_values)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [uuidv4(), surveyId, r.questionId, r.answerType, r.ratingValue, r.textValue, r.multipleChoiceValues]
      )
    }

    // 更新调查状态
    await fastify.db.query(
      `UPDATE offboarding_surveys SET status = 'submitted', submitted_at = NOW() WHERE id = $1`,
      [surveyId]
    )

    return { success: true, message: '调查已提交，感谢您的反馈' }
  })

  // 获取企业离职调查统计（管理员）
  fastify.get('/enterprises/:enterpriseId/offboarding/surveys/stats', {
    schema: {
      tags: ['离职管理'],
      summary: '获取离职调查统计（管理员）'
    }
  }, async (request) => {
    const { enterpriseId } = request.params as { enterpriseId: string }

    const stats = await fastify.db.query(
      `SELECT 
         COUNT(*) FILTER (WHERE status = 'submitted') as submitted_count,
         COUNT(*) as total_count
       FROM offboarding_surveys WHERE enterprise_id = $1`,
      [enterpriseId]
    )

    // 获取评分统计
    const ratings = await fastify.db.query(
      `SELECT AVG(r.rating_value) as avg_rating, COUNT(*) as response_count
       FROM offboarding_survey_responses r
       JOIN offboarding_surveys s ON s.id = r.survey_id
       WHERE s.enterprise_id = $1 AND r.answer_type = 'rating'`,
      [enterpriseId]
    )

    return {
      success: true,
      data: {
        surveyStats: stats.rows[0],
        ratingStats: ratings.rows[0]
      }
    }
  })

  // ================================================
  // 经验带走
  // ================================================

  // 获取经验带走记录
  fastify.get('/offboarding/experience', {
    schema: {
      tags: ['离职管理'],
      summary: '获取我的经验带走记录'
    }
  }, async (request) => {
    const userId = (request.user as any).userId

    const experience = await fastify.db.query(
      `SELECT e.*, ent.name as enterprise_name
       FROM experience_transfer_records e
       JOIN enterprises ent ON ent.id = e.enterprise_id
       WHERE e.employee_id = $1
       ORDER BY e.created_at DESC`,
      [userId]
    )

    return { success: true, data: experience.rows }
  })

  // 创建/更新经验带走记录
  fastify.post('/offboarding/:checklistId/experience', {
    schema: {
      tags: ['离职管理'],
      summary: '创建/更新经验带走记录',
      body: {
        type: 'object',
        properties: {
          projectId: { type: 'string' },
          projectName: { type: 'string' },
          projectDescription: { type: 'string' },
          role: { type: 'string' },
          keyAchievements: { type: 'string' },
          skillsUsed: { type: 'array', items: { type: 'string' } },
          lessonsLearned: { type: 'string' },
          knowledgeDocs: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                content: { type: 'string' },
                tags: { type: 'array', items: { type: 'string' } }
              }
            }
          },
          contacts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                role: { type: 'string' },
                contact: { type: 'string' }
              }
            }
          },
          processDocs: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                description: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request) => {
    const { checklistId } = request.params as { checklistId: string }
    const userId = (request.user as any).userId
    const data = request.body as any

    // 检查是否已有记录
    const existing = await fastify.db.query(
      `SELECT id FROM experience_transfer_records 
       WHERE checklist_id = $1 OR (employee_id = $2 AND enterprise_id IN (
         SELECT enterprise_id FROM employee_offboarding_checklists WHERE id = $1
       ))`,
      [checklistId, userId]
    )

    let experienceId: string

    if (existing.rows.length > 0) {
      experienceId = existing.rows[0].id
      await fastify.db.query(
        `UPDATE experience_transfer_records SET
         project_id = $1, project_name = $2, project_description = $3, role = $4,
         key_achievements = $5, skills_used = $6, lessons_learned = $7,
         knowledge_docs = $8, contacts = $9, process_docs = $10,
         updated_at = NOW()
         WHERE id = $11`,
        [data.projectId, data.projectName, data.projectDescription, data.role,
         data.keyAchievements, JSON.stringify(data.skillsUsed || []),
         data.lessonsLearned, JSON.stringify(data.knowledgeDocs || []),
         JSON.stringify(data.contacts || []), JSON.stringify(data.processDocs || []),
         experienceId]
      )
    } else {
      const checklist = await fastify.db.query(
        `SELECT enterprise_id FROM employee_offboarding_checklists WHERE id = $1`,
        [checklistId]
      )

      experienceId = uuidv4()
      await fastify.db.query(
        `INSERT INTO experience_transfer_records
         (id, employee_id, enterprise_id, checklist_id, project_name, project_description,
          role, key_achievements, skills_used, lessons_learned, knowledge_docs, contacts, process_docs)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [experienceId, userId, checklist.rows[0]?.enterprise_id, checklistId,
         data.projectName, data.projectDescription, data.role, data.keyAchievements,
         JSON.stringify(data.skillsUsed || []), data.lessonsLearned,
         JSON.stringify(data.knowledgeDocs || []), JSON.stringify(data.contacts || []),
         JSON.stringify(data.processDocs || [])]
      )
    }

    return { success: true, data: { id: experienceId }, message: '经验已保存' }
  })

  // 同步经验到个人记忆（Claw）
  fastify.post('/offboarding/experience/:experienceId/sync-to-memory', {
    schema: {
      tags: ['离职管理'],
      summary: '同步经验到个人记忆'
    }
  }, async (request) => {
    const { experienceId } = request.params as { experienceId: string }
    const userId = (request.user as any).userId

    const experience = await fastify.db.query(
      `SELECT * FROM experience_transfer_records WHERE id = $1 AND employee_id = $2`,
      [experienceId, userId]
    )

    if (experience.rows.length === 0) {
      return { success: false, error: '经验记录不存在' }
    }

    const exp = experience.rows[0]

    // 解析JSON字段
    const knowledgeDocs = typeof exp.knowledge_docs === 'string' 
      ? JSON.parse(exp.knowledge_docs) : (exp.knowledge_docs || [])
    const contacts = typeof exp.contacts === 'string'
      ? JSON.parse(exp.contacts) : (exp.contacts || [])
    const processDocs = typeof exp.process_docs === 'string'
      ? JSON.parse(exp.process_docs) : (exp.process_docs || [])

    // 创建个人记忆
    const memoryId = uuidv4()
    const memoryContent = `
项目经验：${exp.project_name}
角色：${exp.role}
关键成就：${exp.key_achievements}
经验教训：${exp.lessons_learned}
用到的技能：${(exp.skills_used || []).join(', ')}
重要联系人：${contacts.map((c: any) => `${c.name}(${c.role})`).join(', ')}
文档：${knowledgeDocs.map((d: any) => d.title).join(', ')}
    `.trim()

    await fastify.db.query(
      `INSERT INTO user_memories
       (id, user_id, memory_type, content, importance_score, is_pinned)
       VALUES ($1, $2, 'work_experience', $3, 5, TRUE)`,
      [memoryId, userId, memoryContent]
    )

    // 更新状态
    await fastify.db.query(
      `UPDATE experience_transfer_records 
       SET status = 'synced', synced_to_memory_at = NOW() 
       WHERE id = $1`,
      [experienceId]
    )

    // 同步技能
    if (exp.skills_used && Array.isArray(exp.skills_used)) {
      for (const skill of exp.skills_used) {
        // 检查是否已存在
        const existingSkill = await fastify.db.query(
          `SELECT id FROM user_skills WHERE user_id = $1 AND skill_name = $2`,
          [userId, skill]
        )

        if (existingSkill.rows.length === 0) {
          await fastify.db.query(
            `INSERT INTO user_skills (id, user_id, skill_name, source)
             VALUES ($1, $2, $3, 'experience_transfer')`,
            [uuidv4(), userId, skill]
          )
        }
      }
    }

    return {
      success: true,
      data: { memoryId },
      message: '经验已同步到个人记忆，可在新公司继续使用'
    }
  })

  // 完成离职流程（最终确认）
  fastify.post('/offboarding/:checklistId/complete', {
    schema: {
      tags: ['离职管理'],
      summary: '完成离职流程'
    }
  }, async (request) => {
    const { checklistId } = request.params as { checklistId: string }
    const userId = (request.user as any).userId

    // 检查交接清单是否全部完成
    const pending = await fastify.db.query(
      `SELECT COUNT(*) FROM offboarding_checklist_items
       WHERE checklist_id = $1 AND status NOT IN ('completed', 'verified')`,
      [checklistId]
    )

    if (parseInt(pending.rows[0].count) > 0) {
      return { 
        success: false, 
        error: `还有 ${pending.rows[0].count} 项交接未完成`,
        pendingCount: parseInt(pending.rows[0].count)
      }
    }

    // 更新状态
    await fastify.db.query(
      `UPDATE employee_offboarding_checklists 
       SET status = 'completed', complete_date = NOW() 
       WHERE id = $1`,
      [checklistId]
    )

    // 断开企业连接
    const checklist = await fastify.db.query(
      `SELECT connection_id FROM employee_offboarding_checklists WHERE id = $1`,
      [checklistId]
    )

    if (checklist.rows[0]?.connection_id) {
      await fastify.db.query(
        `UPDATE user_enterprise_connections 
         SET status = 'offboarded', offboarded_at = NOW() 
         WHERE id = $1`,
        [checklist.rows[0].connection_id]
      )
    }

    return {
      success: true,
      message: '离职流程已完成，您的个人数据和经验已保留在触手账户中'
    }
  })
}

// ================================================
// 辅助函数
// ================================================

function getPermissionResourceName(permissionType: string): string {
  const names: Record<string, string> = {
    'system_access': '系统访问权限',
    'file_access': '文件访问权限',
    'doc_access': '文档访问权限',
    'calendar_access': '日历访问权限',
    'task_management': '任务管理权限',
    'approval_authority': '审批权限',
    'team_management': '团队管理权限'
  }
  return names[permissionType] || permissionType
}

async function revokePermission(
  fastify: FastifyInstance,
  employeeId: string,
  enterpriseId: string,
  permissionType: string,
  transferTo?: string
): Promise<void> {
  // 根据不同的权限类型执行回收逻辑
  switch (permissionType) {
    case 'system_access':
      // 禁用系统账号
      await fastify.db.query(
        `UPDATE user_enterprise_connections 
         SET status = 'offboarded' 
         WHERE user_id = $1 AND enterprise_id = $2`,
        [employeeId, enterpriseId]
      )
      break

    case 'doc_access':
      // 移除文档协作权限
      await fastify.db.query(
        `DELETE FROM document_collaborators 
         WHERE user_id = $1 
         AND document_id IN (
           SELECT id FROM documents WHERE enterprise_id = $2
         )`,
        [employeeId, enterpriseId]
      )
      break

    case 'calendar_access':
      // 移除日历共享权限
      // TODO: 实现日历权限回收
      break

    case 'task_management':
      // 转移或移除任务所有权
      if (transferTo) {
        await fastify.db.query(
          `UPDATE tasks SET assigned_to = $1 WHERE assigned_to = $2 AND enterprise_id = $3`,
          [transferTo, employeeId, enterpriseId]
        )
      }
      break

    case 'approval_authority':
      // 移除审批权限
      await fastify.db.query(
        `DELETE FROM approval_flow_approvers WHERE user_id = $1`,
        [employeeId]
      )
      break

    case 'team_management':
      // 移除团队管理权限
      await fastify.db.query(
        `UPDATE teams SET leader_id = $1 WHERE leader_id = $2 AND enterprise_id = $3`,
        [transferTo || null, employeeId, enterpriseId]
      )
      break

    default:
      throw new Error(`未知权限类型: ${permissionType}`)
  }
}

async function getExitSurveyQuestions(fastify: FastifyInstance) {
  // 预设离职调查问题
  return [
    {
      id: 'q1',
      question: '您对公司的整体满意度如何？',
      type: 'rating',
      required: true
    },
    {
      id: 'q2',
      question: '您离职的主要原因是什么？',
      type: 'multiple_choice',
      options: ['职业发展', '薪酬福利', '工作环境', '人际关系', '个人原因', '其他'],
      required: true
    },
    {
      id: 'q3',
      question: '您对直属上级的管理方式满意吗？',
      type: 'rating',
      required: true
    },
    {
      id: 'q4',
      question: '您认为公司在哪些方面可以改进？',
      type: 'text',
      required: false
    },
    {
      id: 'q5',
      question: '您会推荐朋友来公司工作吗？',
      type: 'rating',
      required: true
    },
    {
      id: 'q6',
      question: '您对公司的培训和发展机会满意吗？',
      type: 'rating',
      required: false
    },
    {
      id: 'q7',
      question: '其他想说的话：',
      type: 'text',
      required: false
    }
  ]
}

export default offboardingRoutes
