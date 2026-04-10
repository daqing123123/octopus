import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import websocket from '@fastify/websocket'
import { Pool } from 'pg'
import Redis from 'ioredis'
import { Client as QdrantClient } from 'qdrant-client'
import { Client as MinioClient } from 'minio'
import dotenv from 'dotenv'

import userRoutes from './routes/user.routes'
import authRoutes from './routes/auth.routes'
import enterpriseRoutes from './routes/enterprise.routes'
import messageRoutes from './routes/message.routes'
import tableRoutes from './routes/table.routes'
import documentRoutes from './routes/document.routes'
import taskRoutes from './routes/task.routes'
import fileRoutes from './routes/file.routes'
import aiRoutes from './routes/ai.routes'
import okrRoutes from './routes/okr.routes'
import calendarRoutes from './routes/calendar.routes'
import clawRoutes from './routes/claw.routes'
import clawKnowledgeRoutes from './routes/claw-knowledge.routes'
import clawProactiveRoutes from './routes/claw-proactive.routes'
import clawMemoryRoutes from './routes/claw-memory.routes'
import clawPrivacyRoutes from './routes/claw-privacy.routes'
import clawAgentRoutes from './routes/claw-agent.routes'
import clawSyncRoutes from './routes/claw-sync.routes'
import employeeProfileRoutes from './routes/employee-profile.routes'
import companyInfoRoutes from './routes/company-info.routes'
import enterpriseClawRoutes from './routes/enterprise-claw.routes'
import notificationRoutes from './routes/notification.routes'
import onboardingWizardRoutes from './routes/onboarding-wizard.routes'
import directoryRoutes from './routes/directory.routes'
import profileCompletenessRoutes from './routes/profile-completeness.routes'
import meetingRoutes from './routes/meeting.routes'
import connectionCapabilityRoutes from './routes/connection-capability.routes'
import enterpriseCapabilityAdminRoutes from './routes/enterprise-capability-admin.routes'
import knowledgeSearchRoutes from './routes/knowledge-search.routes'
import workflowEngineRoutes from './routes/workflow-engine.routes'
import directoryOrgRoutes from './routes/directory-org.routes'
import onboardingWizard2Routes from './routes/onboarding-wizard2.routes'
import messagesSummaryRoutes from './routes/messages-summary.routes'

dotenv.config()

// 初始化 Fastify
const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true
      }
    }
  }
})

// 数据库连接池
const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'octopus',
  user: process.env.DB_USER || 'octopus',
  password: process.env.DB_PASSWORD || 'octopus123',
  max: 20
})

// Redis 连接
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379')
})

// Qdrant 向量数据库
const qdrant = new QdrantClient({
  host: process.env.QDRANT_HOST || 'localhost',
  port: parseInt(process.env.QDRANT_PORT || '6333')
})

// MinIO 对象存储
const minio = new MinioClient({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'octopus',
  secretKey: process.env.MINIO_SECRET_KEY || 'octopus123'
})

// 注册插件
async function registerPlugins() {
  // CORS
  await fastify.register(cors, {
    origin: true,
    credentials: true
  })

  // JWT
  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET || 'octopus-secret-key-change-in-production'
  })

  // WebSocket
  await fastify.register(websocket)

  // Swagger
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: '🐙 八爪鱼 API',
        description: '企业级AI办公平台 API 文档',
        version: '0.1.0'
      },
      servers: [
        { url: 'http://localhost:3000', description: '开发服务器' }
      ]
    }
  })

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true
    }
  })
}

// 注册路由
async function registerRoutes() {
  // 健康检查
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        database: await checkDatabase(),
        redis: await checkRedis(),
        qdrant: await checkQdrant(),
        minio: await checkMinio()
      }
    }
  })

  // API 路由
  fastify.register(authRoutes, { prefix: '/api/auth' })
  fastify.register(userRoutes, { prefix: '/api/users' })
  fastify.register(enterpriseRoutes, { prefix: '/api/enterprises' })
  fastify.register(messageRoutes, { prefix: '/api/messages' })
  fastify.register(tableRoutes, { prefix: '/api/tables' })
  fastify.register(documentRoutes, { prefix: '/api/documents' })
  fastify.register(taskRoutes, { prefix: '/api/tasks' })
  fastify.register(fileRoutes, { prefix: '/api/files' })
  fastify.register(aiRoutes, { prefix: '/api/ai' })
  fastify.register(okrRoutes, { prefix: '/api/okr' })
  fastify.register(calendarRoutes, { prefix: '/api/calendar' })
  fastify.register(clawRoutes, { prefix: '/api/claw' })
  // 个人Claw扩展功能路由
  fastify.register(clawKnowledgeRoutes, { prefix: '/api/claw' })   // 知识图谱 + 生产力 + 技能雷达
  fastify.register(clawProactiveRoutes, { prefix: '/api/claw' })   // 提醒 + 周报 + 会议准备 + 入职引导
  fastify.register(clawMemoryRoutes, { prefix: '/api/claw' })      // 人物关系 + 重要时刻 + 对话记忆 + 遗忘曲线
  fastify.register(clawPrivacyRoutes, { prefix: '/api/claw' })     // 隐私控制 + AI偏好 + 人格
  fastify.register(clawAgentRoutes, { prefix: '/api/claw' })      // Agent克隆 + 商店 + 学习反馈
  fastify.register(clawSyncRoutes, { prefix: '/api/claw' })       // 跨设备同步 + 工具集成 + 数据导入
  // 触手与八爪鱼员工生命周期路由
  fastify.register(employeeProfileRoutes, { prefix: '/api/me' })   // 触手档案（个人侧）
  fastify.register(companyInfoRoutes, { prefix: '/api' })          // 公司公共信息 + 公告 + 触手知识库
  fastify.register(enterpriseClawRoutes, { prefix: '/api' })       // 企业Claw管理（大脑侧）
  // 5大新功能路由
  fastify.register(notificationRoutes, { prefix: '/api' })          // 实时通知中心
  fastify.register(onboardingWizardRoutes, { prefix: '/api' })     // 入职向导
  fastify.register(directoryRoutes, { prefix: '/api' })             // 通讯录 & 组织架构
  fastify.register(profileCompletenessRoutes, { prefix: '/api' })   // 档案完善度评分
  fastify.register(meetingRoutes, { prefix: '/api' })               // 视频会议
  // 连接即获取企业能力路由
  fastify.register(connectionCapabilityRoutes, { prefix: '/api' })   // 触手获取企业能力
  fastify.register(enterpriseCapabilityAdminRoutes, { prefix: '/api/admin' })  // 管理员配置能力
  // 知识搜索路由
  fastify.register(knowledgeSearchRoutes, { prefix: '/api' })         // 企业知识AI搜索
  // 工作流引擎路由
  fastify.register(workflowEngineRoutes, { prefix: '/api' })        // 工作流执行引擎
  // 通讯录路由
  fastify.register(directoryOrgRoutes, { prefix: '/api' })          // 通讯录与组织架构
  // 入职向导2.0路由
  fastify.register(onboardingWizard2Routes, { prefix: '/api' })      // 智能入职向导
  // 消息摘要路由
  fastify.register(messagesSummaryRoutes, { prefix: '/api' })       // 消息摘要与数据导出
}

// 健康检查函数
async function checkDatabase(): Promise<string> {
  try {
    await db.query('SELECT 1')
    return 'connected'
  } catch {
    return 'disconnected'
  }
}

async function checkRedis(): Promise<string> {
  try {
    await redis.ping()
    return 'connected'
  } catch {
    return 'disconnected'
  }
}

async function checkQdrant(): Promise<string> {
  try {
    await qdrant.getCollections()
    return 'connected'
  } catch {
    return 'disconnected'
  }
}

async function checkMinio(): Promise<string> {
  try {
    await minio.listBuckets()
    return 'connected'
  } catch {
    return 'disconnected'
  }
}

// 装饰器：将实例挂载到 fastify
fastify.decorate('db', db)
fastify.decorate('redis', redis)
fastify.decorate('qdrant', qdrant)
fastify.decorate('minio', minio)

// 启动服务器
async function start() {
  try {
    await registerPlugins()
    await registerRoutes()

    const port = parseInt(process.env.PORT || '3000')
    const host = process.env.HOST || '0.0.0.0'

    // 创建 HTTP 服务器用于 WebSocket
    const server = createServer()
    
    // 设置 WebSocket
    setupWebSocket(fastify, server)
    
    await fastify.ready()
    
    // 同时监听 HTTP 和 WebSocket
    server.listen(port, host, () => {
      console.log(`
    🐙 八爪鱼后端服务已启动
    📍 地址: http://${host}:${port}
    📖 文档: http://${host}:${port}/docs
    🔌 WebSocket: ws://${host}:${port}
      `)
    })
    
    // 将 fastify 的路由绑定到 server
    fastify.server = server
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('收到 SIGTERM 信号，正在关闭服务器...')
  await fastify.close()
  await db.end()
  redis.disconnect()
  process.exit(0)
})

start()

// 导出类型声明
declare module 'fastify' {
  interface FastifyInstance {
    db: Pool
    redis: Redis
    qdrant: QdrantClient
    minio: MinioClient
    authenticate: () => void
  }
}
