import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'

// 文件创建 Schema
const createFolderSchema = z.object({
  name: z.string().min(1),
  parentId: z.string().nullable().optional()
})

// 文件更新 Schema
const updateFileSchema = z.object({
  name: z.string().optional(),
  isStarred: z.boolean().optional()
})

export default async function fileRoutes(fastify: FastifyInstance) {
  
  // 获取文件列表
  fastify.get('/', async (request: FastifyRequest<{ Querystring: { parentId?: string } }>, reply: FastifyReply) => {
    try {
      const { parentId } = request.query
      
      const result = await fastify.db.query(`
        SELECT f.*, u.id as "createdById", u.name as "createdByName"
        FROM files f
        LEFT JOIN users u ON f.created_by = u.id
        WHERE f.parent_id ${parentId ? '= $1' : 'IS NULL'}
        AND f.deleted_at IS NULL
        ORDER BY f.type DESC, f.name ASC
      `, parentId ? [parentId] : [])

      return {
        success: true,
        data: result.rows.map(row => ({
          id: row.id,
          name: row.name,
          type: row.type,
          size: row.size || 0,
          mimeType: row.mime_type,
          parentId: row.parent_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          createdBy: { id: row.createdById, name: row.createdByName },
          isStarred: row.is_starred,
          isShared: row.is_shared
        }))
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '获取文件列表失败' })
    }
  })

  // 创建文件夹
  fastify.post('/folder', async (request: FastifyRequest<{ Body: z.infer<typeof createFolderSchema> }>, reply: FastifyReply) => {
    try {
      const { name, parentId } = createFolderSchema.parse(request.body)
      
      // @ts-ignore
      const userId = request.user?.id
      const folderId = uuidv4()

      const result = await fastify.db.query(`
        INSERT INTO files (id, name, type, parent_id, created_by)
        VALUES ($1, $2, 'folder', $3, $4)
        RETURNING *
      `, [folderId, name, parentId || null, userId])

      return {
        success: true,
        data: {
          id: result.rows[0].id,
          name: result.rows[0].name,
          type: 'folder',
          size: 0,
          parentId: result.rows[0].parent_id,
          createdAt: result.rows[0].created_at,
          updatedAt: result.rows[0].updated_at,
          isStarred: false,
          isShared: false
        }
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '创建文件夹失败' })
    }
  })

  // 上传文件
  fastify.post('/upload', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await request.file()
      if (!data) {
        return reply.code(400).send({ success: false, error: '没有上传文件' })
      }

      // @ts-ignore
      const userId = request.user?.id
      const fileId = uuidv4()
      const fileBuffer = await data.toBuffer()
      
      // 上传到 MinIO
      await fastify.minio.putObject(
        'octopus-files',
        fileId,
        fileBuffer,
        fileBuffer.length,
        { 'Content-Type': data.mimetype }
      )

      // 保存文件信息到数据库
      const result = await fastify.db.query(`
        INSERT INTO files (id, name, type, mime_type, size, parent_id, created_by, storage_key)
        VALUES ($1, $2, 'file', $3, $4, $5, $6, $1)
        RETURNING *
      `, [
        fileId,
        data.filename,
        data.mimetype,
        fileBuffer.length,
        request.query?.parentId || null,
        userId
      ])

      return {
        success: true,
        data: {
          id: result.rows[0].id,
          name: result.rows[0].name,
          type: 'file',
          size: result.rows[0].size,
          mimeType: result.rows[0].mime_type
        }
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '上传失败' })
    }
  })

  // 下载文件
  fastify.get('/:id/download', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params

      const result = await fastify.db.query(`
        SELECT * FROM files WHERE id = $1 AND type = 'file'
      `, [id])

      if (result.rows.length === 0) {
        return reply.code(404).send({ success: false, error: '文件不存在' })
      }

      const file = result.rows[0]
      const stream = await fastify.minio.getObject('octopus-files', file.storage_key || id)

      return reply
        .header('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`)
        .header('Content-Type', file.mime_type)
        .send(stream)
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '下载失败' })
    }
  })

  // 更新文件
  fastify.patch('/:id', async (request: FastifyRequest<{ Params: { id: string }, Body: z.infer<typeof updateFileSchema> }>, reply: FastifyReply) => {
    try {
      const { id } = request.params
      const updates = updateFileSchema.parse(request.body)

      const setClauses = []
      const values = [id]
      let paramCount = 2

      if (updates.name) {
        setClauses.push(`name = $${paramCount++}`)
        values.push(updates.name)
      }
      if (updates.isStarred !== undefined) {
        setClauses.push(`is_starred = $${paramCount++}`)
        values.push(updates.isStarred)
      }

      setClauses.push('updated_at = NOW()')

      const result = await fastify.db.query(`
        UPDATE files 
        SET ${setClauses.join(', ')}
        WHERE id = $1
        RETURNING *
      `, values)

      if (result.rows.length === 0) {
        return reply.code(404).send({ success: false, error: '文件不存在' })
      }

      return { success: true, data: result.rows[0] }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '更新失败' })
    }
  })

  // 星标切换
  fastify.patch('/:id/star', async (request: FastifyRequest<{ Params: { id: string }, Body: { isStarred: boolean } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params
      const { isStarred } = request.body

      await fastify.db.query(`
        UPDATE files SET is_starred = $1, updated_at = NOW() WHERE id = $2
      `, [isStarred, id])

      return { success: true }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '操作失败' })
    }
  })

  // 删除文件
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params

      // 软删除
      await fastify.db.query(`
        UPDATE files SET deleted_at = NOW() WHERE id = $1
      `, [id])

      return { success: true }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '删除失败' })
    }
  })

  // 获取文件详情
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params

      const result = await fastify.db.query(`
        SELECT f.*, u.name as "createdByName"
        FROM files f
        LEFT JOIN users u ON f.created_by = u.id
        WHERE f.id = $1 AND f.deleted_at IS NULL
      `, [id])

      if (result.rows.length === 0) {
        return reply.code(404).send({ success: false, error: '文件不存在' })
      }

      return { success: true, data: result.rows[0] }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '获取文件详情失败' })
    }
  })
}