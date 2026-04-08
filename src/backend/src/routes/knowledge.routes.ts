import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'

// 知识空间创建 Schema
const createSpaceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  icon: z.string().optional(),
  isPublic: z.boolean().default(false),
  permissions: z.object({
    read: z.array(z.string()).optional(),  // 用户ID列表
    write: z.array(z.string()).optional(),
    admin: z.array(z.string()).optional()
  }).optional()
})

// 文档创建 Schema
const createDocSchema = z.object({
  spaceId: z.string(),
  parentId: z.string().nullable().optional(),
  title: z.string().min(1),
  content: z.string().optional(),
  tags: z.array(z.string()).optional()
})

// 文档更新 Schema
const updateDocSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  isArchived: z.boolean().optional()
})

export default async function knowledgeRoutes(fastify: FastifyInstance) {
  
  // ========================================
  // 知识空间管理
  // ========================================
  
  // 获取知识空间列表
  fastify.get('/spaces', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // @ts-ignore
      const userId = request.user?.id
      // @ts-ignore
      const enterpriseId = request.user?.enterpriseId

      // 获取公开空间 + 有权限的私有空间
      const result = await fastify.db.query(`
        SELECT ks.*, u.name as "creatorName",
          (SELECT COUNT(*) FROM knowledge_docs kd WHERE kd.space_id = ks.id AND kd.is_archived = false) as "docCount"
        FROM knowledge_spaces ks
        LEFT JOIN users u ON ks.created_by = u.id
        WHERE ks.enterprise_id = $1 
        AND (ks.is_public = true 
          OR ks.created_by = $2
          OR ks.permissions->'read' ? $2
          OR ks.permissions->'write' ? $2
          OR ks.permissions->'admin' ? $2)
        AND ks.deleted_at IS NULL
        ORDER BY ks.created_at DESC
      `, [enterpriseId, userId])

      return {
        success: true,
        data: result.rows.map(row => ({
          id: row.id,
          name: row.name,
          description: row.description,
          icon: row.icon,
          isPublic: row.is_public,
          docCount: parseInt(row.docCount),
          creator: { id: row.created_by, name: row.creatorName },
          createdAt: row.created_at
        }))
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '获取知识空间列表失败' })
    }
  })

  // 创建知识空间
  fastify.post('/spaces', async (request: FastifyRequest<{ Body: z.infer<typeof createSpaceSchema> }>, reply: FastifyReply) => {
    try {
      const spaceData = createSpaceSchema.parse(request.body)
      
      // @ts-ignore
      const userId = request.user?.id
      // @ts-ignore
      const enterpriseId = request.user?.enterpriseId
      const spaceId = uuidv4()

      const result = await fastify.db.query(`
        INSERT INTO knowledge_spaces (id, enterprise_id, name, description, icon, is_public, permissions, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        spaceId,
        enterpriseId,
        spaceData.name,
        spaceData.description,
        spaceData.icon || 'book',
        spaceData.isPublic,
        JSON.stringify(spaceData.permissions || {}),
        userId
      ])

      return {
        success: true,
        data: {
          id: result.rows[0].id,
          name: result.rows[0].name,
          description: result.rows[0].description,
          icon: result.rows[0].icon,
          isPublic: result.rows[0].is_public
        }
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '创建知识空间失败' })
    }
  })

  // 更新知识空间
  fastify.put('/spaces/:id', async (request: FastifyRequest<{ Params: { id: string }, Body: Partial<z.infer<typeof createSpaceSchema>> }>, reply: FastifyReply) => {
    try {
      const { id } = request.params
      const updates = request.body

      const result = await fastify.db.query(`
        UPDATE knowledge_spaces 
        SET name = COALESCE($1, name),
            description = COALESCE($2, description),
            icon = COALESCE($3, icon),
            is_public = COALESCE($4, is_public),
            permissions = COALESCE($5, permissions),
            updated_at = NOW()
        WHERE id = $6
        RETURNING *
      `, [
        updates.name,
        updates.description,
        updates.icon,
        updates.isPublic,
        updates.permissions ? JSON.stringify(updates.permissions) : null,
        id
      ])

      if (result.rows.length === 0) {
        return reply.code(404).send({ success: false, error: '知识空间不存在' })
      }

      return { success: true, data: result.rows[0] }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '更新失败' })
    }
  })

  // 删除知识空间
  fastify.delete('/spaces/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params

      await fastify.db.query('BEGIN')

      // 软删除所有文档
      await fastify.db.query(`
        UPDATE knowledge_docs SET is_archived = true
        WHERE space_id = $1
      `, [id])

      // 软删除空间
      await fastify.db.query(`
        UPDATE knowledge_spaces SET deleted_at = NOW() WHERE id = $1
      `, [id])

      await fastify.db.query('COMMIT')

      return { success: true }
    } catch (error) {
      await fastify.db.query('ROLLBACK')
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '删除失败' })
    }
  })

  // ========================================
  // 知识文档管理
  // ========================================
  
  // 获取文档树
  fastify.get('/spaces/:spaceId/docs', async (request: FastifyRequest<{ Params: { spaceId: string } }>, reply: FastifyReply) => {
    try {
      const { spaceId } = request.params

      const result = await fastify.db.query(`
        SELECT id, parent_id, title, tags, view_count, is_archived, created_at, updated_at
        FROM knowledge_docs
        WHERE space_id = $1
        ORDER BY title
      `, [spaceId])

      // 构建树形结构
      const docs = result.rows.map(row => ({
        id: row.id,
        parentId: row.parent_id,
        title: row.title,
        tags: row.tags,
        viewCount: row.view_count,
        isArchived: row.is_archived,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        children: []
      }))

      const docMap = new Map(docs.map(d => [d.id, d]))
      const rootDocs: any[] = []

      docs.forEach(doc => {
        if (doc.parentId && docMap.has(doc.parentId)) {
          docMap.get(doc.parentId).children.push(doc)
        } else if (!doc.isArchived) {
          rootDocs.push(doc)
        }
      })

      return {
        success: true,
        data: rootDocs
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '获取文档列表失败' })
    }
  })

  // 创建文档
  fastify.post('/docs', async (request: FastifyRequest<{ Body: z.infer<typeof createDocSchema> }>, reply: FastifyReply) => {
    try {
      const docData = createDocSchema.parse(request.body)
      
      // @ts-ignore
      const userId = request.user?.id
      const docId = uuidv4()

      const result = await fastify.db.query(`
        INSERT INTO knowledge_docs (id, space_id, parent_id, title, content, tags, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        docId,
        docData.spaceId,
        docData.parentId || null,
        docData.title,
        docData.content || '',
        JSON.stringify(docData.tags || []),
        userId
      ])

      // 如果有内容，生成向量嵌入
      if (docData.content) {
        await generateEmbedding(docId, docData.content, fastify)
      }

      return {
        success: true,
        data: {
          id: result.rows[0].id,
          spaceId: result.rows[0].space_id,
          parentId: result.rows[0].parent_id,
          title: result.rows[0].title,
          createdAt: result.rows[0].created_at
        }
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '创建文档失败' })
    }
  })

  // 获取文档详情
  fastify.get('/docs/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params

      const result = await fastify.db.query(`
        SELECT kd.*, ks.name as "spaceName", u.name as "authorName"
        FROM knowledge_docs kd
        JOIN knowledge_spaces ks ON kd.space_id = ks.id
        LEFT JOIN users u ON kd.created_by = u.id
        WHERE kd.id = $1
      `, [id])

      if (result.rows.length === 0) {
        return reply.code(404).send({ success: false, error: '文档不存在' })
      }

      // 更新浏览次数
      await fastify.db.query(`
        UPDATE knowledge_docs SET view_count = view_count + 1 WHERE id = $1
      `, [id])

      const doc = result.rows[0]

      return {
        success: true,
        data: {
          id: doc.id,
          spaceId: doc.space_id,
          spaceName: doc.spaceName,
          parentId: doc.parent_id,
          title: doc.title,
          content: doc.content,
          tags: doc.tags,
          viewCount: doc.view_count + 1,
          author: { id: doc.created_by, name: doc.authorName },
          createdAt: doc.created_at,
          updatedAt: doc.updated_at
        }
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '获取文档失败' })
    }
  })

  // 更新文档
  fastify.put('/docs/:id', async (request: FastifyRequest<{ Params: { id: string }, Body: z.infer<typeof updateDocSchema> }>, reply: FastifyReply) => {
    try {
      const { id } = request.params
      const updates = updateDocSchema.parse(request.body)

      const result = await fastify.db.query(`
        UPDATE knowledge_docs 
        SET title = COALESCE($1, title),
            content = COALESCE($2, content),
            tags = COALESCE($3, tags),
            is_archived = COALESCE($4, is_archived),
            updated_at = NOW()
        WHERE id = $5
        RETURNING *
      `, [
        updates.title,
        updates.content,
        updates.tags ? JSON.stringify(updates.tags) : null,
        updates.isArchived,
        id
      ])

      if (result.rows.length === 0) {
        return reply.code(404).send({ success: false, error: '文档不存在' })
      }

      // 如果内容更新，重新生成向量嵌入
      if (updates.content) {
        await generateEmbedding(id, updates.content, fastify)
      }

      return { success: true, data: result.rows[0] }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '更新失败' })
    }
  })

  // 删除文档
  fastify.delete('/docs/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params

      await fastify.db.query(`
        UPDATE knowledge_docs SET is_archived = true WHERE id = $1
      `, [id])

      return { success: true }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '删除失败' })
    }
  })

  // 移动文档
  fastify.patch('/docs/:id/move', async (request: FastifyRequest<{ Params: { id: string }, Body: { parentId: string | null } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params
      const { parentId } = request.body

      await fastify.db.query(`
        UPDATE knowledge_docs SET parent_id = $1, updated_at = NOW() WHERE id = $2
      `, [parentId, id])

      return { success: true }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '移动失败' })
    }
  })

  // ========================================
  // 搜索功能
  // ========================================
  
  // 全文搜索
  fastify.get('/search', async (request: FastifyRequest<{ Querystring: { q: string; spaceId?: string } }>, reply: FastifyReply) => {
    try {
      const { q, spaceId } = request.query
      
      if (!q || q.length < 2) {
        return reply.code(400).send({ success: false, error: '搜索关键词至少2个字符' })
      }

      let query = `
        SELECT kd.id, kd.title, kd.tags, ks.name as "spaceName",
               ts_headline(kd.content, plainto_tsquery($1)) as highlight
        FROM knowledge_docs kd
        JOIN knowledge_spaces ks ON kd.space_id = ks.id
        WHERE kd.is_archived = false
        AND to_tsvector('chinese', kd.title || ' ' || COALESCE(kd.content, '')) @@ plainto_tsquery($1)
      `
      const params: any[] = [q]
      
      if (spaceId) {
        query += ` AND kd.space_id = $2`
        params.push(spaceId)
      }
      
      query += ` ORDER BY ts_rank(to_tsvector('chinese', kd.title || ' ' || COALESCE(kd.content, '')), plainto_tsquery($1)) DESC LIMIT 20`

      const result = await fastify.db.query(query, params)

      return {
        success: true,
        data: result.rows.map(row => ({
          id: row.id,
          title: row.title,
          tags: row.tags,
          spaceName: row.spaceName,
          highlight: row.highlight
        }))
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '搜索失败' })
    }
  })

  // AI 语义搜索（使用向量数据库）
  fastify.get('/semantic-search', async (request: FastifyRequest<{ Querystring: { q: string } }>, reply: FastifyReply) => {
    try {
      const { q } = request.query
      
      if (!q) {
        return reply.code(400).send({ success: false, error: '请提供搜索关键词' })
      }

      // 生成查询向量
      const queryEmbedding = await fastify.ai?.embeddings(q)
      
      if (!queryEmbedding) {
        return reply.code(503).send({ success: false, error: 'AI 服务暂不可用' })
      }

      // 在 Qdrant 中搜索
      const searchResult = await fastify.qdrant?.search('knowledge_docs', {
        vector: queryEmbedding,
        limit: 10
      })

      if (!searchResult || searchResult.length === 0) {
        return { success: true, data: [] }
      }

      // 获取文档详情
      const docIds = searchResult.map((r: any) => r.payload.docId)
      const docsResult = await fastify.db.query(`
        SELECT kd.id, kd.title, kd.tags, ks.name as "spaceName"
        FROM knowledge_docs kd
        JOIN knowledge_spaces ks ON kd.space_id = ks.id
        WHERE kd.id = ANY($1) AND kd.is_archived = false
      `, [docIds])

      return {
        success: true,
        data: docsResult.rows.map((row, i) => ({
          ...row,
          score: searchResult[i]?.score || 0
        }))
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '语义搜索失败' })
    }
  })
}

// 辅助函数：生成向量嵌入
async function generateEmbedding(docId: string, content: string, fastify: FastifyInstance) {
  try {
    const embedding = await fastify.ai?.embeddings(content)
    
    if (embedding) {
      // 存储到 Qdrant
      await fastify.qdrant?.upsert('knowledge_docs', {
        id: docId,
        vector: embedding,
        payload: { docId }
      })
    }
  } catch (error) {
    fastify.log.error({ error, docId }, '生成向量嵌入失败')
  }
}
