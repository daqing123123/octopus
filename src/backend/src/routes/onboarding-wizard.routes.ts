'use strict'

import { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

// ============================================
// 入职向导路由 - 新员工7步引导体验
// ============================================

export default async function onboardingWizardRoutes(fastify: FastifyInstance) {

  // ----- 获取向导步骤列表 -----
  fastify.get('/me/onboarding-wizard', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['入职向导'],
      summary: '获取当前入职向导进度',
      querystring: {
        type: 'object',
        properties: { enterpriseId: { type: 'string' } }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.query as any

    if (!enterpriseId) return { success: false, error: '需要 enterpriseId' }

    // 获取企业默认向导模板
    const wizard = await fastify.db.query(
      `SELECT * FROM onboarding_wizards WHERE enterprise_id = $1 AND is_active = true AND is_default = true LIMIT 1`,
      [enterpriseId]
    )

    if (wizard.rows.length === 0) {
      return { success: false, error: '该企业未配置入职向导' }
    }

    const wizardData = wizard.rows[0]

    // 获取员工进度
    const progress = await fastify.db.query(
      `SELECT * FROM employee_wizard_progress WHERE wizard_id = $1 AND user_id = $2`,
      [wizardData.id, userId]
    )

    const userProgress = progress.rows[0] || {
      current_step: 1,
      completed_steps: [],
      step_data: {}
    }

    // 格式化步骤
    const steps = (wizardData.steps || []).map((s: any) => ({
      order: s.order,
      title: s.title,
      icon: s.icon,
      template: s.template,
      required: s.required,
      completed: (userProgress.completed_steps || []).includes(s.order),
      current: userProgress.current_step === s.order,
      data: (userProgress.step_data || {})[s.order] || null
    }))

    const completedCount = steps.filter((s: any) => s.completed).length

    return {
      success: true,
      data: {
        wizardId: wizardData.id,
        name: wizardData.name,
        icon: wizardData.icon,
        description: wizardData.description,
        estimatedMinutes: wizardData.estimated_minutes,
        currentStep: userProgress.current_step,
        totalSteps: steps.length,
        completedSteps: completedCount,
        progressPercent: Math.round((completedCount / steps.length) * 100),
        startedAt: userProgress.started_at,
        completedAt: userProgress.completed_at,
        satisfaction: userProgress.satisfaction_rating ? {
          rating: userProgress.satisfaction_rating,
          comment: userProgress.satisfaction_comment
        } : null,
        steps
      }
    }
  })

  // ----- 完成单个步骤 -----
  fastify.post('/me/onboarding-wizard/steps/:stepOrder/complete', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['入职向导'],
      summary: '完成入职向导步骤',
      body: {
        type: 'object',
        properties: {
          enterpriseId: { type: 'string' },
          data: { type: 'object' },
          nextStep: { type: 'integer' }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { stepOrder } = request.params as any
    const { enterpriseId, data, nextStep } = request.body as any

    // 获取向导
    const wizard = await fastify.db.query(
      `SELECT * FROM onboarding_wizards WHERE enterprise_id = $1 AND is_active = true LIMIT 1`,
      [enterpriseId]
    )

    if (wizard.rows.length === 0) return { success: false, error: '向导不存在' }

    const wizardId = wizard.rows[0].id
    const wizardData = wizard.rows[0]
    const allSteps = wizardData.steps || []
    const totalSteps = allSteps.length
    const stepOrderNum = parseInt(stepOrder)

    // 获取或创建进度
    let progress = await fastify.db.query(
      `SELECT * FROM employee_wizard_progress WHERE wizard_id = $1 AND user_id = $2`,
      [wizardId, userId]
    )

    let progressId: string

    if (progress.rows.length === 0) {
      progressId = uuidv4()
      await fastify.db.query(
        `INSERT INTO employee_wizard_progress (id, wizard_id, user_id, enterprise_id, current_step, completed_steps, step_data, started_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [progressId, wizardId, userId, enterpriseId, stepOrderNum, JSON.stringify([stepOrderNum]), JSON.stringify({ [stepOrderNum]: data })]
      )
    } else {
      progressId = progress.rows[0].id
      const completed: number[] = progress.rows[0].completed_steps || []
      if (!completed.includes(stepOrderNum)) completed.push(stepOrderNum)

      const stepData: any = progress.rows[0].step_data || {}
      stepData[stepOrderNum] = data

      const completedAt = completed.length >= totalSteps ? 'NOW()' : 'NULL'
      await fastify.db.query(
        `UPDATE employee_wizard_progress SET 
         current_step = $1, completed_steps = $2, step_data = $3,
         completed_at = ${completedAt}
         WHERE id = $4`,
        [nextStep || (stepOrderNum + 1), JSON.stringify(completed), JSON.stringify(stepData), progressId]
      )
    }

    // 如果完成最后一步
    if (stepOrderNum >= totalSteps) {
      return {
        success: true,
        message: '🎉 入职向导已完成！',
        data: { completed: true, wizardId, progressId }
      }
    }

    return {
      success: true,
      message: `步骤 ${stepOrderNum} 已完成`,
      data: { completed: false, nextStep: nextStep || (stepOrderNum + 1) }
    }
  })

  // ----- 触手：获取入职任务清单 -----
  fastify.get('/me/onboarding-tasks', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['入职向导'],
      summary: '获取入职任务清单',
      querystring: { type: 'object', properties: { enterpriseId: { type: 'string' } } }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.query as any

    if (!enterpriseId) return { success: false, error: '需要 enterpriseId' }

    const tasks = await fastify.db.query(
      `SELECT * FROM employee_onboarding_tasks 
       WHERE user_id = $1 AND enterprise_id = $2
       ORDER BY sort_order, created_at`,
      [userId, enterpriseId]
    )

    const completed = tasks.rows.filter(t => t.status === 'completed').length

    return {
      success: true,
      data: {
        tasks: tasks.rows.map(t => ({
          id: t.id, title: t.title, description: t.description,
          category: t.category, status: t.status,
          dueDate: t.due_date, completedAt: t.completed_at,
          proofUrls: t.proof_urls || []
        })),
        completed: completed,
        total: tasks.rows.length,
        progressPercent: tasks.rows.length > 0 ? Math.round((completed / tasks.rows.length) * 100) : 0
      }
    }
  })

  // ----- 触手：提交入职任务证明 -----
  fastify.post('/me/onboarding-tasks/:taskId/submit', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['入职向导'],
      summary: '提交入职任务证明',
      body: {
        type: 'object',
        properties: {
          notes: { type: 'string' },
          proofUrls: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { taskId } = request.params as any
    const { notes, proofUrls } = request.body as any

    const result = await fastify.db.query(
      `UPDATE employee_onboarding_tasks 
       SET status = 'submitted', proof_notes = $1, proof_urls = $2, submitted_at = NOW()
       WHERE id = $3 AND user_id = $4
       RETURNING id`,
      [notes, JSON.stringify(proofUrls || []), taskId, userId]
    )

    if (result.rows.length === 0) return { success: false, error: '任务不存在' }

    return { success: true, message: '已提交，等待审批' }
  })

  // ----- 大脑：获取入职向导模板 -----
  fastify.get('/enterprises/:eid/onboarding-wizards', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['入职向导'],
      summary: '获取企业入职向导模板列表'
    }
  }, async (request) => {
    const { eid } = request.params as any

    const result = await fastify.db.query(
      `SELECT ow.*, 
        (SELECT COUNT(*) FROM employee_wizard_progress ewp WHERE ewp.wizard_id = ow.id) as used_count,
        (SELECT COUNT(*) FROM employee_wizard_progress ewp WHERE ewp.wizard_id = ow.id AND ewp.completed_at IS NOT NULL) as completed_count
       FROM onboarding_wizards ow WHERE ow.enterprise_id = $1 AND ow.is_active = true
       ORDER BY ow.is_default DESC, ow.created_at DESC`,
      [eid]
    )

    return {
      success: true,
      data: result.rows.map(w => ({
        id: w.id, name: w.name, description: w.description, icon: w.icon,
        isDefault: w.is_default, estimatedMinutes: w.estimated_minutes,
        steps: w.steps, usedCount: parseInt(w.used_count), completedCount: parseInt(w.completed_count),
        createdAt: w.created_at
      }))
    }
  })

  // ----- 大脑：创建入职向导模板 -----
  fastify.post('/enterprises/:eid/onboarding-wizards', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['入职向导'],
      summary: '创建入职向导模板'
    }
  }, async (request) => {
    const { eid } = request.params as any
    const { name, description, icon, steps, estimatedMinutes, isDefault } = request.body as any

    if (isDefault) {
      await fastify.db.query(
        `UPDATE onboarding_wizards SET is_default = false WHERE enterprise_id = $1`,
        [eid]
      )
    }

    const wizardId = uuidv4()
    await fastify.db.query(
      `INSERT INTO onboarding_wizards (id, enterprise_id, name, description, icon, steps, estimated_minutes, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [wizardId, eid, name, description, icon || '🎯', JSON.stringify(steps || []), estimatedMinutes || 45, isDefault || false]
    )

    return { success: true, data: { id: wizardId }, message: '向导模板已创建' }
  })

  // ----- 大脑：为企业成员分配入职任务 -----
  fastify.post('/enterprises/:eid/onboarding/assign', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['入职向导'],
      summary: '为企业新成员分配入职任务',
      body: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string' },
          taskIds: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }, async (request) => {
    const { eid } = request.params as any
    const { userId, taskIds } = request.body as any

    if (taskIds && taskIds.length > 0) {
      for (const taskId of taskIds) {
        await fastify.db.query(
          `INSERT INTO employee_onboarding_tasks (user_id, enterprise_id, task_template_id)
           VALUES ($1, $2, $3)`,
          [userId, eid, taskId]
        )
      }
    }

    return { success: true, message: '入职任务已分配' }
  })

  // ----- 大脑：审批入职任务 -----
  fastify.post('/enterprises/:eid/onboarding/tasks/:taskId/review', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['入职向导'],
      summary: '审批入职任务',
      body: {
        type: 'object',
        required: ['approved'],
        properties: {
          approved: { type: 'boolean' },
          comment: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { eid, taskId } = request.params as any
    const { approved, comment } = request.body as any

    const status = approved ? 'completed' : 'rejected'
    await fastify.db.query(
      `UPDATE employee_onboarding_tasks SET status = $1, reviewer_comment = $2, reviewed_at = NOW()
       WHERE id = $3 AND enterprise_id = $4`,
      [status, comment, taskId, eid]
    )

    // 通知触手
    const task = await fastify.db.query(
      `SELECT user_id, title FROM employee_onboarding_tasks WHERE id = $1`,
      [taskId]
    )

    if (task.rows.length > 0) {
      await fastify.db.query(
        `INSERT INTO notifications (recipient_id, notification_type, title, content, source, source_enterprise_id, priority)
         VALUES ($1, $2, $3, $4, 'brain', $5, 6)`,
        [task.rows[0].user_id,
         approved ? 'onboarding_approved' : 'onboarding_rejected',
         approved ? '✅ 任务已通过' : '❌ 任务需补充',
         approved ? `您的任务"${task.rows[0].title}"已通过审批` : `任务"${task.rows[0].title}"需要补充：${comment}`,
         eid]
      )
    }

    return { success: true, message: approved ? '已通过' : '已退回' }
  })

  // ----- 触手：获取入职满意度评分 -----
  fastify.post('/me/onboarding-wizard/feedback', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['入职向导'],
      summary: '提交入职体验反馈',
      body: {
        type: 'object',
        properties: {
          enterpriseId: { type: 'string' },
          rating: { type: 'integer', minimum: 1, maximum: 5 },
          comment: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId, rating, comment } = request.body as any

    const wizard = await fastify.db.query(
      `SELECT id FROM onboarding_wizards WHERE enterprise_id = $1 LIMIT 1`,
      [enterpriseId]
    )

    if (wizard.rows.length > 0) {
      await fastify.db.query(
        `UPDATE employee_wizard_progress SET satisfaction_rating = $1, satisfaction_comment = $2
         WHERE wizard_id = $3 AND user_id = $4`,
        [rating, comment, wizard.rows[0].id, userId]
      )
    }

    return { success: true, message: '感谢您的反馈！' }
  })
}
