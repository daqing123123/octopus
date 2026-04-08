import { FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

const documentRoutes: FastifyPluginAsync = async (fastify) => {
  
  // 创建文档
  fastify.post('/', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['云文档'],
      summary: '创建文档'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId, parentId, name, type, content } = request.body as any
    
    const documentId = uuidv4()
    
    await fastify.db.query(
      `INSERT INTO documents (id, enterprise_id, creator_id, parent_id, name, type, content)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [documentId, enterpriseId, userId, parentId, name, type || 'doc', JSON.stringify(content || {})]
    )
    
    return {
      success: true,
      data: { documentId, name, type }
    }
  })

  // 获取文档列表（支持文件夹结构）
  fastify.get('/', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['云文档'],
      summary: '获取文档列表'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId, parentId } = request.query as any
    
    const result = await fastify.db.query(
      `SELECT id, name, type, icon, is_public, created_at, updated_at,
              u.name as creator_name
       FROM documents d
       LEFT JOIN users u ON d.creator_id = u.id
       WHERE d.enterprise_id = $1 AND d.parent_id ${parentId ? '= $2' : 'IS NULL'}
         AND d.is_archived = false
       ORDER BY d.type = 'folder' DESC, d.created_at DESC`,
      parentId ? [enterpriseId, parentId] : [enterpriseId]
    )
    
    return {
      success: true,
      data: result.rows
    }
  })

  // 获取文档详情
  fastify.get('/:id', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['云文档'],
      summary: '获取文档详情'
    }
  }, async (request, reply) => {
    const { id } = request.params as any
    
    const result = await fastify.db.query(
      `SELECT d.*, u.name as creator_name
       FROM documents d
       LEFT JOIN users u ON d.creator_id = u.id
       WHERE d.id = $1`,
      [id]
    )
    
    if (result.rows.length === 0) {
      return reply.status(404).send({ error: '文档不存在' })
    }
    
    // 获取评论
    const comments = await fastify.db.query(
      `SELECT dc.id, dc.content, dc.position, dc.resolved_at, dc.created_at,
              u.name as user_name, u.avatar_url
       FROM document_comments dc
       JOIN users u ON dc.user_id = u.id
       WHERE dc.document_id = $1
       ORDER BY dc.created_at DESC`,
      [id]
    )
    
    return {
      success: true,
      data: {
        ...result.rows[0],
        comments: comments.rows
      }
    }
  })

  // 更新文档内容（协作编辑）
  fastify.patch('/:id/content', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['云文档'],
      summary: '更新文档内容'
    }
  }, async (request) => {
    const { id } = request.params as any
    const { content } = request.body as any
    
    await fastify.db.query(
      `UPDATE documents SET content = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(content), id]
    )
    
    return {
      success: true,
      message: '内容已更新'
    }
  })

  // 重命名文档
  fastify.patch('/:id/rename', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['云文档'],
      summary: '重命名文档'
    }
  }, async (request) => {
    const { id } = request.params as any
    const { name } = request.body as any
    
    await fastify.db.query(
      'UPDATE documents SET name = $1, updated_at = NOW() WHERE id = $2',
      [name, id]
    )
    
    return {
      success: true,
      message: '重命名成功'
    }
  })

  // 移动文档
  fastify.patch('/:id/move', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['云文档'],
      summary: '移动文档'
    }
  }, async (request) => {
    const { id } = request.params as any
    const { parentId } = request.body as any
    
    await fastify.db.query(
      'UPDATE documents SET parent_id = $1, updated_at = NOW() WHERE id = $2',
      [parentId, id]
    )
    
    return {
      success: true,
      message: '移动成功'
    }
  })

  // 删除文档（移入归档）
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['云文档'],
      summary: '删除文档'
    }
  }, async (request) => {
    const { id } = request.params as any
    
    await fastify.db.query(
      'UPDATE documents SET is_archived = true WHERE id = $1',
      [id]
    )
    
    return {
      success: true,
      message: '文档已移入回收站'
    }
  })

  // 添加评论
  fastify.post('/:id/comments', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['云文档'],
      summary: '添加文档评论'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { id } = request.params as any
    const { content, position, replyTo } = request.body as any
    
    const commentId = uuidv4()
    
    await fastify.db.query(
      `INSERT INTO document_comments (id, document_id, user_id, content, position, reply_to)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [commentId, id, userId, content, JSON.stringify(position || {}), replyTo]
    )
    
    return {
      success: true,
      data: { commentId, content }
    }
  })

  // 解决评论
  fastify.patch('/:id/comments/:commentId/resolve', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['云文档'],
      summary: '解决评论'
    }
  }, async (request) => {
    const { commentId } = request.params as any
    
    await fastify.db.query(
      'UPDATE document_comments SET resolved_at = NOW() WHERE id = $1',
      [commentId]
    )
    
    return {
      success: true,
      message: '评论已解决'
    }
  })

  // 导出文档
  fastify.get('/:id/export', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['云文档'],
      summary: '导出文档'
    }
  }, async (request, reply) => {
    const { id } = request.params as any
    const { format = 'markdown' } = request.query as any
    
    const result = await fastify.db.query(
      'SELECT name, content FROM documents WHERE id = $1',
      [id]
    )
    
    if (result.rows.length === 0) {
      return reply.status(404).send({ error: '文档不存在' })
    }
    
    const { name, content } = result.rows[0]
    
    // 简化的导出逻辑（实际需要更复杂的转换）
    let exportedContent: string
    let mimeType: string
    let extension: string
    
    switch (format) {
      case 'markdown':
        exportedContent = convertToMarkdown(content)
        mimeType = 'text/markdown'
        extension = 'md'
        break
      case 'html':
        exportedContent = convertToHtml(content)
        mimeType = 'text/html'
        extension = 'html'
        break
      default:
        exportedContent = JSON.stringify(content)
        mimeType = 'application/json'
        extension = 'json'
    }
    
    reply.header('Content-Type', mimeType)
    reply.header('Content-Disposition', `attachment; filename="${name}.${extension}"`)
    
    return exportedContent
  })

  // 搜索文档
  fastify.get('/search', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['云文档'],
      summary: '搜索文档'
    }
  }, async (request) => {
    const { enterpriseId, query } = request.query as any
    
    const result = await fastify.db.query(
      `SELECT id, name, type, created_at
       FROM documents
       WHERE enterprise_id = $1 
         AND name ILIKE $2
         AND is_archived = false
       ORDER BY created_at DESC
       LIMIT 20`,
      [enterpriseId, `%${query}%`]
    )
    
    return {
      success: true,
      data: result.rows
    }
  })
}

// 简化的转换函数
function convertToMarkdown(content: any): string {
  if (!content || !content.blocks) return ''
  
  return content.blocks.map((block: any) => {
    switch (block.type) {
      case 'heading':
        return `${'#'.repeat(block.level || 1)} ${block.text}`
      case 'paragraph':
        return block.text
      case 'list':
        return block.items.map((item: string) => `- ${item}`).join('\n')
      case 'code':
        return `\`\`\`\n${block.code}\n\`\`\``
      default:
        return block.text || ''
    }
  }).join('\n\n')
}

function convertToHtml(content: any): string {
  if (!content || !content.blocks) return ''
  
  const html = content.blocks.map((block: any) => {
    switch (block.type) {
      case 'heading':
        return `<h${block.level || 1}>${block.text}</h${block.level || 1}>`
      case 'paragraph':
        return `<p>${block.text}</p>`
      case 'list':
        return `<ul>${block.items.map((item: string) => `<li>${item}</li>`).join('')}</ul>`
      case 'code':
        return `<pre><code>${block.code}</code></pre>`
      default:
        return `<p>${block.text || ''}</p>`
    }
  }).join('')
  
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Document</title></head><body>${html}</body></html>`
}

export default documentRoutes
