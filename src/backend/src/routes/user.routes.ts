import { FastifyPluginAsync } from 'fastify'

const userRoutes: FastifyPluginAsync = async (fastify) => {
  
  // 获取当前用户信息
  fastify.get('/me', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['用户'],
      summary: '获取当前用户信息'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    
    const result = await fastify.db.query(
      `SELECT id, email, name, avatar_url, phone, status, created_at
       FROM users WHERE id = $1`,
      [userId]
    )
    
    if (result.rows.length === 0) {
      return { success: false, error: '用户不存在' }
    }
    
    // 获取个人 Claw 信息
    const claw = await fastify.db.query(
      `SELECT id, name, storage_quota, storage_used 
       FROM personal_claws WHERE user_id = $1`,
      [userId]
    )
    
    return {
      success: true,
      data: {
        ...result.rows[0],
        claw: claw.rows[0] || null
      }
    }
  })

  // 更新用户信息
  fastify.patch('/me', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['用户'],
      summary: '更新用户信息'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { name, avatarUrl, phone } = request.body as any
    
    await fastify.db.query(
      `UPDATE users SET name = COALESCE($1, name), 
                        avatar_url = COALESCE($2, avatar_url),
                        phone = COALESCE($3, phone),
                        updated_at = NOW()
       WHERE id = $4`,
      [name, avatarUrl, phone, userId]
    )
    
    return { success: true, message: '更新成功' }
  })

  // 获取用户习惯
  fastify.get('/me/habits', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['用户'],
      summary: '获取用户习惯'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    
    const result = await fastify.db.query(
      `SELECT habit_type, habit_data, frequency, last_occurred
       FROM user_habits WHERE user_id = $1
       ORDER BY frequency DESC`,
      [userId]
    )
    
    return {
      success: true,
      data: result.rows
    }
  })

  // 记录用户习惯
  fastify.post('/me/habits', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['用户'],
      summary: '记录用户习惯'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { habitType, habitData } = request.body as any
    
    await fastify.db.query(
      `INSERT INTO user_habits (user_id, habit_type, habit_data, frequency, last_occurred)
       VALUES ($1, $2, $3, 1, NOW())
       ON CONFLICT (user_id, habit_type)
       DO UPDATE SET 
         frequency = user_habits.frequency + 1,
         habit_data = EXCLUDED.habit_data,
         last_occurred = NOW()`,
      [userId, habitType, JSON.stringify(habitData || {})]
    )
    
    return { success: true }
  })

  // 获取我的连接
  fastify.get('/me/connections', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['用户'],
      summary: '获取我的企业连接'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    
    const result = await fastify.db.query(
      `SELECT e.id, e.name, e.logo_url, e.plan,
              c.status, c.connected_at, c.disconnected_at,
              em.role
       FROM user_enterprise_connections c
       JOIN enterprises e ON c.enterprise_id = e.id
       LEFT JOIN enterprise_members em ON em.enterprise_id = e.id AND em.user_id = $1
       WHERE c.user_id = $1
       ORDER BY c.connected_at DESC`,
      [userId]
    )
    
    return {
      success: true,
      data: result.rows
    }
  })
}

export default userRoutes