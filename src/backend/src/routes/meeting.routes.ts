'use strict'

import { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

// ============================================
// 视频会议路由 - 腾讯会议集成
// ============================================

export default async function meetingRoutes(fastify: FastifyInstance) {

  // ========================================
  // 触手端：获取我的会议
  // ========================================
  fastify.get('/me/meetings', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['视频会议'],
      summary: '获取我的会议列表',
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['upcoming', 'ongoing', 'past', 'all'] },
          limit: { type: 'integer', default: 20 },
          offset: { type: 'integer', default: 0 }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { status = 'upcoming', limit = 20, offset = 0 } = request.query as any

    let dateFilter = ''
    switch (status) {
      case 'upcoming': dateFilter = `AND vm.start_time > NOW()`; break
      case 'ongoing': dateFilter = `AND vm.status = 'in_progress'`; break
      case 'past': dateFilter = `AND vm.end_time < NOW()`; break
    }

    const result = await fastify.db.query(
      `SELECT vm.*, mp.role as my_role, mp.status as my_status, mp.join_url,
              u.name as creator_name, u.avatar_url as creator_avatar,
              d.name as department_name,
              (SELECT COUNT(*) FROM meeting_participants WHERE meeting_id = vm.id AND status = 'joined') as current_participants
       FROM meeting_participants mp
       JOIN video_meetings vm ON vm.id = mp.meeting_id
       LEFT JOIN users u ON u.id = vm.creator_id
       LEFT JOIN departments d ON d.id = vm.department_id
       WHERE mp.user_id = $1 ${dateFilter}
       ORDER BY vm.start_time ${status === 'past' ? 'DESC' : 'ASC'}
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    )

    return {
      success: true,
      data: result.rows.map(m => ({
        id: m.id, title: m.title, description: m.description,
        meetingType: m.meeting_type, startTime: m.start_time,
        endTime: m.end_time, duration: m.duration_minutes,
        status: m.status, timezone: m.timezone,
        password: m.password ? '******' : null,
        creator: { id: m.creator_id, name: m.creator_name, avatarUrl: m.creator_avatar },
        department: m.department_name,
        myRole: m.my_role, myStatus: m.my_status,
        joinUrl: m.join_url,
        currentParticipants: parseInt(m.current_participants),
        maxParticipants: m.max_participants,
        hasRecording: false,
        agenda: m.agenda || []
      }))
    }
  })

  // ========================================
  // 触手端：获取单个会议详情
  // ========================================
  fastify.get('/me/meetings/:meetingId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['视频会议'],
      summary: '获取会议详情',
      params: { type: 'object', properties: { meetingId: { type: 'string' } } }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { meetingId } = request.params as any

    const meeting = await fastify.db.query(
      `SELECT vm.*, mp.role as my_role, mp.status as my_status, mp.join_url,
              mp.auto_summary as my_summary, mp.manual_summary,
              u.name as creator_name, u.avatar_url as creator_avatar
       FROM video_meetings vm
       LEFT JOIN meeting_participants mp ON mp.meeting_id = vm.id AND mp.user_id = $2
       LEFT JOIN users u ON u.id = vm.creator_id
       WHERE vm.id = $1`,
      [meetingId, userId]
    )

    if (meeting.rows.length === 0) return { success: false, error: '会议不存在' }

    const m = meeting.rows[0]

    // 参与者列表
    const participants = await fastify.db.query(
      `SELECT mp.*, u.name as user_name, u.avatar_url as user_avatar
       FROM meeting_participants mp
       LEFT JOIN users u ON u.id = mp.user_id
       WHERE mp.meeting_id = $1
       ORDER BY mp.role = 'host' DESC, mp.joined_at ASC NULLS LAST`,
      [meetingId]
    )

    // 会议录制
    const recordings = await fastify.db.query(
      `SELECT * FROM meeting_recordings WHERE meeting_id = $1 ORDER BY created_at DESC`,
      [meetingId]
    )

    // 行动项
    const actionItems = await fastify.db.query(
      `SELECT mai.*, u.name as assignee_name
       FROM meeting_action_items mai
       LEFT JOIN users u ON u.id = mai.assignee_id
       WHERE mai.meeting_id = $1
       ORDER BY mai.priority DESC, mai.due_date ASC`,
      [meetingId]
    )

    return {
      success: true,
      data: {
        id: m.id, title: m.title, description: m.description,
        meetingType: m.meeting_type, startTime: m.start_time,
        endTime: m.end_time, duration: m.duration_minutes,
        timezone: m.timezone, status: m.status,
        password: m.password ? '******' : null,
        autoRecord: m.auto_record, recordEnabled: m.record_enabled,
        creator: { id: m.creator_id, name: m.creator_name, avatarUrl: m.creator_avatar },
        myRole: m.my_role, myStatus: m.my_status, myJoinUrl: m.join_url,
        mySummary: m.my_summary || m.manual_summary,
        agenda: m.agenda || [],
        participants: participants.rows.map(p => ({
          id: p.id, userId: p.user_id, name: p.user_name || p.name,
          avatarUrl: p.user_avatar, role: p.role,
          status: p.status, joinedAt: p.joined_at, leftAt: p.left_at
        })),
        recordings: recordings.rows.map(r => ({
          id: r.id, fileName: r.file_name, fileUrl: r.file_url,
          durationSeconds: r.duration_seconds, format: r.format,
          status: r.status, downloadCount: r.download_count
        })),
        actionItems: actionItems.rows.map(a => ({
          id: a.id, title: a.title, description: a.description,
          assigneeId: a.assignee_id, assigneeName: a.assignee_name,
          dueDate: a.due_date, priority: a.priority, status: a.status,
          completedAt: a.completed_at
        })),
        currentParticipants: participants.rows.filter((p: any) => p.status === 'joined').length
      }
    }
  })

  // ========================================
  // 触手端：加入会议
  // ========================================
  fastify.post('/me/meetings/:meetingId/join', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['视频会议'],
      summary: '加入会议',
      params: { type: 'object', properties: { meetingId: { type: 'string' } } }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { meetingId } = request.params as any

    const meeting = await fastify.db.query(
      `SELECT * FROM video_meetings WHERE id = $1`,
      [meetingId]
    )

    if (meeting.rows.length === 0) return { success: false, error: '会议不存在' }

    const m = meeting.rows[0]

    // 检查是否在参会名单中
    let participant = await fastify.db.query(
      `SELECT * FROM meeting_participants WHERE meeting_id = $1 AND user_id = $2`,
      [meetingId, userId]
    )

    if (participant.rows.length === 0) {
      // 自动添加为参与者
      await fastify.db.query(
        `INSERT INTO meeting_participants (meeting_id, user_id, role, status, joined_at)
         VALUES ($1, $2, 'attendee', 'joined', NOW())`,
        [meetingId, userId]
      )
    } else {
      await fastify.db.query(
        `UPDATE meeting_participants SET status = 'joined', joined_at = NOW()
         WHERE meeting_id = $1 AND user_id = $2`,
        [meetingId, userId]
      )
    }

    // 更新会议状态
    if (m.status === 'scheduled') {
      await fastify.db.query(
        `UPDATE video_meetings SET status = 'in_progress', actual_start = NOW() WHERE id = $1`,
        [meetingId]
      )
    }

    // 获取加入链接
    const joinUrl = participant.rows[0]?.join_url || `https://meeting.qq.com/w/${meetingId}`
    const joinUrl2 = `tencent://meeting?meetingcode=${m.tencent_meeting_code || meetingId}`

    return {
      success: true,
      data: {
        joinUrl, joinUrl2,
        meetingTitle: m.title,
        meetingCode: m.tencent_meeting_code || meetingId,
        password: m.password || null,
        isHost: participant.rows[0]?.role === 'host'
      }
    }
  })

  // ========================================
  // 触手端：离开会议
  // ========================================
  fastify.post('/me/meetings/:meetingId/leave', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['视频会议'], summary: '离开会议' }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { meetingId } = request.params as any

    await fastify.db.query(
      `UPDATE meeting_participants SET status = 'left', left_at = NOW()
       WHERE meeting_id = $1 AND user_id = $2`,
      [meetingId, userId]
    )

    // 检查是否所有参会者都离开了
    const remaining = await fastify.db.query(
      `SELECT COUNT(*) FROM meeting_participants WHERE meeting_id = $1 AND status = 'joined'`,
      [meetingId]
    )

    if (parseInt(remaining.rows[0].count) === 0) {
      await fastify.db.query(
        `UPDATE video_meetings SET status = 'ended', actual_end = NOW() WHERE id = $1`,
        [meetingId]
      )
    }

    return { success: true, message: '已离开会议' }
  })

  // ========================================
  // 触手端：保存会议纪要
  // ========================================
  fastify.patch('/me/meetings/:meetingId/summary', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['视频会议'],
      summary: '保存会议纪要',
      body: { type: 'object', properties: { summary: { type: 'string' } } }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { meetingId } = request.params as any
    const { summary } = request.body as any

    await fastify.db.query(
      `UPDATE meeting_participants SET manual_summary = $1, summary_updated_at = NOW()
       WHERE meeting_id = $2 AND user_id = $3`,
      [summary, meetingId, userId]
    )

    return { success: true, message: '纪要已保存' }
  })

  // ========================================
  // 触手端：创建会议行动项
  // ========================================
  fastify.post('/me/meetings/:meetingId/action-items', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['视频会议'],
      summary: '创建会议行动项',
      body: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string' }, description: { type: 'string' },
          assigneeId: { type: 'string' }, dueDate: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { meetingId } = request.params as any
    const { title, description, assigneeId, dueDate, priority } = request.body as any

    const id = uuidv4()
    await fastify.db.query(
      `INSERT INTO meeting_action_items (id, meeting_id, assignee_id, title, description, due_date, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, meetingId, assigneeId || userId, title, description, dueDate || null, priority || 'normal']
    )

    return { success: true, data: { id }, message: '行动项已创建' }
  })

  // ========================================
  // 大脑端：创建会议
  // ========================================
  fastify.post('/enterprises/:eid/meetings', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['视频会议'],
      summary: '创建会议（管理员/主持人）',
      body: {
        type: 'object',
        required: ['title', 'startTime'],
        properties: {
          title: { type: 'string' }, description: { type: 'string' },
          departmentId: { type: 'string' },
          meetingType: { type: 'string', enum: ['instant', 'scheduled', 'recurring'] },
          startTime: { type: 'string' }, endTime: { type: 'string' },
          durationMinutes: { type: 'integer' }, timezone: { type: 'string' },
          password: { type: 'string' }, maxParticipants: { type: 'integer' },
          autoRecord: { type: 'boolean' },
          agenda: { type: 'array' },
          participantIds: { type: 'array', items: { type: 'string' } },
          recurrenceRule: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { eid } = request.params as any
    const {
      title, description, departmentId, meetingType, startTime, endTime,
      durationMinutes, timezone, password, maxParticipants, autoRecord,
      agenda, participantIds, recurrenceRule
    } = request.body as any

    const meetingId = uuidv4()
    // 生成腾讯会议code（实际应调用腾讯API）
    const tencentCode = `TM${Date.now().toString().slice(-8)}`

    await fastify.db.query(
      `INSERT INTO video_meetings
       (id, enterprise_id, creator_id, department_id, title, description, meeting_type,
        start_time, end_time, duration_minutes, timezone, password, max_participants,
        auto_record, agenda, recurrence_rule, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'scheduled')`,
      [meetingId, eid, userId, departmentId, title, description, meetingType || 'scheduled',
       startTime, endTime, durationMinutes || 60, timezone || 'Asia/Shanghai',
       password, maxParticipants || 300, autoRecord || false,
       JSON.stringify(agenda || []), recurrenceRule]
    )

    // 添加主持人
    await fastify.db.query(
      `INSERT INTO meeting_participants (meeting_id, user_id, role, status, join_url)
       VALUES ($1, $2, 'host', 'invited', $3)`,
      [meetingId, userId, `https://meeting.qq.com/w/${meetingId}`]
    )

    // 添加其他参会者
    if (participantIds && participantIds.length > 0) {
      for (const pid of participantIds) {
        if (pid !== userId) {
          await fastify.db.query(
            `INSERT INTO meeting_participants (meeting_id, user_id, role, status, join_url)
             VALUES ($1, $2, 'attendee', 'invited', $3)`,
            [meetingId, pid, `https://meeting.qq.com/w/${meetingId}?pwd=${password || ''}`]
          )

          // 发送通知
          await fastify.db.query(
            `INSERT INTO notifications (recipient_id, notification_type, title, content, source, source_enterprise_id, priority)
             VALUES ($1, 'meeting_reminder', $2, $3, 'brain', $4, 6)`,
            [pid, `📹 会议邀请：${title}`, `您被邀请参加"${title}"，开始时间：${new Date(startTime).toLocaleString()}`, eid]
          )
        }
      }
    }

    return {
      success: true,
      data: {
        id: meetingId,
        tencentCode,
        joinUrl: `https://meeting.qq.com/w/${meetingId}`,
        hostUrl: `https://meeting.qq.com/w/${meetingId}?host=1`,
        scheduledAt: startTime
      },
      message: `会议已创建${participantIds ? `，已邀请 ${participantIds.length} 位参会者` : ''}`
    }
  })

  // ========================================
  // 大脑端：获取会议列表（管理员）
  // ========================================
  fastify.get('/enterprises/:eid/meetings', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['视频会议'],
      summary: '获取企业所有会议（管理员）',
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string' }, departmentId: { type: 'string' },
          startDate: { type: 'string' }, endDate: { type: 'string' },
          page: { type: 'integer', default: 1 }, pageSize: { type: 'integer', default: 20 }
        }
      }
    }
  }, async (request) => {
    const { eid } = request.params as any
    const { status, departmentId, startDate, endDate, page = 1, pageSize = 20 } = request.query as any
    const offset = (page - 1) * pageSize

    let query = `SELECT vm.*, u.name as creator_name, d.name as department_name,
                    (SELECT COUNT(*) FROM meeting_participants WHERE meeting_id = vm.id) as total_participants,
                    (SELECT COUNT(*) FROM meeting_participants WHERE meeting_id = vm.id AND status = 'joined') as current_participants
                 FROM video_meetings vm
                 LEFT JOIN users u ON u.id = vm.creator_id
                 LEFT JOIN departments d ON d.id = vm.department_id
                 WHERE vm.enterprise_id = $1`
    const params: any[] = [eid]
    let p = 2

    if (status) { query += ` AND vm.status = $${p++}`; params.push(status) }
    if (departmentId) { query += ` AND vm.department_id = $${p++}`; params.push(departmentId) }
    if (startDate) { query += ` AND vm.start_time >= $${p++}`; params.push(startDate) }
    if (endDate) { query += ` AND vm.start_time <= $${p++}`; params.push(endDate) }

    query += ` ORDER BY vm.start_time DESC LIMIT $${p++} OFFSET $${p++}`
    params.push(pageSize, offset)

    const result = await fastify.db.query(query, params)
    const countResult = await fastify.db.query(
      `SELECT COUNT(*) FROM video_meetings WHERE enterprise_id = $1${status ? ` AND status = '${status}'` : ''}`,
      [eid]
    )

    return {
      success: true,
      data: {
        meetings: result.rows.map(m => ({
          id: m.id, title: m.title, startTime: m.start_time,
          endTime: m.end_time, status: m.status,
          creator: { id: m.creator_id, name: m.creator_name },
          department: m.department_name,
          totalParticipants: parseInt(m.total_participants),
          currentParticipants: parseInt(m.current_participants),
          hasRecording: m.auto_record
        })),
        pagination: { total: parseInt(countResult.rows[0].count), page, pageSize }
      }
    }
  })

  // ========================================
  // 大脑端：获取会议统计数据
  // ========================================
  fastify.get('/enterprises/:eid/meetings/stats', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['视频会议'], summary: '获取会议统计数据' }
  }, async (request) => {
    const { eid } = request.params as any

    const now = new Date()
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()))
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const stats = await fastify.db.query(
      `SELECT 
         COUNT(*) FILTER (WHERE start_time >= $2) as week_meetings,
         COUNT(*) FILTER (WHERE start_time >= $3) as month_meetings,
         AVG(duration_minutes) FILTER (WHERE status = 'ended') as avg_duration,
         SUM(duration_minutes) FILTER (WHERE start_time >= $3) as total_minutes_month,
         COUNT(*) FILTER (WHERE status = 'in_progress') as ongoing,
         (SELECT COUNT(*) FROM meeting_participants WHERE status = 'joined') as total_active_participants
       FROM video_meetings
       WHERE enterprise_id = $1`,
      [eid, startOfWeek.toISOString(), startOfMonth.toISOString()]
    )

    return {
      success: true,
      data: {
        weekMeetings: parseInt(stats.rows[0].week_meetings) || 0,
        monthMeetings: parseInt(stats.rows[0].month_meetings) || 0,
        avgDurationMinutes: Math.round(parseFloat(stats.rows[0].avg_duration) || 0),
        totalMinutesMonth: parseInt(stats.rows[0].total_minutes_month) || 0,
        ongoingMeetings: parseInt(stats.rows[0].ongoing) || 0,
        totalActiveParticipants: parseInt(stats.rows[0].total_active_participants) || 0
      }
    }
  })

  // ========================================
  // 腾讯会议 Webhook 回调（可选集成）
  // ========================================
  fastify.post('/meetings/webhook/tencent', {
    schema: { tags: ['视频会议'], summary: '腾讯会议Webhook回调' }
  }, async (request) => {
    const body = request.body as any
    const { event_type, meeting_id, join_time, leave_time, userid } = body

    if (event_type === 'meeting.start') {
      await fastify.db.query(
        `UPDATE video_meetings SET status = 'in_progress', actual_start = NOW() 
         WHERE tencent_meeting_code = $1`,
        [meeting_id]
      )
    } else if (event_type === 'meeting.end') {
      await fastify.db.query(
        `UPDATE video_meetings SET status = 'ended', actual_end = NOW()
         WHERE tencent_meeting_code = $1`,
        [meeting_id]
      )
    } else if (event_type === 'participant.join') {
      await fastify.db.query(
        `UPDATE meeting_participants SET status = 'joined', joined_at = $1
         WHERE tencent_userid = $2`,
        [join_time, userid]
      )
    } else if (event_type === 'participant.leave') {
      await fastify.db.query(
        `UPDATE meeting_participants SET status = 'left', left_at = $1
         WHERE tencent_userid = $2`,
        [leave_time, userid]
      )
    }

    return { success: true }
  })
}
