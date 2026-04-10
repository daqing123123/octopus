/**
 * 实时协作服务
 * WebSocket + Yjs 文档协作
 */

import { FastifyPluginAsync } from 'fastify'
import { WebSocketServer, WebSocket } from 'ws'
import * as Y from 'yjs'
import { v4 as uuidv4 } from 'uuid'

interface Client {
  id: string
  userId: string
  userName: string
  userAvatar?: string
  ws: WebSocket
  docId?: string
  color?: string
}

interface CollabRoom {
  docId: string
  doc: Y.Doc
  clients: Map<string, Client>
  awareness: Map<string, any>
}

const realtimeRoutes: FastifyPluginAsync = async (fastify) => {

  // 存储活跃房间
  const rooms = new Map<string, CollabRoom>()
  
  // 存储所有客户端
  const clients = new Map<string, Client>()

  // 随机颜色生成
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F']
  const getRandomColor = () => colors[Math.floor(Math.random() * colors.length)]

  // ========================================
  # HTTP API
  # ========================================

  // 创建协作文档
  fastify.post('/collab/documents', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['协作'],
      summary: '创建协作文档',
      body: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          type: { type: 'string', enum: ['document', 'spreadsheet', 'whiteboard'] },
          enterpriseId: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { title, type = 'document', enterpriseId } = request.body as any

    const docId = uuidv4()
    const now = new Date()

    // 保存到数据库
    await fastify.db.query(
      `INSERT INTO collab_documents (id, title, type, enterprise_id, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [docId, title || '新文档', type, enterpriseId, userId, now]
    )

    // 初始化Yjs文档
    const doc = new Y.Doc()
    const room: CollabRoom = {
      docId,
      doc,
      clients: new Map(),
      awareness: new Map()
    }
    rooms.set(docId, room)

    return {
      success: true,
      data: {
        docId,
        wsUrl: `/ws/collab/${docId}`
      }
    }
  })

  // 获取协作文档列表
  fastify.get('/collab/documents', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['协作'],
      summary: '获取协作文档列表'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId, type } = request.query as any

    let query = `
      SELECT cd.*, u.name as creator_name, u.avatar as creator_avatar,
             (SELECT COUNT(*) FROM jsonb_object_keys(cd.active_users) as _) as online_count
      FROM collab_documents cd
      JOIN users u ON u.id = cd.created_by
      WHERE cd.is_archived = false
    `
    const params: any[] = []

    if (enterpriseId) {
      params.push(enterpriseId)
      query += ` AND cd.enterprise_id = $${params.length}`
    }

    if (type) {
      params.push(type)
      query += ` AND cd.type = $${params.length}`
    }

    query += ` ORDER BY cd.updated_at DESC`

    const result = await fastify.db.query(query, params)

    return {
      success: true,
      data: result.rows.map(d => ({
        ...d,
        activeUsers: d.active_users ? JSON.parse(d.active_users) : {}
      }))
    }
  })

  // 获取单个文档
  fastify.get('/collab/documents/:docId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['协作'],
      summary: '获取协作文档'
    }
  }, async (request) => {
    const { docId } = request.params as any

    const result = await fastify.db.query(
      `SELECT cd.*, u.name as creator_name
       FROM collab_documents cd
       JOIN users u ON u.id = cd.created_by
       WHERE cd.id = $1`,
      [docId]
    )

    if (result.rows.length === 0) {
      return { success: false, error: '文档不存在' }
    }

    const doc = result.rows[0]

    return {
      success: true,
      data: {
        ...doc,
        activeUsers: doc.active_users ? JSON.parse(doc.active_users) : {},
        wsUrl: `/ws/collab/${docId}`
      }
    }
  })

  // 获取在线用户
  fastify.get('/collab/documents/:docId/online-users', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['协作'],
      summary: '获取在线用户'
    }
  }, async (request) => {
    const { docId } = request.params as any

    const room = rooms.get(docId)
    if (!room) {
      return { success: true, data: [] }
    }

    const users = Array.from(room.clients.values()).map(c => ({
      id: c.id,
      userId: c.userId,
      userName: c.userName,
      userAvatar: c.userAvatar,
      color: c.color
    }))

    return { success: true, data: users }
  })

  // 获取历史版本
  fastify.get('/collab/documents/:docId/versions', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['协作'],
      summary: '获取文档历史版本'
    }
  }, async (request) => {
    const { docId } = request.params as any

    const result = await fastify.db.query(
      `SELECT * FROM collab_document_versions
       WHERE document_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [docId]
    )

    return {
      success: true,
      data: result.rows
    }
  })

  // 保存版本快照
  fastify.post('/collab/documents/:docId/versions', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['协作'],
      summary: '保存文档版本'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { docId } = request.params as any
    const { versionName, snapshot } = request.body as any

    const room = rooms.get(docId)
    if (!room) {
      return { success: false, error: '文档未打开' }
    }

    const versionId = uuidv4()
    await fastify.db.query(
      `INSERT INTO collab_document_versions (id, document_id, version_name, snapshot, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [versionId, docId, versionName || `版本 ${new Date().toLocaleString()}`, JSON.stringify(snapshot || {}), userId]
    )

    return {
      success: true,
      data: { versionId }
    }
  })

  // ========================================
  # WebSocket 处理
  # ========================================

  // 设置WebSocket路由
  fastify.get('/ws/collab/:docId', { websocket: true }, (socket, request) => {
    const { docId } = request.params as any
    const userId = (request.user as any)?.userId || socket.url?.searchParams?.get('userId')
    const userName = socket.url?.searchParams?.get('userName') || '匿名用户'
    const userAvatar = socket.url?.searchParams?.get('avatar')

    if (!userId) {
      socket.close(4001, 'Unauthorized')
      return
    }

    const clientId = uuidv4()
    const client: Client = {
      id: clientId,
      userId,
      userName,
      userAvatar,
      ws: socket,
      docId,
      color: getRandomColor()
    }

    // 加入房间
    joinRoom(docId, client)

    // 发送欢迎消息
    socket.send(JSON.stringify({
      type: 'connected',
      clientId,
      color: client.color,
      onlineUsers: getOnlineUsers(docId)
    }))

    // 广播用户加入
    broadcastToRoom(docId, {
      type: 'user_joined',
      user: { id: clientId, userId, userName, userAvatar, color: client.color }
    }, clientId)

    // 处理消息
    socket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString())
        handleMessage(docId, clientId, message)
      } catch (err) {
        fastify.log.error('WebSocket message error:', err)
      }
    })

    // 处理断开
    socket.on('close', () => {
      leaveRoom(docId, clientId)
      broadcastToRoom(docId, {
        type: 'user_left',
        userId: client.userId
      })
    })

    // 处理错误
    socket.on('error', (err) => {
      fastify.log.error('WebSocket error:', err)
      leaveRoom(docId, clientId)
    })
  })

  // ========================================
  # 协作逻辑
  # ========================================

  function joinRoom(docId: string, client: Client) {
    let room = rooms.get(docId)
    
    if (!room) {
      // 创建新房间
      const doc = new Y.Doc()
      room = {
        docId,
        doc,
        clients: new Map(),
        awareness: new Map()
      }
      rooms.set(docId, room)
    }

    room.clients.set(client.id, client)
    client.ws.on('close', () => leaveRoom(docId, client.id))
  }

  function leaveRoom(docId: string, clientId: string) {
    const room = rooms.get(docId)
    if (!room) return

    room.clients.delete(clientId)
    room.awareness.delete(clientId)

    // 如果房间空了，可以选择保存快照
    if (room.clients.size === 0) {
      // 保存到数据库
      saveRoomSnapshot(docId, room)
      // 可以在一定时间后删除房间
      setTimeout(() => {
        if (rooms.get(docId)?.clients.size === 0) {
          rooms.delete(docId)
        }
      }, 5 * 60 * 1000) // 5分钟后删除
    }

    // 更新数据库中的在线用户
    updateRoomActiveUsers(docId, room)
  }

  function handleMessage(docId: string, clientId: string, message: any) {
    const room = rooms.get(docId)
    if (!room) return

    const client = room.clients.get(clientId)
    if (!client) return

    switch (message.type) {
      case 'sync':
        // Yjs文档同步
        handleYjsSync(docId, message, clientId)
        break

      case 'awareness':
        // 光标/选区同步
        handleAwareness(docId, message, clientId)
        break

      case 'cursor':
        // 光标移动
        broadcastToRoom(docId, {
          type: 'cursor',
          userId: client.userId,
          userName: client.userName,
          color: client.color,
          position: message.position
        }, clientId)
        break

      case 'selection':
        // 选区变化
        broadcastToRoom(docId, {
          type: 'selection',
          userId: client.userId,
          userName: client.userName,
          color: client.color,
          selection: message.selection
        }, clientId)
        break

      case 'comment':
        // 添加评论
        handleComment(docId, message, client)
        break

      case 'undo':
        // 撤销
        Y.undoManager.undo()
        break

      case 'redo':
        // 重做
        Y.undoManager.redo()
        break
    }
  }

  function handleYjsSync(docId: string, message: any, clientId: string) {
    const room = rooms.get(docId)
    if (!room) return

    try {
      // 应用更新
      if (message.update) {
        Y.applyUpdate(room.doc, new Uint8Array(message.update))
      }

      // 广播给其他客户端
      broadcastToRoom(docId, {
        type: 'sync',
        update: message.update,
        clientId
      }, clientId)

      // 更新文档时间
      fastify.db.query(
        `UPDATE collab_documents SET updated_at = NOW() WHERE id = $1`,
        [docId]
      ).catch(() => {})
    } catch (err) {
      fastify.log.error('Yjs sync error:', err)
    }
  }

  function handleAwareness(docId: string, message: any, clientId: string) {
    const room = rooms.get(docId)
    if (!room) return

    const client = room.clients.get(clientId)
    if (!client) return

    // 更新awareness状态
    room.awareness.set(clientId, message.state)

    // 广播给所有客户端
    broadcastToRoom(docId, {
      type: 'awareness',
      clientId,
      userId: client.userId,
      userName: client.userName,
      color: client.color,
      state: message.state
    })
  }

  async function handleComment(docId: string, message: any, client: Client) {
    const commentId = uuidv4()
    
    await fastify.db.query(
      `INSERT INTO collab_comments (id, document_id, user_id, user_name, content, position, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [commentId, docId, client.userId, client.userName, message.content, JSON.stringify(message.position)]
    )

    // 广播评论
    broadcastToRoom(docId, {
      type: 'comment',
      id: commentId,
      userId: client.userId,
      userName: client.userName,
      userAvatar: client.userAvatar,
      color: client.color,
      content: message.content,
      position: message.position,
      createdAt: new Date().toISOString()
    })
  }

  function broadcastToRoom(docId: string, message: any, excludeClientId?: string) {
    const room = rooms.get(docId)
    if (!room) return

    const data = JSON.stringify(message)
    room.clients.forEach((client, id) => {
      if (id !== excludeClientId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data)
      }
    })
  }

  function getOnlineUsers(docId: string): any[] {
    const room = rooms.get(docId)
    if (!room) return []

    return Array.from(room.clients.values()).map(c => ({
      id: c.id,
      userId: c.userId,
      userName: c.userName,
      userAvatar: c.userAvatar,
      color: c.color
    }))
  }

  async function saveRoomSnapshot(docId: string, room: CollabRoom) {
    const content = room.doc.getText('content')?.toString() || ''
    
    await fastify.db.query(
      `UPDATE collab_documents SET content = $1, updated_at = NOW() WHERE id = $2`,
      [content, docId]
    ).catch(() => {})
  }

  async function updateRoomActiveUsers(docId: string, room: CollabRoom) {
    const activeUsers: Record<string, any> = {}
    room.clients.forEach((client) => {
      activeUsers[client.userId] = {
        userName: client.userName,
        userAvatar: client.userAvatar,
        color: client.color,
        joinedAt: new Date().toISOString()
      }
    })

    await fastify.db.query(
      `UPDATE collab_documents SET active_users = $1 WHERE id = $2`,
      [JSON.stringify(activeUsers), docId]
    ).catch(() => {})
  }
}

// 导出房间管理器供其他模块使用
export { realtimeRoutes }
export { rooms, clients }
