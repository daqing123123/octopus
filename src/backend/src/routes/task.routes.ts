import { FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

const taskRoutes: FastifyPluginAsync = async (fastify) => {
  
  // 创建任务
  fastify.post('/', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['任务'],
      summary: '创建任务'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { 
      enterpriseId, title, description, assigneeId, 
      parentId, priority, dueDate, tags 
    } = request.body as any
    
    const taskId = uuidv4()
    
    await fastify.db.query(
      `INSERT INTO tasks (id, enterprise_id, creator_id, assignee_id, parent_id, 
                          title, description, priority, due_date, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [taskId, enterpriseId, userId, assigneeId, parentId, 
       title, description, priority || 'medium', dueDate, JSON.stringify(tags || [])]
    )
    
    return {
      success: true,
      data: { taskId, title }
    }
  })

  // 获取任务列表
  fastify.get('/', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['任务'],
      summary: '获取任务列表'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId, status, assigneeId, view } = request.query as any
    
    let query = `SELECT t.id, t.title, t.description, t.status, t.priority, 
                        t.due_date, t.tags, t.created_at,
                        u.name as creator_name, a.name as assignee_name
                 FROM tasks t
                 LEFT JOIN users u ON t.creator_id = u.id
                 LEFT JOIN users a ON t.assignee_id = a.id
                 WHERE t.enterprise_id = $1`
    const params: any[] = [enterpriseId]
    
    if (status) {
      params.push(status)
      query += ` AND t.status = $${params.length}`
    }
    
    if (assigneeId) {
      params.push(assigneeId)
      query += ` AND t.assignee_id = $${params.length}`
    }
    
    query += ' ORDER BY t.created_at DESC'
    
    const result = await fastify.db.query(query, params)
    
    // 如果是看板视图，按状态分组
    if (view === 'kanban') {
      const grouped: Record<string, any[]> = {
        'todo': [],
        'in_progress': [],
        'completed': [],
        'cancelled': []
      }
      
      result.rows.forEach(task => {
        if (grouped[task.status]) {
          grouped[task.status].push(task)
        }
      })
      
      return {
        success: true,
        data: grouped
      }
    }
    
    return {
      success: true,
      data: result.rows
    }
  })

  // 获取任务详情
  fastify.get('/:id', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['任务'],
      summary: '获取任务详情'
    }
  }, async (request, reply) => {
    const { id } = request.params as any
    
    const result = await fastify.db.query(
      `SELECT t.*, 
              u.name as creator_name, u.avatar_url as creator_avatar,
              a.name as assignee_name, a.avatar_url as assignee_avatar
       FROM tasks t
       LEFT JOIN users u ON t.creator_id = u.id
       LEFT JOIN users a ON t.assignee_id = a.id
       WHERE t.id = $1`,
      [id]
    )
    
    if (result.rows.length === 0) {
      return reply.status(404).send({ error: '任务不存在' })
    }
    
    // 获取子任务
    const subtasks = await fastify.db.query(
      `SELECT id, title, status, priority, due_date 
       FROM tasks WHERE parent_id = $1`,
      [id]
    )
    
    // 获取评论
    const comments = await fastify.db.query(
      `SELECT tc.id, tc.content, tc.created_at, u.name as user_name, u.avatar_url
       FROM task_comments tc
       JOIN users u ON tc.user_id = u.id
       WHERE tc.task_id = $1
       ORDER BY tc.created_at DESC`,
      [id]
    )
    
    return {
      success: true,
      data: {
        ...result.rows[0],
        subtasks: subtasks.rows,
        comments: comments.rows
      }
    }
  })

  // 更新任务状态
  fastify.patch('/:id/status', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['任务'],
      summary: '更新任务状态'
    }
  }, async (request) => {
    const { id } = request.params as any
    const { status } = request.body as any
    
    const completedAt = status === 'completed' ? new Date() : null
    
    await fastify.db.query(
      `UPDATE tasks SET status = $1, completed_at = $2, updated_at = NOW() 
       WHERE id = $3`,
      [status, completedAt, id]
    )
    
    return {
      success: true,
      data: { taskId: id, status }
    }
  })

  // 更新任务
  fastify.patch('/:id', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['任务'],
      summary: '更新任务'
    }
  }, async (request) => {
    const { id } = request.params as any
    const updates = request.body as any
    
    const fields: string[] = []
    const values: any[] = []
    
    Object.entries(updates).forEach(([key, value], index) => {
      fields.push(`${key} = $${index + 2}`)
      values.push(value)
    })
    
    if (fields.length > 0) {
      await fastify.db.query(
        `UPDATE tasks SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $1`,
        [id, ...values]
      )
    }
    
    return {
      success: true,
      message: '更新成功'
    }
  })

  // 删除任务
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['任务'],
      summary: '删除任务'
    }
  }, async (request) => {
    const { id } = request.params as any
    
    await fastify.db.query('DELETE FROM tasks WHERE id = $1', [id])
    
    return {
      success: true,
      message: '删除成功'
    }
  })

  // 添加评论
  fastify.post('/:id/comments', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['任务'],
      summary: '添加任务评论'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { id } = request.params as any
    const { content } = request.body as any
    
    const commentId = uuidv4()
    
    await fastify.db.query(
      `INSERT INTO task_comments (id, task_id, user_id, content)
       VALUES ($1, $2, $3, $4)`,
      [commentId, id, userId, content]
    )
    
    return {
      success: true,
      data: { commentId, content }
    }
  })

  // 获取我的任务
  fastify.get('/my/assigned', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['任务'],
      summary: '获取分配给我的任务'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId, status } = request.query as any
    
    let query = `SELECT id, title, status, priority, due_date, created_at
                 FROM tasks WHERE assignee_id = $1`
    const params: any[] = [userId]
    
    if (enterpriseId) {
      params.push(enterpriseId)
      query += ` AND enterprise_id = $${params.length}`
    }
    
    if (status) {
      params.push(status)
      query += ` AND status = $${params.length}`
    }
    
    query += ' ORDER BY due_date ASC NULLS LAST, priority DESC'
    
    const result = await fastify.db.query(query, params)
    
    return {
      success: true,
      data: result.rows
    }
  })
}

export default taskRoutes
