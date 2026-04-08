import { FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

const clawProactiveRoutes: FastifyPluginAsync = async (fastify) => {

  // ========================================
  // 智能提醒
  // ========================================

  // 获取提醒列表
  fastify.get('/reminders', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['智能提醒'],
      summary: '获取提醒列表',
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'completed', 'all'] },
          type: { type: 'string' },
          limit: { type: 'integer', default: 50 },
          offset: { type: 'integer', default: 0 }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { status = 'pending', type, limit = 50, offset = 0 } = request.query as any

    let statusFilter = ''
    if (status === 'pending') {
      statusFilter = `AND is_completed = FALSE AND (trigger_at IS NULL OR trigger_at <= NOW())`
    } else if (status === 'completed') {
      statusFilter = `AND is_completed = TRUE`
    }

    let typeFilter = type ? `AND reminder_type = '${type}'` : ''

    const reminders = await fastify.db.query(
      `SELECT id, reminder_type, title, description, due_at, trigger_at, is_recurring,
              recurring_pattern, source, is_completed, completed_at, snoozed_count, created_at
       FROM personal_reminders
       WHERE user_id = $1 ${statusFilter} ${typeFilter}
       ORDER BY COALESCE(trigger_at, due_at) ASC NULLS LAST
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    )

    const total = await fastify.db.query(
      `SELECT COUNT(*) FROM personal_reminders WHERE user_id = $1 ${statusFilter} ${typeFilter}`,
      [userId]
    )

    // 获取统计
    const stats = await fastify.db.query(
      `SELECT 
         COUNT(*) FILTER (WHERE is_completed = FALSE) as pending_count,
         COUNT(*) FILTER (WHERE is_completed = TRUE AND completed_at >= CURRENT_DATE) as today_completed,
         COUNT(*) FILTER (WHERE is_completed = FALSE AND due_at < NOW()) as overdue_count
       FROM personal_reminders WHERE user_id = $1`,
      [userId]
    )

    return {
      success: true,
      data: {
        reminders: reminders.rows.map((r: any) => ({
          id: r.id,
          type: r.reminder_type,
          title: r.title,
          description: r.description,
          dueAt: r.due_at,
          triggerAt: r.trigger_at,
          isRecurring: r.is_recurring,
          recurringPattern: r.recurring_pattern,
          source: r.source,
          isCompleted: r.is_completed,
          completedAt: r.completed_at,
          snoozedCount: r.snoozed_count,
          isOverdue: r.due_at && new Date(r.due_at) < new Date() && !r.is_completed
        })),
        stats: {
          pending: parseInt(stats.rows[0].pending_count),
          todayCompleted: parseInt(stats.rows[0].today_completed),
          overdue: parseInt(stats.rows[0].overdue_count)
        },
        total: parseInt(total.rows[0].count)
      }
    }
  })

  // 创建提醒
  fastify.post('/reminders', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['智能提醒'],
      summary: '创建提醒',
      body: {
        type: 'object',
        required: ['title', 'reminderType'],
        properties: {
          title: { type: 'string', maxLength: 200 },
          description: { type: 'string' },
          reminderType: { type: 'string', enum: ['follow_up', 'meeting', 'event', 'habit', 'checkin', 'deadline'] },
          dueAt: { type: 'string', format: 'date-time' },
          triggerAt: { type: 'string', format: 'date-time' },
          triggerConditions: { type: 'object' },
          isRecurring: { type: 'boolean', default: false },
          recurringPattern: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { title, description, reminderType, dueAt, triggerAt, triggerConditions, isRecurring, recurringPattern } = request.body as any

    const reminderId = uuidv4()
    await fastify.db.query(
      `INSERT INTO personal_reminders 
       (id, user_id, reminder_type, title, description, due_at, trigger_at, 
        trigger_conditions, is_recurring, recurring_pattern, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'manual')`,
      [reminderId, userId, reminderType, title, description || '', 
       dueAt || null, triggerAt || null, JSON.stringify(triggerConditions || {}),
       isRecurring || false, recurringPattern || null]
    )

    return { success: true, data: { id: reminderId }, message: '提醒已创建' }
  })

  // 完成提醒
  fastify.post('/reminders/:id/complete', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['智能提醒'], summary: '完成提醒' }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { id } = request.params as any

    const result = await fastify.db.query(
      `UPDATE personal_reminders SET is_completed = TRUE, completed_at = NOW()
       WHERE id = $1 AND user_id = $2 AND is_completed = FALSE
       RETURNING id`,
      [id, userId]
    )

    if (result.rows.length === 0) {
      return { success: false, error: '提醒不存在或已完成' }
    }

    return { success: true, message: '提醒已完成' }
  })

  // 稍后提醒（推迟）
  fastify.post('/reminders/:id/snooze', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['智能提醒'],
      summary: '稍后提醒',
      body: {
        type: 'object',
        required: ['snoozeUntil'],
        properties: {
          snoozeUntil: { type: 'string', format: 'date-time' }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { id } = request.params as any
    const { snoozeUntil } = request.body as any

    await fastify.db.query(
      `UPDATE personal_reminders SET trigger_at = $1, snoozed_count = snoozed_count + 1
       WHERE id = $2 AND user_id = $3`,
      [snoozeUntil, id, userId]
    )

    return { success: true, message: '已推迟提醒' }
  })

  // 删除提醒
  fastify.delete('/reminders/:id', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['智能提醒'], summary: '删除提醒' }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { id } = request.params as any

    await fastify.db.query(
      `DELETE FROM personal_reminders WHERE id = $1 AND user_id = $2`,
      [id, userId]
    )

    return { success: true, message: '提醒已删除' }
  })

  // 获取待触发提醒（供定时任务调用）
  fastify.get('/reminders/due', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['智能提醒'], summary: '获取待触发提醒' }
  }, async (request) => {
    const userId = (request.user as any).userId

    const reminders = await fastify.db.query(
      `SELECT id, reminder_type, title, description, due_at, source_context
       FROM personal_reminders
       WHERE user_id = $1 AND is_completed = FALSE 
         AND trigger_at IS NOT NULL AND trigger_at <= NOW()
       ORDER BY trigger_at ASC`,
      [userId]
    )

    return { success: true, data: reminders.rows }
  })

  // ========================================
  // Claw主动建议
  // ========================================

  // 获取建议列表
  fastify.get('/suggestions', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['主动建议'],
      summary: '获取Claw主动建议'
    }
  }, async (request) => {
    const userId = (request.user as any).userId

    const suggestions = await fastify.db.query(
      `SELECT id, suggestion_type, title, content, action_url, priority, is_read, expires_at, created_at
       FROM claw_suggestions
       WHERE user_id = $1 AND is_dismissed = FALSE 
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY priority DESC, created_at DESC
       LIMIT 10`,
      [userId]
    )

    const unreadCount = await fastify.db.query(
      `SELECT COUNT(*) FROM claw_suggestions 
       WHERE user_id = $1 AND is_read = FALSE AND is_dismissed = FALSE
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [userId]
    )

    return {
      success: true,
      data: {
        suggestions: suggestions.rows.map((s: any) => ({
          id: s.id,
          type: s.suggestion_type,
          title: s.title,
          content: s.content,
          actionUrl: s.action_url,
          priority: s.priority,
          isRead: s.is_read,
          expiresAt: s.expires_at,
          createdAt: s.created_at
        })),
        unreadCount: parseInt(unreadCount.rows[0].count)
      }
    }
  })

  // 标记建议已读
  fastify.post('/suggestions/:id/read', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['主动建议'], summary: '标记建议已读' }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { id } = request.params as any

    await fastify.db.query(
      `UPDATE claw_suggestions SET is_read = TRUE WHERE id = $1 AND user_id = $2`,
      [id, userId]
    )

    return { success: true }
  })

  // 忽略建议
  fastify.post('/suggestions/:id/dismiss', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['主动建议'], summary: '忽略建议' }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { id } = request.params as any

    await fastify.db.query(
      `UPDATE claw_suggestions SET is_dismissed = TRUE WHERE id = $1 AND user_id = $2`,
      [id, userId]
    )

    return { success: true }
  })

  // 创建建议（供内部/AI调用）
  fastify.post('/suggestions', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['主动建议'],
      summary: '创建建议',
      body: {
        type: 'object',
        required: ['suggestionType', 'title'],
        properties: {
          suggestionType: { type: 'string', enum: ['weekly_report', 'meeting_prep', 'onboarding', 'proactive', 'habit_insight'] },
          title: { type: 'string' },
          content: { type: 'string' },
          actionUrl: { type: 'string' },
          priority: { type: 'integer', default: 5 },
          expiresInHours: { type: 'integer', default: 72 }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { suggestionType, title, content, actionUrl, priority = 5, expiresInHours = 72 } = request.body as any

    const suggestionId = uuidv4()
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + expiresInHours)

    await fastify.db.query(
      `INSERT INTO claw_suggestions (id, user_id, suggestion_type, title, content, action_url, priority, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [suggestionId, userId, suggestionType, title, content || '', actionUrl || '', priority, expiresAt]
    )

    return { success: true, data: { id: suggestionId } }
  })

  // ========================================
  // 周报自动生成
  // ========================================

  // 获取周报列表
  fastify.get('/weekly-reports', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['周报'],
      summary: '获取周报列表'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { limit = 8 } = request.query as any

    const reports = await fastify.db.query(
      `SELECT id, week_start, week_end, status, stats, highlights, blockers, 
              next_week_plans, published_at, created_at
       FROM weekly_report_drafts
       WHERE user_id = $1
       ORDER BY week_start DESC
       LIMIT $2`,
      [userId, limit]
    )

    return {
      success: true,
      data: reports.rows.map((r: any) => ({
        id: r.id,
        weekStart: r.week_start,
        weekEnd: r.week_end,
        status: r.status,
        stats: r.stats,
        highlights: r.highlights,
        blockers: r.blockers,
        nextWeekPlans: r.next_week_plans,
        publishedAt: r.published_at,
        createdAt: r.created_at
      }))
    }
  })

  // 生成周报草稿
  fastify.post('/weekly-reports/generate', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['周报'],
      summary: '生成周报草稿',
      body: {
        type: 'object',
        properties: {
          weekStart: { type: 'string', format: 'date' },
          weekEnd: { type: 'string', format: 'date' }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { weekStart, weekEnd } = request.body as any

    const start = weekStart || getWeekStart(new Date())
    const end = weekEnd || getWeekEnd(new Date())

    // 查询本周数据
    const messages = await fastify.db.query(
      `SELECT COUNT(*) FROM messages 
       WHERE sender_id = $1 AND created_at >= $2 AND created_at <= $3`,
      [userId, start, end]
    )

    const tasks = await fastify.db.query(
      `SELECT COUNT(*) FROM tasks 
       WHERE assignee_id = $1 AND status = 'done' AND updated_at >= $2 AND updated_at <= $3`,
      [userId, start, end]
    )

    const docs = await fastify.db.query(
      `SELECT COUNT(*) FROM documents 
       WHERE creator_id = $1 AND created_at >= $2 AND created_at <= $3`,
      [userId, start, end]
    )

    const meetings = await fastify.db.query(
      `SELECT COUNT(*) FROM event_participants ep
       JOIN events e ON e.id = ep.event_id
       WHERE ep.user_id = $1 AND e.event_type = 'meeting' 
         AND e.start_time >= $2 AND e.start_time <= $3`,
      [userId, start, end]
    )

    const aiQueries = await fastify.db.query(
      `SELECT COUNT(*) FROM personal_productivity_logs 
       WHERE user_id = $1 AND log_date >= $2 AND log_date <= $3`,
      [userId, start, end]
    )

    const stats = {
      messagesSent: parseInt(messages.rows[0].count),
      tasksCompleted: parseInt(tasks.rows[0].count),
      docsCreated: parseInt(docs.rows[0].count),
      meetingsAttended: parseInt(meetings.rows[0].count),
      aiQueries: parseInt(aiQueries.rows[0].count)
    }

    // 生成AI摘要（这里用模板，实际可接AI）
    const autoContent = `本周工作概览：
- 发送消息 ${stats.messagesSent} 条
- 完成任务 ${stats.tasksCompleted} 项
- 创建文档 ${stats.docsCreated} 篇
- 参加 ${stats.meetingsAttended} 场会议
- AI查询 ${stats.aiQueries} 次

亮点：
${stats.tasksCompleted > 5 ? '✅ 任务完成率较高，工作效率良好' : '💡 建议适当提升任务完成数量'}
${stats.docsCreated > 2 ? '📝 文档产出丰富，知识沉淀良好' : ''}

建议：
${stats.aiQueries < 5 ? '💡 可以更多利用AI助手提升效率' : ''}`

    const reportId = uuidv4()
    await fastify.db.query(
      `INSERT INTO weekly_report_drafts 
       (id, user_id, week_start, week_end, auto_generated_content, stats)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, week_start) DO UPDATE SET
         auto_generated_content = EXCLUDED.auto_generated_content,
         stats = EXCLUDED.stats,
         updated_at = NOW()`,
      [reportId, userId, start, end, autoContent, JSON.stringify(stats)]
    )

    return {
      success: true,
      data: {
        id: reportId,
        weekStart: start,
        weekEnd: end,
        autoGeneratedContent: autoContent,
        stats
      },
      message: '周报草稿已生成'
    }
  })

  // 更新周报
  fastify.patch('/weekly-reports/:reportId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['周报'],
      summary: '更新周报'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { reportId } = request.params as any
    const { highlights, blockers, nextWeekPlans, humanEditedContent, status } = request.body as any

    const updates: string[] = []
    const values: any[] = []
    let i = 1

    if (highlights !== undefined) {
      updates.push(`highlights = $${i++}`)
      values.push(JSON.stringify(highlights))
    }
    if (blockers !== undefined) {
      updates.push(`blockers = $${i++}`)
      values.push(JSON.stringify(blockers))
    }
    if (nextWeekPlans !== undefined) {
      updates.push(`next_week_plans = $${i++}`)
      values.push(JSON.stringify(nextWeekPlans))
    }
    if (humanEditedContent !== undefined) {
      updates.push(`human_edited_content = $${i++}`)
      values.push(humanEditedContent)
    }
    if (status === 'published') {
      updates.push(`status = 'published'`)
      updates.push(`published_at = NOW()`)
    }

    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`)
      values.push(reportId, userId)
      await fastify.db.query(
        `UPDATE weekly_report_drafts SET ${updates.join(', ')} 
         WHERE id = $${i++} AND user_id = $${i}`,
        values
      )
    }

    return { success: true, message: '周报已更新' }
  })

  // 发布周报
  fastify.post('/weekly-reports/:reportId/publish', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['周报'],
      summary: '发布周报',
      body: {
        type: 'object',
        properties: {
          submittedTo: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { reportId } = request.params as any
    const { submittedTo = [] } = request.body as any

    await fastify.db.query(
      `UPDATE weekly_report_drafts SET status = 'published', published_at = NOW(), submitted_to = $1
       WHERE id = $2 AND user_id = $3`,
      [JSON.stringify(submittedTo), reportId, userId]
    )

    return { success: true, message: '周报已发布' }
  })

  // ========================================
  // 会议准备包
  // ========================================

  // 获取会议准备包列表
  fastify.get('/meeting-prep', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['会议准备'],
      summary: '获取即将到来的会议准备包'
    }
  }, async (request) => {
    const userId = (request.user as any).userId

    const packages = await fastify.db.query(
      `SELECT id, event_id, meeting_title, scheduled_at, participants_info,
              relevant_docs, suggested_talking_points, questions_to_ask, 
              action_items, status, read_at
       FROM meeting_prep_packages
       WHERE user_id = $1 AND status != 'reviewed'
         AND (scheduled_at IS NULL OR scheduled_at > NOW() - INTERVAL '1 day')
       ORDER BY scheduled_at ASC`,
      [userId]
    )

    return {
      success: true,
      data: packages.rows.map((p: any) => ({
        id: p.id,
        eventId: p.event_id,
        meetingTitle: p.meeting_title,
        scheduledAt: p.scheduled_at,
        participants: p.participants_info,
        relevantDocs: p.relevant_docs,
        talkingPoints: p.suggested_talking_points,
        questions: p.questions_to_ask,
        actionItems: p.action_items,
        status: p.status,
        readAt: p.read_at,
        needsAttention: p.status === 'pending'
      }))
    }
  })

  // 生成会议准备包
  fastify.post('/meeting-prep/generate', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['会议准备'],
      summary: '为会议生成准备包',
      body: {
        type: 'object',
        properties: {
          eventId: { type: 'string', format: 'uuid' },
          meetingTitle: { type: 'string' },
          scheduledAt: { type: 'string', format: 'date-time' }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { eventId, meetingTitle, scheduledAt } = request.body as any

    // 获取参与者信息
    let participantsInfo: any[] = []
    if (eventId) {
      const participants = await fastify.db.query(
        `SELECT u.name, u.email, em.role, em.department
         FROM event_participants ep
         JOIN users u ON u.id = ep.user_id
         LEFT JOIN enterprise_members em ON em.user_id = u.id
         WHERE ep.event_id = $1 AND ep.user_id != $2`,
        [eventId, userId]
      )
      participantsInfo = participants.rows
    }

    // 获取相关文档（标题中包含会议关键词的）
    const docs = await fastify.db.query(
      `SELECT id, title, created_at FROM documents
       WHERE (creator_id = $1 OR id IN (
         SELECT document_id FROM document_shares WHERE user_id = $1
       ))
       ORDER BY updated_at DESC LIMIT 5`,
      [userId]
    )

    // 生成建议话题（基于近期任务和项目）
    const recentTasks = await fastify.db.query(
      `SELECT title, status FROM tasks 
       WHERE assignee_id = $1 AND updated_at >= CURRENT_DATE - INTERVAL '7 days'
       ORDER BY updated_at DESC LIMIT 5`,
      [userId]
    )

    const suggestedTalkingPoints = [
      ...recentTasks.rows.map((t: any) => `跟进: ${t.title} (${t.status})`),
      '确认下周工作计划',
      '讨论遇到的阻碍（如有）'
    ]

    const pkgId = uuidv4()
    await fastify.db.query(
      `INSERT INTO meeting_prep_packages 
       (id, user_id, event_id, meeting_title, scheduled_at, participants_info, relevant_docs, suggested_talking_points)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [pkgId, userId, eventId || null, meetingTitle || '', scheduledAt || null,
       JSON.stringify(participantsInfo), JSON.stringify(docs.rows.map((d: any) => ({ id: d.id, title: d.title }))),
       JSON.stringify(suggestedTalkingPoints)]
    )

    return {
      success: true,
      data: {
        id: pkgId,
        participants: participantsInfo.length,
        relevantDocsCount: docs.rows.length,
        suggestedTalkingPoints
      },
      message: '会议准备包已生成'
    }
  })

  // 标记会议准备已查看
  fastify.post('/meeting-prep/:id/read', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['会议准备'], summary: '标记会议准备已查看' }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { id } = request.params as any

    await fastify.db.query(
      `UPDATE meeting_prep_packages SET status = 'ready', read_at = NOW() 
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    )

    return { success: true }
  })

  // 标记会议已结束
  fastify.post('/meeting-prep/:id/complete', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['会议准备'],
      summary: '标记会议准备完成'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { id } = request.params as any

    await fastify.db.query(
      `UPDATE meeting_prep_packages SET status = 'reviewed' WHERE id = $1 AND user_id = $2`,
      [id, userId]
    )

    return { success: true, message: '会议准备已标记完成' }
  })

  // ========================================
  // 入职引导
  // ========================================

  // 获取入职引导进度
  fastify.get('/onboarding/:enterpriseId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['入职引导'],
      summary: '获取企业入职引导进度'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any

    // 获取企业信息
    const enterprise = await fastify.db.query(
      `SELECT name, description, logo_url FROM enterprises WHERE id = $1`,
      [enterpriseId]
    )

    if (enterprise.rows.length === 0) {
      return { success: false, error: '企业不存在' }
    }

    // 获取引导步骤
    const steps = await fastify.db.query(
      `SELECT step_id, step_type, step_title, step_status, completed_at, step_data
       FROM onboarding_progress
       WHERE user_id = $1 AND enterprise_id = $2
       ORDER BY step_id`,
      [userId, enterpriseId]
    )

    // 定义标准引导流程
    const defaultSteps = [
      { stepId: 'welcome', type: 'tutorial', title: '欢迎使用八爪鱼' },
      { stepId: 'profile', type: 'task', title: '完善个人资料' },
      { stepId: 'tour_dashboard', type: 'tour', title: '了解工作台' },
      { stepId: 'first_message', type: 'task', title: '发送第一条消息' },
      { stepId: 'first_task', type: 'task', title: '创建第一个任务' },
      { stepId: 'join_channel', type: 'connection', title: '加入团队频道' },
      { stepId: 'explore_ai', type: 'task', title: '体验AI助手' },
      { stepId: 'meet_team', type: 'connection', title: '认识团队成员' }
    ]

    const allSteps = defaultSteps.map((ds: any) => {
      const existing = steps.rows.find((s: any) => s.step_id === ds.stepId)
      return {
        stepId: ds.stepId,
        type: ds.type,
        title: ds.title,
        status: existing?.step_status || 'pending',
        completedAt: existing?.completed_at,
        data: existing?.step_data || {}
      }
    })

    const completedCount = allSteps.filter((s: any) => s.status === 'completed').length
    const progress = Math.round((completedCount / allSteps.length) * 100)

    return {
      success: true,
      data: {
        enterprise: enterprise.rows[0],
        steps: allSteps,
        progress,
        completedSteps: completedCount,
        totalSteps: allSteps.length,
        isCompleted: completedCount === allSteps.length
      }
    }
  })

  // 完成引导步骤
  fastify.post('/onboarding/:enterpriseId/steps/:stepId/complete', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['入职引导'], summary: '完成引导步骤' }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId, stepId } = request.params as any

    await fastify.db.query(
      `INSERT INTO onboarding_progress (id, user_id, enterprise_id, step_id, step_type, step_status, completed_at)
       VALUES (uuid_generate_v4(), $1, $2, $3, 'tutorial', 'completed', NOW())
       ON CONFLICT (user_id, enterprise_id, step_id) DO UPDATE SET
         step_status = 'completed', completed_at = NOW()`,
      [userId, enterpriseId, stepId]
    )

    return { success: true, message: '步骤已完成' }
  })

  // 跳过引导步骤
  fastify.post('/onboarding/:enterpriseId/steps/:stepId/skip', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['入职引导'], summary: '跳过引导步骤' }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId, stepId } = request.params as any

    await fastify.db.query(
      `INSERT INTO onboarding_progress (id, user_id, enterprise_id, step_id, step_type, step_status)
       VALUES (uuid_generate_v4(), $1, $2, $3, 'tutorial', 'skipped')
       ON CONFLICT (user_id, enterprise_id, step_id) DO UPDATE SET step_status = 'skipped'`,
      [userId, enterpriseId, stepId]
    )

    return { success: true, message: '已跳过该步骤' }
  })
}

// 辅助函数：获取本周一
function getWeekStart(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

// 辅助函数：获取本周日
function getWeekEnd(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() + (day === 0 ? 0 : 7 - day)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

export default clawProactiveRoutes
