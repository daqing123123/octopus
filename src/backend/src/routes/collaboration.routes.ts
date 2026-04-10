/**
 * 多人协作路由
 * 包含：评论系统、在线状态、协作会话管理、任务关联
 */

import { FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

const COLLABORATION_ROUTES: FastifyPluginAsync = async (fastify) => {

  // ========================================
  // 第一部分：评论系统
  // ========================================

  // 创建评论
  fastify.post('/comments', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['协作'],
      summary: '创建评论',
      body: {
        type: 'object',
        required: ['resourceType', 'resourceId', 'content'],
        properties: {
          resourceType: { type: 'string' },
          resourceId: { type: 'string' },
          parentId: { type: 'string' },
          content: { type: 'string', minLength: 1 },
          mentions: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { resourceType, resourceId, parentId, content, mentions } = request.body as any

    const commentId = uuidv4()

    // 解析内容中的 @mention
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g
    const extractedMentions: string[] = mentions || []
    let match
    while ((match = mentionRegex.exec(content)) !== null) {
      const userIdInMention = match[2]
      if (!extractedMentions.includes(userIdInMention)) {
        extractedMentions.push(userIdInMention)
      }
    }

    await fastify.db.query(
      `INSERT INTO comments (id, resource_type, resource_id, parent_id, author_id, content, mentions)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [commentId, resourceType, resourceId, parentId || null, userId, content, JSON.stringify(extractedMentions)]
    )

    // 创建通知
    for (const mentionedUserId of extractedMentions) {
      if (mentionedUserId !== userId) {
        const notificationId = uuidv4()
        await fastify.db.query(
          `INSERT INTO notifications (id, user_id, type, title, content, data, created_at)
           VALUES ($1, $2, 'mention', '有人@了你', $3, $4, NOW())`,
          [
            notificationId,
            mentionedUserId,
            `在评论中@了你：${content.substring(0, 50)}...`,
            JSON.stringify({ resourceType, resourceId, commentId })
          ]
        )
      }
    }

    // 回复通知
    if (parentId) {
      const parent = await fastify.db.query(
        `SELECT author_id FROM comments WHERE id = $1`,
        [parentId]
      )
      if (parent.rows.length > 0 && parent.rows[0].author_id !== userId) {
        const notificationId = uuidv4()
        await fastify.db.query(
          `INSERT INTO notifications (id, user_id, type, title, content, data, created_at)
           VALUES ($1, $2, 'reply', '有人回复了你', $3, $4, NOW())`,
          [
            notificationId,
            parent.rows[0].author_id,
            `回复了你的评论：${content.substring(0, 50)}...`,
            JSON.stringify({ resourceType, resourceId, commentId, parentId })
          ]
        )
      }
    }

    return {
      success: true,
      data: { commentId },
      message: '评论已创建'
    }
  })

  // 获取评论列表
  fastify.get('/comments', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['协作'],
      summary: '获取资源的所有评论',
      querystring: {
        type: 'object',
        required: ['resourceType', 'resourceId'],
        properties: {
          resourceType: { type: 'string' },
          resourceId: { type: 'string' },
          includeResolved: { type: 'boolean', default: true }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { resourceType, resourceId, includeResolved } = request.query as any

    // 构建评论树
    const comments = await fastify.db.query(
      `SELECT c.*, 
              u.name as author_name, u.avatar_url as author_avatar,
              ru.name as resolved_by_name
       FROM comments c
       LEFT JOIN users u ON c.author_id = u.id
       LEFT JOIN users ru ON c.resolved_by = ru.id
       WHERE c.resource_type = $1 AND c.resource_id = $2 
         AND c.deleted_at IS NULL
         ${includeResolved === false ? "AND c.is_resolved = false" : ""}
       ORDER BY c.is_pinned DESC, c.created_at ASC`,
      [resourceType, resourceId]
    )

    // 构建树形结构
    const rootComments: any[] = []
    const childMap = new Map<string, any[]>()

    for (const comment of comments.rows) {
      comment.children = []
      if (comment.parent_id) {
        const children = childMap.get(comment.parent_id) || []
        children.push(comment)
        childMap.set(comment.parent_id, children)
      } else {
        rootComments.push(comment)
      }
    }

    // 挂载子评论
    for (const root of rootComments) {
      attachChildren(root, childMap)
    }

    // 统计
    const stats = await fastify.db.query(
      `SELECT 
         COUNT(*) FILTER (WHERE deleted_at IS NULL) as total,
         COUNT(*) FILTER (WHERE is_resolved = true AND deleted_at IS NULL) as resolved,
         COUNT(*) FILTER (WHERE is_pinned = true AND deleted_at IS NULL) as pinned,
         COUNT(DISTINCT author_id) FILTER (WHERE deleted_at IS NULL) as participants
       FROM comments WHERE resource_type = $1 AND resource_id = $2`,
      [resourceType, resourceId]
    )

    return {
      success: true,
      data: {
        comments: rootComments,
        stats: {
          total: parseInt(stats.rows[0].total),
          resolved: parseInt(stats.rows[0].resolved),
          pinned: parseInt(stats.rows[0].pinned),
          participants: parseInt(stats.rows[0].participants)
        }
      }
    }
  })

  // 更新评论
  fastify.patch('/comments/:commentId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['协作'],
      summary: '更新评论',
      body: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          isPinned: { type: 'boolean' },
          isResolved: { type: 'boolean' }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { commentId } = request.params as any
    const { content, isPinned, isResolved } = request.body as any

    // 检查是否是作者
    const comment = await fastify.db.query(
      `SELECT author_id, is_resolved FROM comments WHERE id = $1`,
      [commentId]
    )

    if (comment.rows.length === 0) {
      return { success: false, error: '评论不存在' }
    }

    if (comment.rows[0].author_id !== userId && isResolved !== undefined) {
      return { success: false, error: '只有作者可以标记解决' }
    }

    const fields: string[] = []
    const values: any[] = []
    let idx = 1

    if (content !== undefined) {
      fields.push(`content = $${idx++}`)
      values.push(content)
    }
    if (isPinned !== undefined) {
      fields.push(`is_pinned = $${idx++}`)
      values.push(isPinned)
    }
    if (isResolved !== undefined) {
      fields.push(`is_resolved = $${idx++}`)
      values.push(isResolved)
      if (isResolved) {
        fields.push(`resolved_by = $${idx++}`)
        values.push(userId)
        fields.push(`resolved_at = NOW()`)
      } else {
        fields.push(`resolved_by = NULL`)
        fields.push(`resolved_at = NULL`)
      }
    }

    fields.push(`updated_at = NOW()`)
    values.push(commentId)

    await fastify.db.query(
      `UPDATE comments SET ${fields.join(', ')} WHERE id = $${idx}`,
      values
    )

    return {
      success: true,
      message: '评论已更新'
    }
  })

  // 删除评论
  fastify.delete('/comments/:commentId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['协作'],
      summary: '删除评论（软删除）'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { commentId } = request.params as any

    const comment = await fastify.db.query(
      `SELECT author_id FROM comments WHERE id = $1`,
      [commentId]
    )

    if (comment.rows.length === 0) {
      return { success: false, error: '评论不存在' }
    }

    if (comment.rows[0].author_id !== userId) {
      // 检查是否有管理员权限
      const isAdmin = await fastify.db.query(
        `SELECT 1 FROM resource_permissions rp
         JOIN resources r ON rp.resource_id = r.id
         JOIN comments c ON c.resource_type = r.resource_type AND c.resource_id = r.resource_id
         WHERE c.id = $1 AND rp.principal_type = 'user' AND rp.principal_id = $2 AND rp.permission = 'admin'`,
        [commentId, userId]
      )
      if (isAdmin.rows.length === 0) {
        return { success: false, error: '无权限删除此评论' }
      }
    }

    await fastify.db.query(
      `UPDATE comments SET deleted_at = NOW(), content = '[已删除]' WHERE id = $1`,
      [commentId]
    )

    return {
      success: true,
      message: '评论已删除'
    }
  })

  // 评论加反应
  fastify.post('/comments/:commentId/reactions', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['协作'],
      summary: '添加/移除评论反应'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { commentId } = request.params as any
    const { emoji, action } = request.body as { emoji: string; action: 'add' | 'remove' }

    const comment = await fastify.db.query(
      `SELECT reactions FROM comments WHERE id = $1`,
      [commentId]
    )

    if (comment.rows.length === 0) {
      return { success: false, error: '评论不存在' }
    }

    const reactions = comment.rows[0].reactions || {}

    if (action === 'add') {
      if (!reactions[emoji]) reactions[emoji] = []
      if (!reactions[emoji].includes(userId)) {
        reactions[emoji].push(userId)
      }
    } else {
      if (reactions[emoji]) {
        reactions[emoji] = reactions[emoji].filter((id: string) => id !== userId)
        if (reactions[emoji].length === 0) delete reactions[emoji]
      }
    }

    await fastify.db.query(
      `UPDATE comments SET reactions = $1 WHERE id = $2`,
      [JSON.stringify(reactions), commentId]
    )

    return {
      success: true,
      data: { reactions }
    }
  })

  // ========================================
  // 第二部分：协作会话（在线状态）
  // ========================================

  // 加入协作会话
  fastify.post('/sessions/join', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['协作'],
      summary: '加入协作会话'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { resourceType, resourceId, sessionType } = request.body as any

    // 检查是否已有活跃会话
    const existing = await fastify.db.query(
      `SELECT id FROM collaboration_sessions 
       WHERE user_id = $1 AND resource_id = $2 AND left_at IS NULL`,
      [resourceId, userId]
    )

    if (existing.rows.length > 0) {
      // 更新为活跃
      await fastify.db.query(
        `UPDATE collaboration_sessions SET session_type = $1, last_activity_at = NOW()
         WHERE id = $2`,
        [sessionType || 'viewing', existing.rows[0].id]
      )
      return { success: true, data: { sessionId: existing.rows[0].id, resumed: true } }
    }

    const sessionId = uuidv4()
    await fastify.db.query(
      `INSERT INTO collaboration_sessions (id, resource_id, user_id, session_type, joined_at, last_activity_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())`,
      [sessionId, resourceId, userId, sessionType || 'viewing']
    )

    // 记录事件
    await fastify.db.query(
      `INSERT INTO collaboration_events (id, resource_id, user_id, event_type, event_data)
       VALUES ($1, $2, $3, 'join', '{}')`,
      [uuidv4(), resourceId, userId]
    )

    return {
      success: true,
      data: { sessionId, resumed: false }
    }
  })

  // 离开协作会话
  fastify.post('/sessions/leave', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['协作'],
      summary: '离开协作会话'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { resourceId } = request.body as any

    await fastify.db.query(
      `UPDATE collaboration_sessions SET left_at = NOW(), last_activity_at = NOW()
       WHERE user_id = $1 AND resource_id = $2 AND left_at IS NULL`,
      [userId, resourceId]
    )

    await fastify.db.query(
      `INSERT INTO collaboration_events (id, resource_id, user_id, event_type, event_data)
       VALUES ($1, $2, $3, 'leave', '{}')`,
      [uuidv4(), resourceId, userId]
    )

    return { success: true }
  })

  // 获取在线协作者
  fastify.get('/sessions/online', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['协作'],
      summary: '获取资源的所有在线协作者'
    }
  }, async (request) => {
    const { resourceId } = request.query as any

    const sessions = await fastify.db.query(
      `SELECT cs.*, u.name, u.avatar_url, u.status
       FROM collaboration_sessions cs
       JOIN users u ON cs.user_id = u.id
       WHERE cs.resource_id = $1 AND cs.left_at IS NULL
       ORDER BY cs.session_type = 'editing' DESC, cs.joined_at ASC`,
      [resourceId]
    )

    return {
      success: true,
      data: sessions.rows
    }
  })

  // 心跳保活
  fastify.post('/sessions/heartbeat', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['协作'],
      summary: '协作会话心跳'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { sessionId, cursorPosition, clientInfo } = request.body as any

    await fastify.db.query(
      `UPDATE collaboration_sessions 
       SET last_activity_at = NOW(),
           cursor_position = COALESCE($2, cursor_position),
           client_info = COALESCE($3, client_info)
       WHERE id = $1 AND user_id = $4 AND left_at IS NULL`,
      [sessionId, cursorPosition ? JSON.stringify(cursorPosition) : null, 
       clientInfo ? JSON.stringify(clientInfo) : null, userId]
    )

    return { success: true }
  })

  // 标记正在编辑
  fastify.post('/sessions/editing', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['协作'],
      summary: '标记正在编辑'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { resourceId } = request.body as any

    await fastify.db.query(
      `UPDATE collaboration_sessions 
       SET session_type = 'editing', last_activity_at = NOW()
       WHERE user_id = $1 AND resource_id = $2 AND left_at IS NULL`,
      [userId, resourceId]
    )

    return { success: true }
  })

  // ========================================
  // 第三部分：任务关联
  // ========================================

  // 关联任务到资源
  fastify.post('/task-associations', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['协作'],
      summary: '关联任务到资源',
      body: {
        type: 'object',
        required: ['taskId', 'resourceType', 'resourceId'],
        properties: {
          taskId: { type: 'string' },
          resourceType: { type: 'string' },
          resourceId: { type: 'string' },
          associationType: { type: 'string', enum: ['parent', 'child', 'related', 'blocks', 'blocked_by', 'implements'] }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { taskId, resourceType, resourceId, associationType } = request.body as any

    // 验证任务存在
    const task = await fastify.db.query(
      `SELECT id, title FROM tasks WHERE id = $1`,
      [taskId]
    )
    if (task.rows.length === 0) {
      return { success: false, error: '任务不存在' }
    }

    // 验证资源存在
    const tableMap: Record<string, string> = {
      document: 'documents', task: 'tasks', file: 'files',
      meeting: 'meetings', approval: 'approvals'
    }
    const tableName = tableMap[resourceType] || 'documents'
    const resource = await fastify.db.query(
      `SELECT id, name FROM ${tableName} WHERE id = $1`,
      [resourceId]
    )

    const assocId = uuidv4()
    await fastify.db.query(
      `INSERT INTO task_associations (id, task_id, resource_type, resource_id, association_type, associated_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (task_id, resource_type, resource_id) DO UPDATE SET
         association_type = EXCLUDED.association_type`,
      [assocId, taskId, resourceType, resourceId, associationType || 'related', userId]
    )

    return {
      success: true,
      data: { associationId: assocId },
      message: `任务 "${task.rows[0].title}" 已关联到 ${resource.rows[0]?.name || resourceId}`
    }
  })

  // 批量关联任务
  fastify.post('/task-associations/batch', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['协作'],
      summary: '批量关联任务'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { associations } = request.body as {
      associations: Array<{ taskId: string; resourceType: string; resourceId: string; associationType?: string }>
    }

    let count = 0
    for (const assoc of associations) {
      try {
        await fastify.db.query(
          `INSERT INTO task_associations (id, task_id, resource_type, resource_id, association_type, associated_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT DO NOTHING`,
          [uuidv4(), assoc.taskId, assoc.resourceType, assoc.resourceId, assoc.associationType || 'related', userId]
        )
        count++
      } catch (e) {
        // 忽略冲突
      }
    }

    return { success: true, message: `已关联 ${count} 个任务` }
  })

  // 获取资源的关联任务
  fastify.get('/task-associations/resource/:resourceType/:resourceId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['协作'],
      summary: '获取资源的所有关联任务'
    }
  }, async (request) => {
    const { resourceType, resourceId } = request.params as any

    const tasks = await fastify.db.query(
      `SELECT ta.*, t.title, t.status, t.priority, t.due_date, t.assignee_id,
              u.name as assignee_name, u.avatar_url as assignee_avatar,
              a.name as associated_by_name
       FROM task_associations ta
       JOIN tasks t ON ta.task_id = t.id
       LEFT JOIN users u ON t.assignee_id = u.id
       LEFT JOIN users a ON ta.associated_by = a.id
       WHERE ta.resource_type = $1 AND ta.resource_id = $2
       ORDER BY ta.association_type, t.due_date NULLS LAST`,
      [resourceType, resourceId]
    )

    // 按关联类型分组
    const grouped: Record<string, any[]> = {
      parent: [], child: [], related: [], blocks: [], blocked_by: [], implements: []
    }
    for (const row of tasks.rows) {
      if (grouped[row.association_type]) {
        grouped[row.association_type].push(row)
      }
    }

    return {
      success: true,
      data: {
        tasks: tasks.rows,
        grouped,
        total: tasks.rows.length
      }
    }
  })

  // 获取任务的所有关联
  fastify.get('/task-associations/task/:taskId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['协作'],
      summary: '获取任务的所有关联'
    }
  }, async (request) => {
    const { taskId } = request.params as any

    const associations = await fastify.db.query(
      `SELECT ta.*, 
              CASE 
                WHEN ta.resource_type = 'document' THEN d.name
                WHEN ta.resource_type = 'meeting' THEN m.title
                WHEN ta.resource_type = 'task' THEN t.title
                WHEN ta.resource_type = 'file' THEN f.name
                ELSE ta.resource_id
              END as resource_name,
              a.name as associated_by_name
       FROM task_associations ta
       LEFT JOIN documents d ON ta.resource_type = 'document' AND ta.resource_id = d.id
       LEFT JOIN meetings m ON ta.resource_type = 'meeting' AND ta.resource_id = m.id
       LEFT JOIN tasks t ON ta.resource_type = 'task' AND ta.resource_id = t.id
       LEFT JOIN files f ON ta.resource_type = 'file' AND ta.resource_id = f.id
       LEFT JOIN users a ON ta.associated_by = a.id
       WHERE ta.task_id = $1
       ORDER BY ta.association_type, ta.created_at DESC`,
      [taskId]
    )

    return {
      success: true,
      data: associations.rows
    }
  })

  // 删除任务关联
  fastify.delete('/task-associations/:associationId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['协作'],
      summary: '删除任务关联'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { associationId } = request.params as any

    await fastify.db.query(
      `DELETE FROM task_associations WHERE id = $1`,
      [associationId]
    )

    return { success: true, message: '关联已删除' }
  })

  // 设置任务依赖
  fastify.post('/task-dependencies', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['协作'],
      summary: '设置任务依赖'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { blockingTaskId, blockedTaskId, dependencyType } = request.body as any

    // 验证两个任务都存在
    const blocking = await fastify.db.query(`SELECT id FROM tasks WHERE id = $1`, [blockingTaskId])
    const blocked = await fastify.db.query(`SELECT id FROM tasks WHERE id = $1`, [blockedTaskId])

    if (blocking.rows.length === 0 || blocked.rows.length === 0) {
      return { success: false, error: '任务不存在' }
    }

    // 检查循环依赖
    const wouldCycle = await fastify.db.query(
      `WITH RECURSIVE deps AS (
        SELECT blocked_task_id, blocking_task_id, 1 as depth FROM task_dependencies
        WHERE blocking_task_id = $1
        UNION ALL
        SELECT td.blocked_task_id, td.blocking_task_id, d.depth + 1 FROM task_dependencies td
        JOIN deps d ON td.blocking_task_id = d.blocked_task_id
        WHERE d.depth < 10
      )
      SELECT 1 FROM deps WHERE blocked_task_id = $2`,
      [blockedTaskId, blockingTaskId]
    )

    if (wouldCycle.rows.length > 0) {
      return { success: false, error: '设置依赖会造成循环依赖' }
    }

    const depId = uuidv4()
    await fastify.db.query(
      `INSERT INTO task_dependencies (id, blocking_task_id, blocked_task_id, dependency_type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [depId, blockingTaskId, blockedTaskId, dependencyType || 'blocks']
    )

    return {
      success: true,
      data: { dependencyId: depId },
      message: '依赖关系已设置'
    }
  })

  // 获取任务依赖图
  fastify.get('/task-dependencies/graph/:taskId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['协作'],
      summary: '获取任务依赖图'
    }
  }, async (request) => {
    const { taskId } = request.params as any

    const result = await fastify.db.query(
      `WITH RECURSIVE deps AS (
        SELECT td.*, t.title as blocking_title, 1 as depth
        FROM task_dependencies td
        JOIN tasks t ON td.blocking_task_id = t.id
        WHERE td.blocked_task_id = $1
        UNION ALL
        SELECT td.*, t.title as blocking_title, d.depth + 1
        FROM task_dependencies td
        JOIN tasks t ON td.blocking_task_id = t.id
        JOIN deps d ON td.blocked_task_id = d.blocking_task_id
        WHERE d.depth < 5
      )
      SELECT DISTINCT * FROM deps`,
      [taskId]
    )

    const blocking = await fastify.db.query(
      `SELECT td.*, t.title as blocked_title
       FROM task_dependencies td
       JOIN tasks t ON td.blocked_task_id = t.id
       WHERE td.blocking_task_id = $1`,
      [taskId]
    )

    return {
      success: true,
      data: {
        blockedBy: result.rows,  // 当前任务被谁阻塞
        blocks: blocking.rows,   // 当前任务阻塞谁
        canStart: result.rows.length === 0  // 是否可以开始（没有被阻塞）
      }
    }
  })

  // ========================================
  // 第四部分：协作统计
  // ========================================

  // 获取资源协作统计
  fastify.get('/collaboration/stats/:resourceType/:resourceId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['协作'],
      summary: '获取资源协作统计'
    }
  }, async (request) => {
    const { resourceType, resourceId } = request.params as any

    // 参与者统计
    const participants = await fastify.db.query(
      `SELECT COUNT(DISTINCT user_id) as count FROM collaboration_events
       WHERE resource_id = $1 AND event_type IN ('join', 'edit')`,
      [resourceId]
    )

    // 评论统计
    const commentStats = await fastify.db.query(
      `SELECT 
         COUNT(*) as total,
         COUNT(DISTINCT author_id) as unique_commenters,
         COUNT(*) FILTER (WHERE is_resolved = true) as resolved
       FROM comments WHERE resource_type = $1 AND resource_id = $2 AND deleted_at IS NULL`,
      [resourceType, resourceId]
    )

    // 最近活跃
    const recentActivity = await fastify.db.query(
      `SELECT ce.*, u.name, u.avatar_url
       FROM collaboration_events ce
       LEFT JOIN users u ON ce.user_id = u.id
       WHERE ce.resource_id = $1
       ORDER BY ce.created_at DESC
       LIMIT 20`,
      [resourceId]
    )

    return {
      success: true,
      data: {
        participants: parseInt(participants.rows[0].count),
        comments: {
          total: parseInt(commentStats.rows[0].total),
          uniqueCommenters: parseInt(commentStats.rows[0].unique_commenters),
          resolved: parseInt(commentStats.rows[0].resolved)
        },
        recentActivity: recentActivity.rows
      }
    }
  })

  // 获取@我的评论
  fastify.get('/comments/mentions', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['协作'],
      summary: '获取@我的评论'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { limit = 20, offset = 0 } = request.query as any

    const mentions = await fastify.db.query(
      `SELECT c.*, u.name as author_name, u.avatar_url as author_avatar,
              CASE 
                WHEN c.resource_type = 'document' THEN d.name
                ELSE c.resource_id
              END as resource_name,
              cn.is_read
       FROM comments c
       JOIN users u ON c.author_id = u.id
       LEFT JOIN documents d ON c.resource_type = 'document' AND c.resource_id = d.id
       LEFT JOIN comment_notifications cn ON cn.comment_id = c.id AND cn.user_id = $1
       WHERE $1 = ANY(c.mentions) AND c.deleted_at IS NULL
       ORDER BY c.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    )

    // 标记已读
    await fastify.db.query(
      `UPDATE comment_notifications SET is_read = true WHERE user_id = $1 AND is_read = false`,
      [userId]
    )

    return {
      success: true,
      data: mentions.rows
    }
  })
}

// 辅助函数：递归挂载子评论
function attachChildren(comment: any, childMap: Map<string, any[]>) {
  const children = childMap.get(comment.id)
  if (children) {
    comment.children = children
    for (const child of children) {
      attachChildren(child, childMap)
    }
  } else {
    comment.children = []
  }
}

export default COLLABORATION_ROUTES
