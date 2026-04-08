import { FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

const aiRoutes: FastifyPluginAsync = async (fastify) => {
  
  // AI 对话
  fastify.post('/chat', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['AI'],
      summary: 'AI 对话'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { message, conversationId, context } = request.body as any
    
    // 获取用户可用的模型
    const modelConfig = await getAvailableModel(fastify, userId)
    
    if (!modelConfig) {
      return {
        success: false,
        error: '未配置 AI 模型，请联系管理员'
      }
    }
    
    // 获取用户记忆/上下文
    const memories = await getUserMemories(fastify, userId, message)
    
    // 调用 AI 模型
    const response = await callAIModel(modelConfig, message, {
      userId,
      conversationId,
      memories,
      context
    })
    
    // 存储记忆
    await storeMemory(fastify, userId, message, response.content)
    
    // 更新使用量
    await updateModelUsage(fastify, userId, modelConfig.enterpriseId, response.tokens)
    
    return {
      success: true,
      data: {
        content: response.content,
        conversationId,
        model: response.model
      }
    }
  })

  // 文本生成
  fastify.post('/generate', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['AI'],
      summary: 'AI 文本生成'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { type, input, options } = request.body as any
    
    const modelConfig = await getAvailableModel(fastify, userId)
    
    if (!modelConfig) {
      return { success: false, error: '未配置 AI 模型' }
    }
    
    // 根据类型选择 prompt
    const prompts: Record<string, string> = {
      'write': `请根据以下要求写作：\n${input}`,
      'rewrite': `请润色改写以下文本：\n${input}`,
      'translate': `请将以下内容翻译成${options?.targetLang || '英文'}：\n${input}`,
      'summarize': `请总结以下内容：\n${input}`,
      'expand': `请扩展以下内容：\n${input}`,
      'outline': `请为以下主题生成大纲：\n${input}`
    }
    
    const prompt = prompts[type] || input
    const response = await callAIModel(modelConfig, prompt, { userId })
    
    await updateModelUsage(fastify, userId, modelConfig.enterpriseId, response.tokens)
    
    return {
      success: true,
      data: {
        content: response.content,
        type
      }
    }
  })

  // 代码助手
  fastify.post('/code', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['AI'],
      summary: 'AI 代码助手'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { action, code, language, description } = request.body as any
    
    const modelConfig = await getAvailableModel(fastify, userId)
    
    if (!modelConfig) {
      return { success: false, error: '未配置 AI 模型' }
    }
    
    const prompts: Record<string, string> = {
      'generate': `请用 ${language} 编写代码：${description}`,
      'explain': `请解释以下 ${language} 代码：\n\`\`\`${language}\n${code}\n\`\`\``,
      'debug': `请找出以下 ${language} 代码中的错误并修复：\n\`\`\`${language}\n${code}\n\`\`\``,
      'optimize': `请优化以下 ${language} 代码：\n\`\`\`${language}\n${code}\n\`\`\``,
      'test': `请为以下 ${language} 代码编写单元测试：\n\`\`\`${language}\n${code}\n\`\`\``
    }
    
    const prompt = prompts[action] || description
    const response = await callAIModel(modelConfig, prompt, { userId })
    
    await updateModelUsage(fastify, userId, modelConfig.enterpriseId, response.tokens)
    
    return {
      success: true,
      data: {
        content: response.content,
        action
      }
    }
  })

  // 表格 AI 填充
  fastify.post('/table/fill', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['AI'],
      summary: 'AI 智能填充表格'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { tableId, rowId, fieldId, prompt } = request.body as any
    
    const modelConfig = await getAvailableModel(fastify, userId)
    
    if (!modelConfig) {
      return { success: false, error: '未配置 AI 模型' }
    }
    
    // 获取表格上下文
    const tableContext = await getTableContext(fastify, tableId, rowId)
    
    const fullPrompt = `根据以下表格数据上下文，${prompt}\n\n上下文：\n${JSON.stringify(tableContext, null, 2)}`
    
    const response = await callAIModel(modelConfig, fullPrompt, { userId })
    
    await updateModelUsage(fastify, userId, modelConfig.enterpriseId, response.tokens)
    
    return {
      success: true,
      data: {
        content: response.content,
        fieldId
      }
    }
  })

  // 文档 AI 助手
  fastify.post('/document/assist', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['AI'],
      summary: '文档 AI 助手'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { documentId, action, selectedText, context } = request.body as any
    
    const modelConfig = await getAvailableModel(fastify, userId)
    
    if (!modelConfig) {
      return { success: false, error: '未配置 AI 模型' }
    }
    
    const prompts: Record<string, string> = {
      'continue': `请续写以下内容：\n${selectedText}`,
      'rewrite': `请改写以下内容：\n${selectedText}`,
      'explain': `请解释以下内容：\n${selectedText}`,
      'summarize': `请总结以下内容：\n${context}`,
      'translate': `请翻译以下内容：\n${selectedText}`,
      'expand': `请扩写以下内容：\n${selectedText}`,
      'outline': `请为以下内容生成大纲：\n${context}`
    }
    
    const prompt = prompts[action] || selectedText
    const response = await callAIModel(modelConfig, prompt, { userId })
    
    await updateModelUsage(fastify, userId, modelConfig.enterpriseId, response.tokens)
    
    return {
      success: true,
      data: {
        content: response.content,
        action
      }
    }
  })

  // 获取用户可用的模型列表
  fastify.get('/models', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['AI'],
      summary: '获取可用模型列表'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.query as any
    
    let models: any[] = []
    
    // 企业模型
    if (enterpriseId) {
      const enterpriseModels = await fastify.db.query(
        `SELECT provider, model_id, model_name, is_active
         FROM enterprise_models
         WHERE enterprise_id = $1 AND is_active = true`,
        [enterpriseId]
      )
      models = [...models, ...enterpriseModels.rows]
    }
    
    // 默认模型（免费用户的公共模型）
    const defaultModels = [
      { provider: 'openai', model_id: 'gpt-3.5-turbo', model_name: 'GPT-3.5 Turbo', is_default: true },
      { provider: 'anthropic', model_id: 'claude-3-haiku', model_name: 'Claude 3 Haiku', is_default: true }
    ]
    
    if (models.length === 0) {
      models = defaultModels
    }
    
    return {
      success: true,
      data: models
    }
  })

  // 获取对话历史
  fastify.get('/conversations', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['AI'],
      summary: '获取 AI 对话历史'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    
    // 从记忆系统获取
    const result = await fastify.db.query(
      `SELECT id, content, created_at, metadata
       FROM user_memories
       WHERE user_id = $1 AND memory_type = 'short_term'
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    )
    
    return {
      success: true,
      data: result.rows
    }
  })
}

// 辅助函数
async function getAvailableModel(fastify: any, userId: string) {
  // 获取用户的企业
  const enterprises = await fastify.db.query(
    `SELECT enterprise_id FROM enterprise_members 
     WHERE user_id = $1 AND status = 'active'`,
    [userId]
  )
  
  if (enterprises.rows.length > 0) {
    // 获取企业模型
    const model = await fastify.db.query(
      `SELECT provider, model_id, enterprise_id
       FROM enterprise_models
       WHERE enterprise_id = $1 AND is_active = true
       LIMIT 1`,
      [enterprises.rows[0].enterprise_id]
    )
    
    if (model.rows.length > 0) {
      return {
        provider: model.rows[0].provider,
        modelId: model.rows[0].model_id,
        enterpriseId: model.rows[0].enterprise_id
      }
    }
  }
  
  // 默认模型
  return {
    provider: 'openai',
    modelId: 'gpt-3.5-turbo',
    enterpriseId: null
  }
}

async function callAIModel(config: any, prompt: string, context: any): Promise<any> {
  // 这里是简化的实现
  // 实际需要根据 provider 调用不同的 API
  
  const apiKey = process.env[`${config.provider.toUpperCase()}_API_KEY`]
  
  // 模拟响应（实际需要真实 API 调用）
  return {
    content: `这是一个模拟的 AI 响应。实际部署时需要配置真实的 API 密钥。\n\n您的输入：${prompt.slice(0, 100)}...`,
    model: config.modelId,
    tokens: { input: 100, output: 200 }
  }
}

async function getUserMemories(fastify: any, userId: string, query: string): Promise<any[]> {
  const result = await fastify.db.query(
    `SELECT content, importance, created_at
     FROM user_memories
     WHERE user_id = $1
     ORDER BY importance DESC, created_at DESC
     LIMIT 10`,
    [userId]
  )
  
  return result.rows
}

async function storeMemory(fastify: any, userId: string, input: string, output: string) {
  const importance = calculateImportance(input, output)
  
  await fastify.db.query(
    `INSERT INTO user_memories (user_id, content, importance, memory_type)
     VALUES ($1, $2, $3, 'short_term')`,
    [userId, `用户: ${input}\nAI: ${output}`, importance]
  )
}

function calculateImportance(input: string, output: string): number {
  // 简化的重要性计算
  const length = input.length + output.length
  const hasKeywords = /重要|记住|保存|设置|配置/.test(input)
  
  return Math.min(1, length / 1000 + (hasKeywords ? 0.3 : 0))
}

async function updateModelUsage(fastify: any, userId: string, enterpriseId: string | null, tokens: any) {
  if (enterpriseId) {
    await fastify.db.query(
      `UPDATE enterprise_models
       SET quota_used = quota_used + $1
       WHERE enterprise_id = $2`,
      [tokens.input + tokens.output, enterpriseId]
    )
  }
}

async function getTableContext(fastify: any, tableId: string, rowId: string): Promise<any> {
  const table = await fastify.db.query(
    'SELECT fields FROM tables WHERE id = $1',
    [tableId]
  )
  
  const row = await fastify.db.query(
    'SELECT data FROM table_rows WHERE id = $1',
    [rowId]
  )
  
  return {
    fields: table.rows[0]?.fields || [],
    rowData: row.rows[0]?.data || {}
  }
}

export default aiRoutes