import { FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

const tableRoutes: FastifyPluginAsync = async (fastify) => {
  
  // 创建表格
  fastify.post('/', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['多维表格'],
      summary: '创建表格'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId, name, description, fields, icon, color } = request.body as any
    
    const tableId = uuidv4()
    
    // 默认字段
    const defaultFields = [
      { id: 'title', name: '标题', type: 'text', required: true },
      { id: 'status', name: '状态', type: 'select', options: ['待办', '进行中', '已完成'] },
      { id: 'assignee', name: '负责人', type: 'user' },
      { id: 'dueDate', name: '截止日期', type: 'date' },
      { id: 'created_at', name: '创建时间', type: 'date', auto: true }
    ]
    
    // 默认视图
    const defaultViews = [
      { id: 'grid', name: '表格视图', type: 'grid', config: {} },
      { id: 'kanban', name: '看板视图', type: 'kanban', config: { groupBy: 'status' } }
    ]
    
    await fastify.db.query(
      `INSERT INTO tables (id, enterprise_id, creator_id, name, description, icon, color, fields, views)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [tableId, enterpriseId, userId, name, description, icon || '📊', color || '#4F46E5', 
       JSON.stringify(fields || defaultFields), JSON.stringify(defaultViews)]
    )
    
    return {
      success: true,
      data: { tableId, name }
    }
  })

  // 获取表格列表
  fastify.get('/', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['多维表格'],
      summary: '获取表格列表'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.query as any
    
    const result = await fastify.db.query(
      `SELECT id, name, description, icon, color, created_at
       FROM tables
       WHERE enterprise_id = $1 AND is_archived = false
       ORDER BY created_at DESC`,
      [enterpriseId]
    )
    
    return {
      success: true,
      data: result.rows
    }
  })

  // 获取表格详情
  fastify.get('/:id', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['多维表格'],
      summary: '获取表格详情'
    }
  }, async (request, reply) => {
    const { id } = request.params as any
    
    const result = await fastify.db.query(
      `SELECT id, enterprise_id, creator_id, name, description, icon, color, 
              fields, views, settings, created_at
       FROM tables WHERE id = $1`,
      [id]
    )
    
    if (result.rows.length === 0) {
      return reply.status(404).send({ error: '表格不存在' })
    }
    
    return {
      success: true,
      data: result.rows[0]
    }
  })

  // 获取表格数据行
  fastify.get('/:id/rows', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['多维表格'],
      summary: '获取表格数据'
    }
  }, async (request) => {
    const { id } = request.params as any
    const { view, page = 1, limit = 50, filter, sort } = request.query as any
    
    const offset = (page - 1) * limit
    
    let query = `SELECT id, data, created_by, created_at, updated_at 
                 FROM table_rows WHERE table_id = $1`
    const params: any[] = [id]
    
    // TODO: 实现 filter 和 sort 逻辑
    
    query += ` ORDER BY created_at DESC LIMIT $2 OFFSET $3`
    params.push(limit, offset)
    
    const result = await fastify.db.query(query, params)
    
    // 获取总数
    const countResult = await fastify.db.query(
      'SELECT COUNT(*) FROM table_rows WHERE table_id = $1',
      [id]
    )
    
    return {
      success: true,
      data: {
        rows: result.rows,
        total: parseInt(countResult.rows[0].count),
        page,
        limit
      }
    }
  })

  // 创建行
  fastify.post('/:id/rows', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['多维表格'],
      summary: '创建数据行'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { id } = request.params as any
    const { data } = request.body as any
    
    const rowId = uuidv4()
    
    await fastify.db.query(
      `INSERT INTO table_rows (id, table_id, data, created_by)
       VALUES ($1, $2, $3, $4)`,
      [rowId, id, JSON.stringify(data), userId]
    )
    
    return {
      success: true,
      data: { rowId, data }
    }
  })

  // 更新行
  fastify.patch('/:id/rows/:rowId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['多维表格'],
      summary: '更新数据行'
    }
  }, async (request) => {
    const { id, rowId } = request.params as any
    const { data } = request.body as any
    
    await fastify.db.query(
      `UPDATE table_rows SET data = $1, updated_at = NOW() 
       WHERE id = $2 AND table_id = $3`,
      [JSON.stringify(data), rowId, id]
    )
    
    return {
      success: true,
      data: { rowId, data }
    }
  })

  // 删除行
  fastify.delete('/:id/rows/:rowId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['多维表格'],
      summary: '删除数据行'
    }
  }, async (request) => {
    const { id, rowId } = request.params as any
    
    await fastify.db.query(
      'DELETE FROM table_rows WHERE id = $1 AND table_id = $2',
      [rowId, id]
    )
    
    return {
      success: true,
      message: '删除成功'
    }
  })

  // 添加视图
  fastify.post('/:id/views', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['多维表格'],
      summary: '添加视图'
    }
  }, async (request) => {
    const { id } = request.params as any
    const { name, type, config } = request.body as any
    
    // 获取当前视图
    const table = await fastify.db.query(
      'SELECT views FROM tables WHERE id = $1',
      [id]
    )
    
    const views = table.rows[0].views || []
    const viewId = uuidv4()
    
    views.push({
      id: viewId,
      name,
      type,
      config: config || {}
    })
    
    await fastify.db.query(
      'UPDATE tables SET views = $1 WHERE id = $2',
      [JSON.stringify(views), id]
    )
    
    return {
      success: true,
      data: { viewId, name, type }
    }
  })

  // 添加字段
  fastify.post('/:id/fields', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['多维表格'],
      summary: '添加字段'
    }
  }, async (request) => {
    const { id } = request.params as any
    const { name, type, options, required } = request.body as any
    
    // 获取当前字段
    const table = await fastify.db.query(
      'SELECT fields FROM tables WHERE id = $1',
      [id]
    )
    
    const fields = table.rows[0].fields || []
    const fieldId = uuidv4()
    
    fields.push({
      id: fieldId,
      name,
      type,
      options: options || [],
      required: required || false
    })
    
    await fastify.db.query(
      'UPDATE tables SET fields = $1 WHERE id = $2',
      [JSON.stringify(fields), id]
    )
    
    return {
      success: true,
      data: { fieldId, name, type }
    }
  })
}

export default tableRoutes
