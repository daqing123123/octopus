'use strict'

import { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

// ============================================
// 通知中心路由 - 触手↔大脑双向通知通道
// ============================================

export default async function notificationRoutes(fastify: FastifyInstance) {

  // ----- 触手端：获取通知 -----
  fastify.get('/me/notifications', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['通知中心'],
      summary: '获取我的通知列表',
      querystring: {
        type: 'object',
        properties: {
          unreadOnly: { type: 'boolean', default: false },
          type: { type: 'string' },
          limit: { type: 'integer', default: 20 },
          offset: { type: 'integer', default: 0 },
          source: { type: 'string', enum: ['brain', 'tentacle', 'system', 'meeting'] }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { unreadOnly, type, limit, offset, source } = request.query as any

    let query = `SELECT * FROM notifications WHERE recipient_id = $1 AND archived = false`
    const params: any[] = [userId]
    let paramIndex = 2

    if (unreadOnly) query += ` AND read = false`
    if (type) { query += ` AND notification_type = $${paramIndex++}`; params.push(type) }
    if (source) { query += ` AND source = $${paramIndex++}`; params.push(source) }

    query += ` ORDER BY priority DESC, created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`
    params.push(limit, offset)

    const result = await fastify.db.query(query, params)

    // 未读数
    const countResult = await fastify.db.query(
      `SELECT COUNT(*) FROM notifications WHERE recipient_id = $1 AND read = false AND archived = false`,
      [userId]
    )

    return {
      success: true,
      data: {
        notifications: result.rows.map(n => ({
          id: n.id, type: n.notification_type, title: n.title, content: n.content,
          priority: n.priority, source: n.source, metadata: n.metadata,
          read: n.read, readAt: n.read_at, createdAt: n.created_at,
          enterprise: n.source_enterprise_id ? { id: n.source_enterprise_id } : null,
          sender: n.source_user_id ? { id: n.source_user_id } : null
        })),
        unreadCount: parseInt(countResult.rows[0].count),
        pagination: { limit, offset }
      }
    }
  })

  // ----- 触手端：标记已读 -----
  fastify.post('/me/notifications/:id/read', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['通知中心'],
      summary: '标记通知为已读',
      params: { type: 'object', properties: { id: { type: 'string' } } }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { id } = request.params as any

    await fastify.db.query(
      `UPDATE notifications SET read = true, read_at = NOW() 
       WHERE id = $1 AND recipient_id = $2`,
      [id, userId]
    )

    await fastify.db.query(
      `INSERT INTO notification_actions (notification_id, user_id, action) VALUES ($1, $2, 'read')`,
      [id, userId]
    )

    return { success: true, message: '已标记为已读' }
  })

  // ----- 触手端：全部标记已读 -----
  fastify.post('/me/notifications/read-all', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['通知中心'], summary: '全部标记已读' }
  }, async (request) => {
    const userId = (request.user as any).userId
    await fastify.db.query(
      `UPDATE notifications SET read = true, read_at = NOW() 
       WHERE recipient_id = $1 AND read = false`,
      [userId]
    )
    return { success: true, message: '全部已读' }
  })

  // ----- 触手端：删除/归档通知 -----
  fastify.delete('/me/notifications/:id', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['通知中心'], summary: '删除通知',
      params: { type: 'object', properties: { id: { type: 'string' } } }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { id } = request.params as any

    await fastify.db.query(
      `UPDATE notifications SET archived = true WHERE id = $1 AND recipient_id = $2`,
      [id, userId]
    )
    return { success: true }
  })

  // ----- 触手端：获取通知角标数 -----
  fastify.get('/me/notifications/count', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['通知中心'], summary: '获取未读通知数' }
  }, async (request) => {
    const userId = (request.user as any).userId

    const result = await fastify.db.query(
      `SELECT COUNT(*) FROM notifications WHERE recipient_id = $1 AND read = false AND archived = false`,
      [userId]
    )

    // 按类型分组
    const byType = await fastify.db.query(
      `SELECT notification_type, COUNT(*) as count 
       FROM notifications WHERE recipient_id = $1 AND read = false AND archived = false
       GROUP BY notification_type`,
      [userId]
    )

    const counts: any = {}
    byType.rows.forEach((r: any) => { counts[r.notification_type] = parseInt(r.count) })

    return {
      success: true,
      data: { total: parseInt(result.rows[0].count), byType: counts }
    }
  })

  // ----- 触手端：通知渠道设置 -----
  fastify.get('/me/notification-channels', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['通知中心'], summary: '获取通知渠道设置' }
  }, async (request) => {
    const userId = (request.user as any).userId
    const result = await fastify.db.query(
      `SELECT * FROM notification_channels WHERE user_id = $1`,
      [userId]
    )
    return { success: true, data: result.rows }
  })

  fastify.patch('/me/notification-channels/:channelType', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['通知中心'], summary: '更新通知渠道设置' }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { channelType } = request.params as any
    const { enabled, endpoint, settings } = request.body as any

    await fastify.db.query(
      `INSERT INTO notification_channels (user_id, channel_type, enabled, endpoint, settings)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, channel_type)
       DO UPDATE SET enabled = COALESCE($3, notification_channels.enabled),
                     endpoint = COALESCE($4, notification_channels.endpoint),
                     settings = COALESCE($5, notification_channels.settings),
                     updated_at = NOW()`,
      [userId, channelType, enabled, endpoint, JSON.stringify(settings || {})]
    )

    return { success: true, message: '设置已更新' }
  })

  // ----- 企业端：创建公告 -----
  fastify.post('/enterprises/:eid/announcements', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['通知中心'], summary: '发布公告（大脑→触手）',
      params: { type: 'object', properties: { eid: { type: 'string' } } },
      body: {
        type: 'object',
        required: ['title', 'content'],
        properties: {
          title: { type: 'string' }, content: { type: 'string' },
          contentHtml: { type: 'string' }, priority: { type: 'string', enum: ['normal', 'important', 'urgent'] },
          category: { type: 'string' }, pinned: { type: 'boolean' },
          targetType: { type: 'string', enum: ['all', 'department', 'selected'] },
          targetFilter: { type: 'object' },
          scheduledAt: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { eid } = request.params as any
    const { title, content, contentHtml, priority, category, pinned, targetType, targetFilter, scheduledAt } = request.body as any

    // 验证企业成员身份
    const member = await fastify.db.query(
      `SELECT role FROM user_enterprise_connections WHERE user_id = $1 AND enterprise_id = $2 AND status = 'active'`,
      [userId, eid]
    )
    if (member.rows.length === 0 || !['admin', 'hr', 'manager'].includes(member.rows[0].role)) {
      return { success: false, error: '无发布权限' }
    }

    // 创建公告
    const announcementId = uuidv4()
    await fastify.db.query(
      `INSERT INTO announcements (id, enterprise_id, author_id, title, content, content_html, category, priority, pinned, target_type, target_filter, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
      [announcementId, eid, userId, title, content, contentHtml, category || 'general',
       priority || 'normal', pinned || false, targetType || 'all', JSON.stringify(targetFilter || {})]
    )

    // 获取所有触手
    const tentacles = await fastify.db.query(
      `SELECT user_id FROM user_enterprise_connections WHERE enterprise_id = $1 AND status = 'active'`,
      [eid]
    )

    // 为每个触手创建通知
    const priorityMap: Record<string, number> = { urgent: 9, important: 7, normal: 5 }
    const priorityVal = priorityMap[priority || 'normal']

    for (const tentacle of tentacles.rows) {
      await fastify.db.query(
        `INSERT INTO notifications (recipient_id, notification_type, title, content, source, source_enterprise_id, priority)
         VALUES ($1, 'announcement', $2, $3, 'brain', $4, $5)`,
        [tentacle.user_id, title, content, eid, priorityVal]
      )
    }

    return {
      success: true,
      data: { id: announcementId, sentCount: tentacles.rows.length },
      message: `已推送至 ${tentacles.rows.length} 个触手`
    }
  })

  // ----- 企业端：公告列表 -----
  fastify.get('/enterprises/:eid/announcements', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['通知中心'], summary: '获取公告列表',
      querystring: { type: 'object', properties: { status: { type: 'string' }, limit: { type: 'integer' }, offset: { type: 'integer' } } }
    }
  }, async (request) => {
    const { eid } = request.params as any
    const { status, limit = 20, offset = 0 } = request.query as any

    let query = `SELECT * FROM announcements WHERE enterprise_id = $1`
    const params: any[] = [eid]

    if (status === 'published') query += ` AND published_at IS NOT NULL`
    else if (status === 'draft') query += ` AND published_at IS NULL`

    query += ` ORDER BY pinned DESC, published_at DESC LIMIT $2 OFFSET $3`
    params.push(limit, offset)

    const result = await fastify.db.query(query, params)
    const countResult = await fastify.db.query(
      `SELECT COUNT(*) FROM announcements WHERE enterprise_id = $1${status === 'published' ? ' AND published_at IS NOT NULL' : status === 'draft' ? ' AND published_at IS NULL' : ''}`,
      [eid]
    )

    return {
      success: true,
      data: {
        announcements: result.rows.map(a => ({
          id: a.id, title: a.title, content: a.content, category: a.category,
          priority: a.priority, pinned: a.pinned,
          publishedAt: a.published_at, createdAt: a.created_at
        })),
        total: parseInt(countResult.rows[0].count)
      }
    }
  })

  // ----- 企业端：批量推送 -----
  fastify.post('/enterprises/:eid/push/broadcast', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['通知中心'], summary: '批量推送通知到触手',
      body: {
        type: 'object',
        required: ['title', 'content'],
        properties: {
          title: { type: 'string' }, content: { type: 'string' },
          priority: { type: 'integer', minimum: 1, maximum: 9, default: 5 },
          targetType: { type: 'string' }, targetFilter: { type: 'object' },
          scheduledAt: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { eid } = request.params as any
    const { title, content, priority, targetType, targetFilter, scheduledAt } = request.body as any

    // 权限检查
    const member = await fastify.db.query(
      `SELECT role FROM user_enterprise_connections WHERE user_id = $1 AND enterprise_id = $2 AND status = 'active'`,
      [userId, eid]
    )
    if (member.rows.length === 0 || !['admin', 'hr'].includes(member.rows[0].role)) {
      return { success: false, error: '无推送权限' }
    }

    // 检查推送频率限制
    const pushConfig = await fastify.db.query(
      `SELECT max_daily_push_per_tentacle FROM enterprise_push_configs WHERE enterprise_id = $1`,
      [eid]
    )
    if (pushConfig.rows.length > 0) {
      const maxPush = pushConfig.rows[0].max_daily_push_per_tentacle
      // TODO: 检查今日已推送数
    }

    // 创建推送任务
    const campaignId = uuidv4()
    await fastify.db.query(
      `INSERT INTO push_campaigns (id, enterprise_id, creator_id, title, content, target_type, target_filter, status, scheduled_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [campaignId, eid, userId, title, content, targetType || 'all',
       JSON.stringify(targetFilter || {}),
       scheduledAt ? 'scheduled' : 'sending',
       scheduledAt || null]
    )

    // 如果立即发送
    if (!scheduledAt) {
      return await sendBroadcast(fastify, campaignId, eid, title, content, priority || 5)
    }

    return { success: true, data: { campaignId, scheduledAt }, message: '已安排推送' }
  })
}

// 发送广播的辅助函数
async function sendBroadcast(fastify: any, campaignId: string, enterpriseId: string, title: string, content: string, priority: number) {
  const tentacles = await fastify.db.query(
    `SELECT user_id FROM user_enterprise_connections WHERE enterprise_id = $1 AND status = 'active'`,
    [enterpriseId]
  )

  for (const tentacle of tentacles.rows) {
    await fastify.db.query(
      `INSERT INTO notifications (recipient_id, notification_type, title, content, source, source_enterprise_id, priority)
       VALUES ($1, 'announcement', $2, $3, 'brain', $4, $5)`,
      [tentacle.user_id, title, content, enterpriseId, priority]
    )
  }

  await fastify.db.query(
    `UPDATE push_campaigns SET status = 'sent', sent_at = NOW(), 
     stats = jsonb_build_object('total', $2, 'sent', $2, 'delivered', $2, 'read', 0)
     WHERE id = $1`,
    [campaignId, tentacles.rows.length]
  )

  return {
    success: true,
    data: { campaignId, sentCount: tentacles.rows.length },
    message: `已推送至 ${tentacles.rows.length} 个触手`
  }
}
