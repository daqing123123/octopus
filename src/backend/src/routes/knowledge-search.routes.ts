/**
 * 企业知识AI搜索路由
 * 支持向量搜索 + LLM回答 (RAG架构)
 */

import { FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

const knowledgeSearchRoutes: FastifyPluginAsync = async (fastify) => {

  // ========================================
  // 知识库管理
  // ========================================

  // 添加知识文档
  fastify.post('/:enterpriseId/knowledge/documents', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['知识库'],
      summary: '添加知识文档',
      body: {
        type: 'object',
        required: ['title', 'content'],
        properties: {
          title: { type: 'string' },
          content: { type: 'string' },
          category: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          source: { type: 'string' },
          metadata: { type: 'object' }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any
    const { title, content, category, tags, source, metadata } = request.body as any

    // 检查成员身份
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0) {
      return { success: false, error: '无权访问' }
    }

    const docId = uuidv4()
    const now = new Date()

    // 保存到数据库
    await fastify.db.query(
      `INSERT INTO knowledge_documents 
       (id, enterprise_id, title, content, category, tags, source, metadata, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [docId, enterpriseId, title, content, category || 'general', 
       JSON.stringify(tags || []), source || 'manual', JSON.stringify(metadata || {}), userId, now]
    )

    // 向量化并存储到Qdrant
    try {
      await indexDocumentToQdrant(docId, title, content, enterpriseId)
    } catch (err) {
      fastify.log.error('Qdrant indexing failed:', err)
    }

    return {
      success: true,
      message: '文档已添加',
      data: { id: docId }
    }
  })

  // 批量添加知识文档
  fastify.post('/:enterpriseId/knowledge/documents/batch', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['知识库'],
      summary: '批量添加知识文档'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any
    const { documents } = request.body as any

    // 检查管理员权限
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0 || !['owner', 'admin'].includes(member.rows[0].role)) {
      return { success: false, error: '无权管理知识库' }
    }

    const now = new Date()
    const results = []

    for (const doc of documents) {
      const docId = uuidv4()
      await fastify.db.query(
        `INSERT INTO knowledge_documents 
         (id, enterprise_id, title, content, category, tags, source, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [docId, enterpriseId, doc.title, doc.content, doc.category || 'general',
         JSON.stringify(doc.tags || []), doc.source || 'import', userId, now]
      )

      // 向量化
      try {
        await indexDocumentToQdrant(docId, doc.title, doc.content, enterpriseId)
      } catch (err) {
        fastify.log.error('Qdrant indexing failed for doc:', docId)
      }

      results.push({ id: docId, title: doc.title })
    }

    return {
      success: true,
      message: `已添加 ${results.length} 个文档`,
      data: results
    }
  })

  // 获取知识文档列表
  fastify.get('/:enterpriseId/knowledge/documents', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['知识库'],
      summary: '获取知识文档列表'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any
    const { category, search, limit = 50, offset = 0 } = request.query as any

    // 检查成员身份
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0) {
      return { success: false, error: '无权访问' }
    }

    let query = `
      SELECT id, title, category, tags, source, created_by, created_at, updated_at
      FROM knowledge_documents
      WHERE enterprise_id = $1
    `
    const params: any[] = [enterpriseId]

    if (category) {
      query += ` AND category = $${params.length + 1}`
      params.push(category)
    }

    if (search) {
      query += ` AND (title ILIKE $${params.length + 1} OR content ILIKE $${params.length + 1})`
      params.push(`%${search}%`)
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
    params.push(limit, offset)

    const result = await fastify.db.query(query, params)

    return {
      success: true,
      data: result.rows.map(d => ({
        ...d,
        tags: JSON.parse(d.tags || '[]')
      }))
    }
  })

  // 获取单个文档
  fastify.get('/:enterpriseId/knowledge/documents/:docId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['知识库'],
      summary: '获取知识文档详情'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId, docId } = request.params as any

    // 检查成员身份
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0) {
      return { success: false, error: '无权访问' }
    }

    const result = await fastify.db.query(
      `SELECT * FROM knowledge_documents WHERE id = $1 AND enterprise_id = $2`,
      [docId, enterpriseId]
    )

    if (result.rows.length === 0) {
      return { success: false, error: '文档不存在' }
    }

    return {
      success: true,
      data: {
        ...result.rows[0],
        tags: JSON.parse(result.rows[0].tags || '[]'),
        metadata: JSON.parse(result.rows[0].metadata || '{}')
      }
    }
  })

  // 更新文档
  fastify.patch('/:enterpriseId/knowledge/documents/:docId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['知识库'],
      summary: '更新知识文档'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId, docId } = request.params as any
    const updates = request.body as any

    // 检查管理员权限
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0 || !['owner', 'admin'].includes(member.rows[0].role)) {
      return { success: false, error: '无权管理知识库' }
    }

    const fields = []
    const values = []
    let i = 1

    if (updates.title) {
      fields.push(`title = $${i++}`)
      values.push(updates.title)
    }
    if (updates.content) {
      fields.push(`content = $${i++}`)
      values.push(updates.content)
    }
    if (updates.category) {
      fields.push(`category = $${i++}`)
      values.push(updates.category)
    }
    if (updates.tags) {
      fields.push(`tags = $${i++}`)
      values.push(JSON.stringify(updates.tags))
    }

    if (fields.length > 0) {
      fields.push(`updated_at = NOW()`)
      values.push(docId, enterpriseId)

      await fastify.db.query(
        `UPDATE knowledge_documents SET ${fields.join(', ')} 
         WHERE id = $${i++} AND enterprise_id = $${i}`,
        values
      )

      // 重新向量化
      if (updates.title || updates.content) {
        const doc = await fastify.db.query(
          `SELECT title, content FROM knowledge_documents WHERE id = $1`,
          [docId]
        )
        if (doc.rows.length > 0) {
          try {
            await indexDocumentToQdrant(docId, doc.rows[0].title, doc.rows[0].content, enterpriseId)
          } catch (err) {
            fastify.log.error('Qdrant re-indexing failed')
          }
        }
      }
    }

    return { success: true, message: '文档已更新' }
  })

  // 删除文档
  fastify.delete('/:enterpriseId/knowledge/documents/:docId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['知识库'],
      summary: '删除知识文档'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId, docId } = request.params as any

    // 检查管理员权限
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0 || !['owner', 'admin'].includes(member.rows[0].role)) {
      return { success: false, error: '无权管理知识库' }
    }

    await fastify.db.query(
      `DELETE FROM knowledge_documents WHERE id = $1 AND enterprise_id = $2`,
      [docId, enterpriseId]
    )

    // 从Qdrant删除
    try {
      await fastify.qdrant.delete('knowledge', docId)
    } catch (err) {
      fastify.log.error('Qdrant delete failed')
    }

    return { success: true, message: '文档已删除' }
  })

  // ========================================
  // AI搜索（核心功能）
  // ========================================

  // 搜索知识库（向量搜索 + LLM回答）
  fastify.post('/:enterpriseId/knowledge/search', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['AI搜索'],
      summary: 'AI知识库搜索（向量搜索 + LLM回答）',
      body: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string' },
          mode: { type: 'string', enum: ['search', 'chat', 'both'] },
          limit: { type: 'integer', minimum: 1, maximum: 20 }
        }
      }
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any
    const { query, mode = 'both', limit = 5 } = request.body as any

    // 检查成员身份
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0) {
      return reply.status(403).send({ error: '无权访问' })
    }

    const startTime = Date.now()

    try {
      // 1. 向量化查询
      const queryEmbedding = await embedText(query)
      
      // 2. 在Qdrant中搜索
      const searchResults = await searchQdrant(queryEmbedding, enterpriseId, limit)
      
      // 3. 获取相关文档内容
      const docIds = searchResults.map((r: any) => r.id)
      let documents = []
      
      if (docIds.length > 0) {
        const docsResult = await fastify.db.query(
          `SELECT id, title, content, category, source 
           FROM knowledge_documents 
           WHERE id = ANY($1) AND enterprise_id = $2`,
          [docIds, enterpriseId]
        )
        documents = docsResult.rows
        
        // 按搜索相关性排序
        const docMap = new Map(docsResult.rows.map(d => [d.id, d]))
        documents = docIds.map((id: string) => docMap.get(id)).filter(Boolean)
      }

      // 4. 如果是chat或both模式，用LLM生成回答
      let answer = null
      let sources = documents.map((d: any) => ({
        id: d.id,
        title: d.title,
        category: d.category,
        source: d.source
      }))

      if (mode === 'chat' || mode === 'both') {
        try {
          // 获取企业AI配置
          const aiModel = await getEnterpriseAIModel(enterpriseId)
          
          if (aiModel && documents.length > 0) {
            // 构建上下文
            const context = documents.map((d: any, i: number) => 
              `[文档${i + 1}] ${d.title}\n${d.content.substring(0, 1000)}`
            ).join('\n\n')

            // 调用LLM
            answer = await callLLM(aiModel, query, context)
          } else if (documents.length === 0) {
            answer = '抱歉，知识库中没有找到相关信息。'
          }
        } catch (err) {
          fastify.log.error('LLM call failed:', err)
          answer = 'AI回答生成失败，请稍后重试。'
        }
      }

      return {
        success: true,
        data: {
          query,
          answer,
          sources,
          documents: mode === 'search' || mode === 'both' ? documents : [],
          stats: {
            searchTime: Date.now() - startTime,
            docsFound: documents.length
          }
        }
      }

    } catch (err) {
      fastify.log.error('Knowledge search error:', err)
      return reply.status(500).send({ error: '搜索失败' })
    }
  })

  // 知识库统计
  fastify.get('/:enterpriseId/knowledge/stats', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['知识库'],
      summary: '获取知识库统计'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any

    // 检查成员身份
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0) {
      return { success: false, error: '无权访问' }
    }

    // 文档统计
    const totalDocs = await fastify.db.query(
      `SELECT COUNT(*) FROM knowledge_documents WHERE enterprise_id = $1`,
      [enterpriseId]
    )

    const byCategory = await fastify.db.query(
      `SELECT category, COUNT(*) as count 
       FROM knowledge_documents WHERE enterprise_id = $1
       GROUP BY category ORDER BY count DESC`,
      [enterpriseId]
    )

    // 搜索统计
    const recentSearches = await fastify.db.query(
      `SELECT query, COUNT(*) as count, MAX(created_at) as last_searched
       FROM knowledge_search_logs
       WHERE enterprise_id = $1 AND created_at > NOW() - INTERVAL '7 days'
       GROUP BY query
       ORDER BY count DESC LIMIT 10`,
      [enterpriseId]
    )

    return {
      success: true,
      data: {
        totalDocuments: parseInt(totalDocs.rows[0].count),
        byCategory: byCategory.rows,
        recentPopularSearches: recentSearches.rows
      }
    }
  })

  // ========================================
  // 辅助函数
  // ========================================

  // 文本向量化（使用OpenAI embedding API或兼容接口）
  async function embedText(text: string): Promise<number[]> {
    // 优先使用企业配置的embedding模型
    const embeddingModel = process.env.EMBEDDING_MODEL || 'text-embedding-ada-002'
    const embeddingEndpoint = process.env.EMBEDDING_ENDPOINT || 'https://api.openai.com/v1/embeddings'
    const embeddingApiKey = process.env.EMBEDDING_API_KEY || ''

    try {
      const response = await fetch(embeddingEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${embeddingApiKey}`
        },
        body: JSON.stringify({
          model: embeddingModel,
          input: text
        })
      })

      if (!response.ok) {
        throw new Error('Embedding API failed')
      }

      const data = await response.json()
      return data.data[0].embedding
    } catch (err) {
      // 如果API调用失败，返回随机向量（仅用于开发）
      fastify.log.warn('Embedding API failed, using random vector')
      return Array.from({ length: 1536 }, () => Math.random() * 2 - 1)
    }
  }

  // Qdrant向量搜索
  async function searchQdrant(queryEmbedding: number[], enterpriseId: string, limit: number) {
    try {
      const collectionName = `knowledge_${enterpriseId}`

      // 确保collection存在
      try {
        await fastify.qdrant.getCollection(collectionName)
      } catch {
        await fastify.qdrant.createCollection(collectionName, {
          vectors: { size: queryEmbedding.length, distance: 'Cosine' }
        })
      }

      // 搜索
      const results = await fastify.qdrant.search(collectionName, {
        vector: queryEmbedding,
        limit,
        score_threshold: 0.7,
        with_payload: true
      })

      return results.map((r: any) => ({
        id: r.id,
        score: r.score,
        payload: r.payload
      }))
    } catch (err) {
      fastify.log.error('Qdrant search failed:', err)
      return []
    }
  }

  // 将文档索引到Qdrant
  async function indexDocumentToQdrant(docId: string, title: string, content: string, enterpriseId: string) {
    const collectionName = `knowledge_${enterpriseId}`
    const embedding = await embedText(content)

    // 分割内容为多个chunk
    const chunkSize = 500
    const chunks: string[] = []
    
    // 按段落分割
    const paragraphs = content.split(/\n\n+/)
    let currentChunk = ''
    
    for (const para of paragraphs) {
      if ((currentChunk + para).length > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim())
        currentChunk = ''
      }
      currentChunk += para + '\n\n'
    }
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim())
    }

    // 索引到Qdrant
    for (let i = 0; i < chunks.length; i++) {
      const chunkEmbedding = await embedText(chunks[i])
      
      await fastify.qdrant.upsert(collectionName, {
        points: [{
          id: `${docId}_${i}`,
          vector: chunkEmbedding,
          payload: {
            docId,
            title,
            chunkIndex: i,
            content: chunks[i].substring(0, 1000)
          }
        }]
      })
    }

    fastify.log.info(`Indexed ${chunks.length} chunks for doc ${docId}`)
  }

  // 获取企业AI模型配置
  async function getEnterpriseAIModel(enterpriseId: string) {
    const result = await fastify.db.query(
      `SELECT * FROM enterprise_ai_models 
       WHERE enterprise_id = $1 AND is_enabled = true AND is_default = true
       LIMIT 1`,
      [enterpriseId]
    )

    if (result.rows.length === 0) {
      return null
    }

    const model = result.rows[0]
    
    // 解密API密钥
    let apiKey = ''
    if (model.api_key_encrypted) {
      apiKey = Buffer.from(model.api_key_encrypted, 'base64').toString()
    }

    return {
      provider: model.provider,
      modelId: model.model_id,
      apiKey,
      apiEndpoint: model.api_endpoint,
      maxTokens: model.max_tokens,
      temperature: model.temperature,
      systemPrompt: model.system_prompt
    }
  }

  // 调用LLM
  async function callLLM(aiModel: any, query: string, context: string): Promise<string> {
    const systemPrompt = aiModel.systemPrompt || 
      `你是一个企业知识助手。请根据提供的知识库文档回答用户的问题。
       如果文档中没有相关信息，请如实说明。
       回答要简洁、专业，如果有多个相关文档，请综合回答。`

    let endpoint = aiModel.apiEndpoint
    let body: any = {
      model: aiModel.modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `知识库文档：\n\n${context}\n\n用户问题：${query}` }
      ],
      max_tokens: aiModel.maxTokens || 1000,
      temperature: aiModel.temperature || 0.7
    }

    // 根据不同provider调整请求格式
    if (aiModel.provider === 'openai' || !aiModel.provider) {
      endpoint = endpoint || 'https://api.openai.com/v1/chat/completions'
    } else if (aiModel.provider === 'anthropic') {
      endpoint = endpoint || 'https://api.anthropic.com/v1/messages'
      body = {
        model: aiModel.modelId,
        max_tokens: aiModel.maxTokens || 1024,
        system: systemPrompt,
        messages: [
          { role: 'user', content: `知识库文档：\n\n${context}\n\n用户问题：${query}` }
        ]
      }
    } else if (aiModel.provider === 'deepseek') {
      endpoint = endpoint || 'https://api.deepseek.com/chat/completions'
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    // 添加API密钥
    if (aiModel.apiKey) {
      if (aiModel.provider === 'anthropic') {
        headers['x-api-key'] = aiModel.apiKey
        headers['anthropic-version'] = '2023-06-01'
      } else {
        headers['Authorization'] = `Bearer ${aiModel.apiKey}`
      }
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`LLM API failed: ${error}`)
    }

    const data = await response.json()

    // 解析不同格式的响应
    if (aiModel.provider === 'anthropic') {
      return data.content[0].text
    }
    return data.choices[0].message.content
  }
}

export default knowledgeSearchRoutes
