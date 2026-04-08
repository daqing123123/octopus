import { FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

const messageRoutes: FastifyPluginAsync = async (fastify) => {
  
  // WebSocket 连接
  fastify.get('/ws', { websocket: true }, (connection, request) => {
    // 存储连接
    const userId = (request as any).user?.userId
    
    connection.socket.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString())
        
        switch (data.type) {
          case 'join':
            // 加入会话
            await handleJoinConversation(connection, data.conversationId, userId)
            break
            
          case 'message':
            // 发送消息
            const savedMessage = await saveMessage(fastify, {
              conversationId: data.conversationId,
              senderId: userId,
              content: data.content,
              contentType: data.contentType || 'text'
            })
            
            // 广播给会话中的其他成员
            broadcastToConversation(fastify, data.conversationId, {
              type: 'message',
              data: savedMessage
            }, connection.socket)
            break
            
          case 'typing':
            // 打字状态
            broadcastToConversation(fastify, data.conversationId, {
              type: 'typing',
              data: { userId, isTyping: data.isTyping }
            }, connection.socket)
            break
        }
      } catch (err) {
        connection.socket.send(JSON.stringify({
          type: 'error',
          data: { message: '消息处理失败' }
        }))
      }
    })
    
    connection.socket.on('close', () => {
      // 清理连接
    })
  })

  // 创建会话
  fastify.post('/conversations', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['消息'],
      summary: '创建会话'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { type, name, memberIds } = request.body as any
    
    const conversationId = uuidv4()
    
    // 创建会话
    await fastify.db.query(
      `INSERT INTO conversations (id, type, name, owner_id)
       VALUES ($1, $2, $3, $4)`,
      [conversationId, type, name, userId]
    )
    
    // 添加成员
    const members = type === 'private' ? [userId, ...memberIds] : [userId, ...memberIds]
    for (const memberId of members) {
      await fastify.db.query(
        `INSERT INTO conversation_members (conversation_id, user_id, role)
         VALUES ($1, $2, $3)`,
        [conversationId, memberId, memberId === userId ? 'owner' : 'member']
      )
    }
    
    return {
      success: true,
      data: { conversationId, type, name }
    }
  })

  // 获取会话列表
  fastify.get('/conversations', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['消息'],
      summary: '获取会话列表'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    
    const result = await fastify.db.query(
      `SELECT c.id, c.type, c.name, c.avatar_url, c.last_message_at,
              cm.last_read_at, cm.muted, cm.pinned
       FROM conversations c
       JOIN conversation_members cm ON c.id = cm.conversation_id
       WHERE cm.user_id = $1
       ORDER BY cm.pinned DESC, c.last_message_at DESC NULLS LAST`,
      [userId]
    )
    
    // 获取每个会话的最后一条消息
    const conversations = await Promise.all(result.rows.map(async (conv) => {
      const lastMessage = await fastify.db.query(
        `SELECT m.id, m.content, m.content_type, m.created_at, 
                u.id as sender_id, u.name as sender_name
         FROM messages m
         JOIN users u ON m.sender_id = u.id
         WHERE m.conversation_id = $1 AND m.deleted_at IS NULL
         ORDER BY m.created_at DESC
         LIMIT 1`,
        [conv.id]
      )
      
      return {
        ...conv,
        lastMessage: lastMessage.rows[0] || null
      }
    }))
    
    return {
      success: true,
      data: conversations
    }
  })

  // 获取消息历史
  fastify.get('/conversations/:id/messages', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['消息'],
      summary: '获取消息历史'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { id } = request.params as any
    const { limit = 50, before } = request.query as any
    
    // 检查用户是否是会话成员
    const memberCheck = await fastify.db.query(
      'SELECT id FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
      [id, userId]
    )
    
    if (memberCheck.rows.length === 0) {
      return reply.status(403).send({ error: '无权访问此会话' })
    }
    
    // 获取消息
    const result = await fastify.db.query(
      `SELECT m.id, m.content, m.content_type, m.created_at, m.edited_at,
              u.id as sender_id, u.name as sender_name, u.avatar_url as sender_avatar,
              m.reply_to
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = $1 AND m.deleted_at IS NULL
         AND ($2::timestamp IS NULL OR m.created_at < $2)
       ORDER BY m.created_at DESC
       LIMIT $3`,
      [id, before || null, limit]
    )
    
    // 更新已读时间
    await fastify.db.query(
      `UPDATE conversation_members SET last_read_at = NOW() 
       WHERE conversation_id = $1 AND user_id = $2`,
      [id, userId]
    )
    
    return {
      success: true,
      data: result.rows.reverse()
    }
  })

  // 发送消息
  fastify.post('/conversations/:id/messages', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['消息'],
      summary: '发送消息'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { id } = request.params as any
    const { content, contentType = 'text', replyTo } = request.body as any
    
    // 检查用户是否是会话成员
    const memberCheck = await fastify.db.query(
      'SELECT id FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
      [id, userId]
    )
    
    if (memberCheck.rows.length === 0) {
      return reply.status(403).send({ error: '无权访问此会话' })
    }
    
    const message = await saveMessage(fastify, {
      conversationId: id,
      senderId: userId,
      content,
      contentType,
      replyTo
    })
    
    return {
      success: true,
      data: message
    }
  })

  // 添加表情反应
  fastify.post('/messages/:id/reactions', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['消息'],
      summary: '添加表情反应'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { id } = request.params as any
    const { emoji } = request.body as any
    
    await fastify.db.query(
      `INSERT INTO message_reactions (message_id, user_id, emoji)
       VALUES ($1, $2, $3)
       ON CONFLICT (message_id, user_id, emoji) DO NOTHING`,
      [id, userId, emoji]
    )
    
    // 获取该消息的所有反应
    const result = await fastify.db.query(
      `SELECT emoji, array_agg(user_id) as user_ids
       FROM message_reactions
       WHERE message_id = $1
       GROUP BY emoji`,
      [id]
    )
    
    return {
      success: true,
      data: result.rows
    }
  })
}

// 辅助函数
async function saveMessage(fastify: any, data: any) {
  const messageId = uuidv4()
  
  await fastify.db.query(
    `INSERT INTO messages (id, conversation_id, sender_id, content, content_type, reply_to)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [messageId, data.conversationId, data.senderId, data.content, data.contentType, data.replyTo]
  )
  
  // 更新会话最后消息时间
  await fastify.db.query(
    `UPDATE conversations SET last_message_at = NOW() WHERE id = $1`,
    [data.conversationId]
  )
  
  // 获取发送者信息
  const sender = await fastify.db.query(
    'SELECT id, name, avatar_url FROM users WHERE id = $1',
    [data.senderId]
  )
  
  return {
    id: messageId,
    conversationId: data.conversationId,
    content: data.content,
    contentType: data.contentType,
    sender: sender.rows[0],
    createdAt: new Date().toISOString()
  }
}

async function handleJoinConversation(connection: any, conversationId: string, userId: string) {
  // 验证用户是否有权限加入
  // 存储连接信息
  connection.socket.send(JSON.stringify({
    type: 'joined',
    data: { conversationId }
  }))
}

function broadcastToConversation(fastify: any, conversationId: string, message: any, excludeSocket?: any) {
  // 向会话中的所有连接广播消息
  // 实际实现需要维护一个连接映射表
}

export default messageRoutes
