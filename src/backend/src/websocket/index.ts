import { Server as SocketIOServer } from 'socket.io'
import type { FastifyInstance } from 'fastify'
import type { Server } from 'http'

export function setupWebSocket(fastify: FastifyInstance, server: Server) {
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3001',
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling']
  })

  // 用户连接映射
  const userSockets = new Map<string, Set<string>>() // userId -> Set<socketId>
  const socketUser = new Map<string, { userId: string, enterpriseId?: string }>()

  // 认证中间件
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token
    
    if (!token) {
      return next(new Error('未授权'))
    }

    try {
      // 验证 JWT
      const decoded = fastify.jwt.verify(token) as { userId: string }
      socket.data.userId = decoded.userId
      next()
    } catch (err) {
      next(new Error('Token 无效'))
    }
  })

  io.on('connection', async (socket) => {
    const userId = socket.data.userId
    console.log(`用户连接: ${userId}, socket: ${socket.id}`)

    // 记录 socket 映射
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set())
    }
    userSockets.get(userId)!.add(socket.id)
    socketUser.set(socket.id, { userId })

    // 加入用户个人房间
    socket.join(`user:${userId}`)

    // 获取用户的企业并加入企业房间
    try {
      const enterprises = await fastify.db.query(
        'SELECT enterprise_id FROM enterprise_members WHERE user_id = $1 AND status = $2',
        [userId, 'active']
      )
      
      for (const row of enterprises.rows) {
        socket.join(`enterprise:${row.enterprise_id}`)
        socketUser.get(socket.id)!.enterpriseId = row.enterprise_id
      }
    } catch (err) {
      console.error('获取企业失败:', err)
    }

    // 发送在线状态
    socket.emit('connected', { 
      socketId: socket.id,
      userId,
      message: 'WebSocket 连接成功'
    })

    // ========== 消息相关 ==========

    // 加入会话房间
    socket.on('join-conversation', async (conversationId: string) => {
      socket.join(`conversation:${conversationId}`)
      
      // 通知其他成员用户正在输入
      socket.to(`conversation:${conversationId}`).emit('user-joined', {
        userId,
        conversationId
      })
    })

    // 离开会话房间
    socket.on('leave-conversation', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`)
    })

    // 发送消息
    socket.on('send-message', async (data: {
      conversationId: string
      content: string
      type: 'text' | 'image' | 'file' | 'audio'
      replyTo?: string
    }) => {
      try {
        const messageId = crypto.randomUUID()
        
        // 保存消息到数据库
        await fastify.db.query(
          `INSERT INTO messages (id, conversation_id, sender_id, content, type, reply_to)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [messageId, data.conversationId, userId, data.content, data.type, data.replyTo]
        )

        // 更新会话最后消息时间
        await fastify.db.query(
          'UPDATE conversations SET last_message_at = NOW() WHERE id = $1',
          [data.conversationId]
        )

        // 获取发送者信息
        const senderResult = await fastify.db.query(
          'SELECT id, name, avatar_url FROM users WHERE id = $1',
          [userId]
        )
        const sender = senderResult.rows[0]

        const message = {
          id: messageId,
          conversationId: data.conversationId,
          senderId: userId,
          sender,
          content: data.content,
          type: data.type,
          replyTo: data.replyTo,
          createdAt: new Date()
        }

        // 广播消息到会话房间
        io.to(`conversation:${data.conversationId}`).emit('new-message', message)

        // 发送推送通知给不在线的成员
        const members = await fastify.db.query(
          'SELECT user_id FROM conversation_members WHERE conversation_id = $1',
          [data.conversationId]
        )

        for (const member of members.rows) {
          if (member.user_id !== userId && !userSockets.has(member.user_id)) {
            // 用户不在线，可以发送离线通知（邮件、短信等）
            console.log(`用户 ${member.user_id} 不在线，需要离线通知`)
          }
        }
      } catch (err) {
        console.error('发送消息失败:', err)
        socket.emit('message-error', {
          error: '发送消息失败',
          conversationId: data.conversationId
        })
      }
    })

    // 正在输入
    socket.on('typing', (data: { conversationId: string, isTyping: boolean }) => {
      socket.to(`conversation:${data.conversationId}`).emit('user-typing', {
        userId,
        conversationId: data.conversationId,
        isTyping: data.isTyping
      })
    })

    // 已读回执
    socket.on('mark-read', async (data: { conversationId: string, messageId: string }) => {
      try {
        await fastify.db.query(
          `INSERT INTO message_reads (message_id, user_id, read_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (message_id, user_id) DO NOTHING`,
          [data.messageId, userId]
        )

        socket.to(`conversation:${data.conversationId}`).emit('message-read', {
          userId,
          conversationId: data.conversationId,
          messageId: data.messageId
        })
      } catch (err) {
        console.error('标记已读失败:', err)
      }
    })

    // ========== 文档协作 ==========

    // 加入文档编辑
    socket.on('join-document', async (documentId: string) => {
      socket.join(`document:${documentId}`)
      
      // 获取文档当前状态
      const doc = await fastify.db.query(
        'SELECT content, version FROM documents WHERE id = $1',
        [documentId]
      )

      socket.emit('document-state', {
        documentId,
        content: doc.rows[0]?.content || '',
        version: doc.rows[0]?.version || 0
      })

      // 通知其他编辑者
      socket.to(`document:${documentId}`).emit('collaborator-joined', {
        userId,
        socketId: socket.id
      })
    })

    // 离开文档编辑
    socket.on('leave-document', (documentId: string) => {
      socket.leave(`document:${documentId}`)
      socket.to(`document:${documentId}`).emit('collaborator-left', {
        userId,
        socketId: socket.id
      })
    })

    // 文档编辑操作 (使用 OT 算法简化版)
    socket.on('document-edit', async (data: {
      documentId: string
      version: number
      operations: Array<{ type: 'insert' | 'delete' | 'retain', position: number, text?: string }>
    }) => {
      try {
        // 验证版本
        const doc = await fastify.db.query(
          'SELECT version FROM documents WHERE id = $1',
          [data.documentId]
        )

        if (doc.rows[0]?.version !== data.version) {
          socket.emit('document-conflict', {
            documentId: data.documentId,
            serverVersion: doc.rows[0]?.version
          })
          return
        }

        // 广播编辑操作给其他编辑者
        socket.to(`document:${documentId}`).emit('document-operations', {
          documentId: data.documentId,
          userId,
          operations: data.operations,
          version: data.version + 1
        })

        // 更新版本号
        await fastify.db.query(
          'UPDATE documents SET version = version + 1, updated_at = NOW() WHERE id = $1',
          [data.documentId]
        )
      } catch (err) {
        console.error('文档编辑失败:', err)
      }
    })

    // 文档光标位置
    socket.on('document-cursor', (data: { documentId: string, position: number }) => {
      socket.to(`document:${documentId}`).emit('collaborator-cursor', {
        userId,
        socketId: socket.id,
        position: data.position
      })
    })

    // ========== 表格协作 ==========

    socket.on('join-table', (tableId: string) => {
      socket.join(`table:${tableId}`)
      socket.to(`table:${tableId}`).emit('collaborator-joined', { userId })
    })

    socket.on('leave-table', (tableId: string) => {
      socket.leave(`table:${tableId}`)
    })

    socket.on('table-cell-edit', async (data: {
      tableId: string
      rowId: string
      fieldId: string
      value: any
    }) => {
      // 广播给其他编辑者
      socket.to(`table:${data.tableId}`).emit('cell-updated', {
        rowId: data.rowId,
        fieldId: data.fieldId,
        value: data.value,
        editedBy: userId
      })

      // 保存到数据库
      try {
        await fastify.db.query(
          `UPDATE table_rows 
           SET data = jsonb_set(data, $1, $2::jsonb)
           WHERE id = $3`,
          [`{${data.fieldId}}`, JSON.stringify(data.value), data.rowId]
        )
      } catch (err) {
        console.error('更新单元格失败:', err)
      }
    })

    // ========== 任务协作 ==========

    socket.on('join-task-board', (boardId: string) => {
      socket.join(`task-board:${boardId}`)
    })

    socket.on('task-moved', async (data: {
      taskId: string
      fromStatus: string
      toStatus: string
      position: number
    }) => {
      socket.to(`task-board:${data.taskId}`).emit('task-status-changed', {
        taskId: data.taskId,
        fromStatus: data.fromStatus,
        toStatus: data.toStatus,
        position: data.position,
        movedBy: userId
      })

      // 更新数据库
      try {
        await fastify.db.query(
          'UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2',
          [data.toStatus, data.taskId]
        )
      } catch (err) {
        console.error('更新任务状态失败:', err)
      }
    })

    // ========== 通知推送 ==========

    // 发送通知给指定用户
    socket.on('send-notification', async (data: {
      targetUserId: string
      type: 'mention' | 'assignment' | 'comment' | 'system'
      title: string
      content: string
      link?: string
    }) => {
      io.to(`user:${data.targetUserId}`).emit('notification', {
        type: data.type,
        title: data.title,
        content: data.content,
        link: data.link,
        from: userId,
        createdAt: new Date()
      })
    })

    // ========== 在线状态 ==========

    socket.on('set-status', (status: 'online' | 'away' | 'busy' | 'offline') => {
      // 广播给用户所在的所有企业
      const userInfo = socketUser.get(socket.id)
      if (userInfo?.enterpriseId) {
        io.to(`enterprise:${userInfo.enterpriseId}`).emit('user-status', {
          userId,
          status
        })
      }
    })

    // ========== 断开连接 ==========

    socket.on('disconnect', () => {
      console.log(`用户断开连接: ${userId}, socket: ${socket.id}`)
      
      // 清理映射
      userSockets.get(userId)?.delete(socket.id)
      if (userSockets.get(userId)?.size === 0) {
        userSockets.delete(userId)
      }
      socketUser.delete(socket.id)

      // 通知用户离线
      const userInfo = socketUser.get(socket.id)
      if (userInfo?.enterpriseId) {
        io.to(`enterprise:${userInfo.enterpriseId}`).emit('user-status', {
          userId,
          status: 'offline'
        })
      }
    })
  })

  // 提供 io 实例给其他模块使用
  fastify.decorate('io', io)

  return io
}

// 类型扩展
declare module 'fastify' {
  interface FastifyInstance {
    io?: import('socket.io').Server
  }
}