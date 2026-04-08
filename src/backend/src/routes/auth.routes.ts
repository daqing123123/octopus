import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'

// 验证 schema
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(100),
  phone: z.string().optional()
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
})

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // 注册
  fastify.post('/register', {
    schema: {
      tags: ['认证'],
      summary: '用户注册',
      body: {
        type: 'object',
        required: ['email', 'password', 'name'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          name: { type: 'string', minLength: 2 },
          phone: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const body = registerSchema.parse(request.body)
    
    // 检查邮箱是否已存在
    const existingUser = await fastify.db.query(
      'SELECT id FROM users WHERE email = $1',
      [body.email]
    )
    
    if (existingUser.rows.length > 0) {
      return reply.status(400).send({ error: '邮箱已被注册' })
    }

    // 加密密码
    const passwordHash = await bcrypt.hash(body.password, 10)
    
    // 创建用户
    const userId = uuidv4()
    await fastify.db.query(
      `INSERT INTO users (id, email, password_hash, name, phone)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, body.email, passwordHash, body.name, body.phone]
    )

    // 创建个人 Claw
    await fastify.db.query(
      `INSERT INTO personal_claws (user_id, name)
       VALUES ($1, $2)`,
      [userId, `${body.name} 的 Claw`]
    )

    // 生成 JWT
    const token = fastify.jwt.sign({ userId, email: body.email })

    return {
      success: true,
      data: {
        userId,
        email: body.email,
        name: body.name,
        token
      }
    }
  })

  // 登录
  fastify.post('/login', {
    schema: {
      tags: ['认证'],
      summary: '用户登录',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const body = loginSchema.parse(request.body)
    
    // 查找用户
    const result = await fastify.db.query(
      'SELECT id, email, password_hash, name, avatar_url, status FROM users WHERE email = $1',
      [body.email]
    )
    
    if (result.rows.length === 0) {
      return reply.status(401).send({ error: '邮箱或密码错误' })
    }

    const user = result.rows[0]
    
    // 验证密码
    const validPassword = await bcrypt.compare(body.password, user.password_hash)
    if (!validPassword) {
      return reply.status(401).send({ error: '邮箱或密码错误' })
    }

    // 检查用户状态
    if (user.status !== 'active') {
      return reply.status(403).send({ error: '账户已被禁用' })
    }

    // 更新最后登录时间
    await fastify.db.query(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1',
      [user.id]
    )

    // 生成 JWT
    const token = fastify.jwt.sign({ userId: user.id, email: user.email })

    return {
      success: true,
      data: {
        userId: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar_url,
        token
      }
    }
  })

  // 刷新 token
  fastify.post('/refresh', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['认证'],
      summary: '刷新访问令牌'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    
    const result = await fastify.db.query(
      'SELECT id, email FROM users WHERE id = $1',
      [userId]
    )
    
    if (result.rows.length === 0) {
      return { success: false, error: '用户不存在' }
    }

    const user = result.rows[0]
    const token = fastify.jwt.sign({ userId: user.id, email: user.email })

    return {
      success: true,
      data: { token }
    }
  })

  // 退出登录
  fastify.post('/logout', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['认证'],
      summary: '退出登录'
    }
  }, async (request, reply) => {
    // 可以在这里将 token 加入黑名单
    const token = request.headers.authorization?.replace('Bearer ', '')
    if (token) {
      await fastify.redis.set(`blacklist:${token}`, '1', 'EX', 86400 * 7) // 7天过期
    }
    
    return { success: true, message: '已退出登录' }
  })
}

// JWT 认证中间件
fastify.decorate('authenticate', async function(request: any, reply: any) {
  try {
    await request.jwtVerify()
    
    // 检查 token 是否在黑名单
    const token = request.headers.authorization?.replace('Bearer ', '')
    if (token) {
      const blacklisted = await fastify.redis.get(`blacklist:${token}`)
      if (blacklisted) {
        return reply.status(401).send({ error: 'Token 已失效' })
      }
    }
  } catch (err) {
    return reply.status(401).send({ error: '未授权访问' })
  }
})

export default authRoutes
