/**
 * 视频会议服务
 * WebRTC 信令服务器
 */

import { FastifyPluginAsync } from 'fastify'
import { WebSocketServer, WebSocket } from 'ws'
import { v4 as uuidv4 } from 'uuid'

interface MeetingClient {
  id: string
  meetingId: string
  userId: string
  userName: string
  userAvatar?: string
  ws: WebSocket
  isMuted: boolean
  isVideoOff: boolean
  isScreenSharing: boolean
  joinedAt: Date
}

interface Meeting {
  id: string
  title: string
  hostId: string
  enterpriseId?: string
  scheduledStart?: Date
  scheduledEnd?: Date
  settings: {
    isPublic: boolean
    requirePassword: boolean
    password?: string
    maxParticipants: number
    allowScreenShare: boolean
    allowRecording: boolean
    muteOnJoin: boolean
  }
  createdAt: Date
}

const videoMeetingRoutes: FastifyPluginAsync = async (fastify) => {

  // 存储活跃会议
  const meetings = new Map<string, Meeting>()
  
  // 存储会议参与者
  const meetingClients = new Map<string, Map<string, MeetingClient>>()

  // ========================================
  # HTTP API
  # ========================================

  // 创建会议
  fastify.post('/meetings', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['会议'],
      summary: '创建视频会议',
      body: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          enterpriseId: { type: 'string' },
          scheduledStart: { type: 'string' },
          scheduledEnd: { type: 'string' },
          settings: {
            type: 'object',
            properties: {
              isPublic: { type: 'boolean' },
              requirePassword: { type: 'boolean' },
              password: { type: 'string' },
              maxParticipants: { type: 'integer' },
              allowScreenShare: { type: 'boolean' },
              allowRecording: { type: 'boolean' },
              muteOnJoin: { type: 'boolean' }
            }
          }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { title, enterpriseId, scheduledStart, scheduledEnd, settings } = request.body as any

    const meetingId = uuidv4()
    const now = new Date()

    const defaultSettings = {
      isPublic: false,
      requirePassword: false,
      password: '',
      maxParticipants: 100,
      allowScreenShare: true,
      allowRecording: true,
      muteOnJoin: false,
      ...settings
    }

    const meeting: Meeting = {
      id: meetingId,
      title: title || '视频会议',
      hostId: userId,
      enterpriseId,
      scheduledStart: scheduledStart ? new Date(scheduledStart) : undefined,
      scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : undefined,
      settings: defaultSettings,
      createdAt: now
    }

    // 保存到数据库
    await fastify.db.query(
      `INSERT INTO video_meetings 
       (id, title, host_id, enterprise_id, scheduled_start, scheduled_end, settings, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [meetingId, meeting.title, userId, enterpriseId, 
       meeting.scheduledStart, meeting.scheduledEnd, 
       JSON.stringify(defaultSettings), now]
    )

    meetings.set(meetingId, meeting)
    meetingClients.set(meetingId, new Map())

    return {
      success: true,
      data: {
        meetingId,
        wsUrl: `/ws/meeting/${meetingId}`,
        settings: defaultSettings
      }
    }
  })

  // 获取会议信息
  fastify.get('/meetings/:meetingId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['会议'],
      summary: '获取会议信息'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { meetingId } = request.params as any

    // 从内存或数据库获取
    let meeting = meetings.get(meetingId)
    
    if (!meeting) {
      const result = await fastify.db.query(
        `SELECT * FROM video_meetings WHERE id = $1`,
        [meetingId]
      )
      if (result.rows.length === 0) {
        return { success: false, error: '会议不存在' }
      }
      const dbMeeting = result.rows[0]
      meeting = {
        id: dbMeeting.id,
        title: dbMeeting.title,
        hostId: dbMeeting.host_id,
        enterpriseId: dbMeeting.enterprise_id,
        scheduledStart: dbMeeting.scheduled_start,
        scheduledEnd: dbMeeting.scheduled_end,
        settings: typeof dbMeeting.settings === 'string' 
          ? JSON.parse(dbMeeting.settings) 
          : dbMeeting.settings,
        createdAt: dbMeeting.created_at
      }
      meetings.set(meetingId, meeting)
    }

    // 获取参与者
    const clients = meetingClients.get(meetingId)
    const participants = clients 
      ? Array.from(clients.values()).map(c => ({
          id: c.id,
          userId: c.userId,
          userName: c.userName,
          userAvatar: c.userAvatar,
          isMuted: c.isMuted,
          isVideoOff: c.isVideoOff,
          isScreenSharing: c.isScreenSharing,
          joinedAt: c.joinedAt
        }))
      : []

    return {
      success: true,
      data: {
        ...meeting,
        isHost: meeting.hostId === userId,
        participants,
        participantCount: participants.length
      }
    }
  })

  // 加入会议
  fastify.post('/meetings/:meetingId/join', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['会议'],
      summary: '获取会议加入信息',
      body: {
        type: 'object',
        properties: {
          password: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { meetingId } = request.params as any
    const { password } = request.body as any || {}

    // 获取会议
    let meeting = meetings.get(meetingId)
    
    if (!meeting) {
      const result = await fastify.db.query(
        `SELECT * FROM video_meetings WHERE id = $1`,
        [meetingId]
      )
      if (result.rows.length === 0) {
        return reply.status(404).send({ error: '会议不存在' })
      }
      const dbMeeting = result.rows[0]
      meeting = {
        id: dbMeeting.id,
        title: dbMeeting.title,
        hostId: dbMeeting.host_id,
        enterpriseId: dbMeeting.enterprise_id,
        scheduledStart: dbMeeting.scheduled_start,
        scheduledEnd: dbMeeting.scheduled_end,
        settings: typeof dbMeeting.settings === 'string' 
          ? JSON.parse(dbMeeting.settings) 
          : dbMeeting.settings,
        createdAt: dbMeeting.created_at
      }
      meetings.set(meetingId, meeting)
    }

    // 检查密码
    if (meeting.settings.requirePassword && password !== meeting.settings.password) {
      return reply.status(403).send({ error: '会议密码错误' })
    }

    // 检查人数限制
    const clients = meetingClients.get(meetingId)
    if (clients && clients.size >= meeting.settings.maxParticipants) {
      return reply.status(403).send({ error: '会议人数已满' })
    }

    // 获取用户信息
    const userResult = await fastify.db.query(
      `SELECT name, avatar FROM users WHERE id = $1`,
      [userId]
    )
    const userData = userResult.rows[0] || { name: '未知用户', avatar: null }

    // 返回WebSocket连接信息
    return {
      success: true,
      data: {
        meetingId,
        wsUrl: `/ws/meeting/${meetingId}?userId=${userId}&userName=${encodeURIComponent(userData.name)}&avatar=${encodeURIComponent(userData.avatar || '')}`,
        isHost: meeting.hostId === userId,
        settings: meeting.settings
      }
    }
  })

  // 离开会议
  fastify.post('/meetings/:meetingId/leave', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['会议'],
      summary: '离开会议'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { meetingId } = request.params as any

    // 从会议中移除
    const clients = meetingClients.get(meetingId)
    if (clients) {
      const clientId = Array.from(clients.values()).find(c => c.userId === userId)?.id
      if (clientId) {
        clients.delete(clientId)
      }
    }

    // 广播离开消息
    broadcastToMeeting(meetingId, {
      type: 'participant_left',
      userId,
      leftAt: new Date().toISOString()
    })

    return { success: true, message: '已离开会议' }
  })

  // 结束会议
  fastify.post('/meetings/:meetingId/end', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['会议'],
      summary: '结束会议'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { meetingId } = request.params as any

    const meeting = meetings.get(meetingId)
    if (!meeting) {
      return { success: false, error: '会议不存在' }
    }

    // 只有主持人可以结束会议
    if (meeting.hostId !== userId) {
      return { success: false, error: '只有主持人可以结束会议' }
    }

    // 广播结束消息
    broadcastToMeeting(meetingId, {
      type: 'meeting_ended',
      endedBy: userId,
      endedAt: new Date().toISOString()
    })

    // 关闭所有连接
    const clients = meetingClients.get(meetingId)
    if (clients) {
      clients.forEach(client => {
        client.ws.close(1000, 'Meeting ended')
      })
      meetingClients.delete(meetingId)
    }

    meetings.delete(meetingId)

    // 更新数据库
    await fastify.db.query(
      `UPDATE video_meetings SET ended_at = NOW() WHERE id = $1`,
      [meetingId]
    )

    return { success: true, message: '会议已结束' }
  })

  // 获取会议列表
  fastify.get('/meetings', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['会议'],
      summary: '获取会议列表'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId, status = 'upcoming' } = request.query as any

    let query = `SELECT * FROM video_meetings WHERE 1=1`
    const params: any[] = []

    if (enterpriseId) {
      params.push(enterpriseId)
      query += ` AND enterprise_id = $${params.length}`
    }

    if (status === 'upcoming') {
      query += ` AND started_at IS NULL AND ended_at IS NULL`
    } else if (status === 'ongoing') {
      query += ` AND started_at IS NOT NULL AND ended_at IS NULL`
    } else if (status === 'ended') {
      query += ` AND ended_at IS NOT NULL`
    }

    query += ` ORDER BY scheduled_start DESC, created_at DESC LIMIT 50`

    const result = await fastify.db.query(query, params)

    return {
      success: true,
      data: result.rows.map(m => ({
        ...m,
        settings: typeof m.settings === 'string' ? JSON.parse(m.settings) : m.settings
      }))
    }
  })

  // ========================================
  # WebSocket 信令
  # ========================================

  fastify.get('/ws/meeting/:meetingId', { websocket: true }, (socket, request) => {
    const { meetingId } = request.params as any
    const url = new URL(socket.url || '', 'http://localhost')
    const userId = url.searchParams.get('userId')
    const userName = decodeURIComponent(url.searchParams.get('userName') || '匿名用户')
    const userAvatar = decodeURIComponent(url.searchParams.get('avatar') || '')

    if (!userId) {
      socket.close(4001, 'Unauthorized')
      return
    }

    // 获取或创建会议
    let meeting = meetings.get(meetingId)
    if (!meeting) {
      socket.close(4004, 'Meeting not found')
      return
    }

    // 获取或创建客户端映射
    let clients = meetingClients.get(meetingId)
    if (!clients) {
      clients = new Map()
      meetingClients.set(meetingId, clients)
    }

    const clientId = uuidv4()
    const client: MeetingClient = {
      id: clientId,
      meetingId,
      userId,
      userName,
      userAvatar,
      ws: socket,
      isMuted: meeting.settings.muteOnJoin,
      isVideoOff: false,
      isScreenSharing: false,
      joinedAt: new Date()
    }

    clients.set(clientId, client)

    // 发送欢迎消息
    socket.send(JSON.stringify({
      type: 'joined',
      clientId,
      participants: Array.from(clients.values()).map(c => ({
        id: c.id,
        userId: c.userId,
        userName: c.userName,
        userAvatar: c.userAvatar,
        isMuted: c.isMuted,
        isVideoOff: c.isVideoOff,
        isScreenSharing: c.isScreenSharing
      })),
      isHost: meeting.hostId === userId
    }))

    // 广播新参与者加入
    broadcastToMeeting(meetingId, {
      type: 'participant_joined',
      participant: {
        id: clientId,
        userId,
        userName,
        userAvatar,
        isMuted: client.isMuted,
        isVideoOff: client.isVideoOff
      }
    }, clientId)

    // 处理消息
    socket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString())
        handleMeetingMessage(meetingId, clientId, message)
      } catch (err) {
        fastify.log.error('Meeting WebSocket message error:', err)
      }
    })

    // 处理断开
    socket.on('close', () => {
      handleParticipantLeave(meetingId, clientId)
    })

    socket.on('error', (err) => {
      fastify.log.error('Meeting WebSocket error:', err)
      handleParticipantLeave(meetingId, clientId)
    })
  })

  // ========================================
  # 会议信令逻辑
  # ========================================

  function handleMeetingMessage(meetingId: string, clientId: string, message: any) {
    const clients = meetingClients.get(meetingId)
    if (!clients) return

    const client = clients.get(clientId)
    if (!client) return

    switch (message.type) {
      case 'offer':
        // WebRTC Offer
        handleOffer(meetingId, clientId, message)
        break

      case 'answer':
        // WebRTC Answer
        handleAnswer(meetingId, clientId, message)
        break

      case 'ice_candidate':
        // ICE Candidate
        handleIceCandidate(meetingId, clientId, message)
        break

      case 'toggle_audio':
        // 切换音频
        client.isMuted = message.muted
        broadcastToMeeting(meetingId, {
          type: 'participant_updated',
          participant: {
            id: clientId,
            userId: client.userId,
            isMuted: client.isMuted
          }
        })
        break

      case 'toggle_video':
        // 切换视频
        client.isVideoOff = message.off
        broadcastToMeeting(meetingId, {
          type: 'participant_updated',
          participant: {
            id: clientId,
            userId: client.userId,
            isVideoOff: client.isVideoOff
          }
        })
        break

      case 'start_screen_share':
        // 开始屏幕共享
        client.isScreenSharing = true
        broadcastToMeeting(meetingId, {
          type: 'screen_share_started',
          userId: client.userId,
          userName: client.userName
        })
        break

      case 'stop_screen_share':
        // 停止屏幕共享
        client.isScreenSharing = false
        broadcastToMeeting(meetingId, {
          type: 'screen_share_stopped',
          userId: client.userId
        })
        break

      case 'chat':
        // 聊天消息
        broadcastToMeeting(meetingId, {
          type: 'chat',
          userId: client.userId,
          userName: client.userName,
          userAvatar: client.userAvatar,
          content: message.content,
          sentAt: new Date().toISOString()
        })
        break

      case 'raise_hand':
        // 举手
        broadcastToMeeting(meetingId, {
          type: 'hand_raised',
          userId: client.userId,
          userName: client.userName,
          raised: message.raised
        })
        break

      case 'kick_participant':
        // 踢出参与者（主持人）
        if (client.userId === meetings.get(meetingId)?.hostId) {
          const targetClient = clients.get(message.targetId)
          if (targetClient) {
            targetClient.ws.send(JSON.stringify({ type: 'kicked' }))
            targetClient.ws.close(4003, 'Removed from meeting')
            clients.delete(message.targetId)
          }
        }
        break
    }
  }

  function handleOffer(meetingId: string, fromClientId: string, message: any) {
    const clients = meetingClients.get(meetingId)
    if (!clients) return

    const targetClient = clients.get(message.targetId)
    if (!targetClient) return

    targetClient.ws.send(JSON.stringify({
      type: 'offer',
      offer: message.offer,
      fromId: fromClientId,
      fromUserId: clients.get(fromClientId)?.userId
    }))
  }

  function handleAnswer(meetingId: string, fromClientId: string, message: any) {
    const clients = meetingClients.get(meetingId)
    if (!clients) return

    const targetClient = clients.get(message.targetId)
    if (!targetClient) return

    targetClient.ws.send(JSON.stringify({
      type: 'answer',
      answer: message.answer,
      fromId: fromClientId
    }))
  }

  function handleIceCandidate(meetingId: string, fromClientId: string, message: any) {
    const clients = meetingClients.get(meetingId)
    if (!clients) return

    const targetClient = clients.get(message.targetId)
    if (!targetClient) return

    targetClient.ws.send(JSON.stringify({
      type: 'ice_candidate',
      candidate: message.candidate,
      fromId: fromClientId
    }))
  }

  function handleParticipantLeave(meetingId: string, clientId: string) {
    const clients = meetingClients.get(meetingId)
    if (!clients) return

    const client = clients.get(clientId)
    if (!client) return

    clients.delete(clientId)

    // 广播离开
    broadcastToMeeting(meetingId, {
      type: 'participant_left',
      userId: client.userId,
      leftAt: new Date().toISOString()
    })

    // 如果是主持人离开，转移主持人权限
    const meeting = meetings.get(meetingId)
    if (meeting && client.userId === meeting.hostId && clients.size > 0) {
      const newHost = clients.values().next().value
      if (newHost) {
        meeting.hostId = newHost.userId
        broadcastToMeeting(meetingId, {
          type: 'host_changed',
          newHostId: newHost.userId,
          newHostName: newHost.userName
        })
      }
    }

    // 如果会议没人了，可以选择结束会议
    if (clients.size === 0) {
      setTimeout(() => {
        if (meetingClients.get(meetingId)?.size === 0) {
          meetings.delete(meetingId)
        }
      }, 5 * 60 * 1000) // 5分钟后删除空会议
    }
  }

  function broadcastToMeeting(meetingId: string, message: any, excludeClientId?: string) {
    const clients = meetingClients.get(meetingId)
    if (!clients) return

    const data = JSON.stringify(message)
    clients.forEach((client, id) => {
      if (id !== excludeClientId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data)
      }
    })
  }
}

export default videoMeetingRoutes
