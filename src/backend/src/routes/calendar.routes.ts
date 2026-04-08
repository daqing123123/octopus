import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'

// 事件创建 Schema
const createEventSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  startTime: z.string(),
  endTime: z.string(),
  allDay: z.boolean().default(false),
  color: z.string().default('blue'),
  type: z.enum(['meeting', 'task', 'reminder', 'other']).default('other'),
  location: z.string().optional(),
  attendees: z.array(z.object({ id: z.string(), name: z.string() })).optional()
})

export default async function calendarRoutes(fastify: FastifyInstance) {
  
  // 获取事件列表
  fastify.get('/events', async (request: FastifyRequest<{ Querystring: { start?: string; end?: string } }>, reply: FastifyReply) => {
    try {
      // @ts-ignore
      const userId = request.user?.id
      const { start, end } = request.query

      let query = `
        SELECT e.*, 
          COALESCE(
            json_agg(
              json_build_object('id', a.user_id, 'name', u.name)
            ) FILTER (WHERE a.user_id IS NOT NULL),
            '[]'
          ) as attendees
        FROM calendar_events e
        LEFT JOIN event_attendees a ON e.id = a.event_id
        LEFT JOIN users u ON a.user_id = u.id
        WHERE e.created_by = $1 AND e.deleted_at IS NULL
      `
      
      const params: any[] = [userId]
      let paramCount = 2

      if (start) {
        query += ` AND e.start_time >= $${paramCount++}`
        params.push(start)
      }
      
      if (end) {
        query += ` AND e.end_time <= $${paramCount++}`
        params.push(end)
      }
      
      query += ` GROUP BY e.id ORDER BY e.start_time`

      const result = await fastify.db.query(query, params)

      return {
        success: true,
        data: result.rows.map(row => ({
          id: row.id,
          title: row.title,
          description: row.description,
          startTime: row.start_time,
          endTime: row.end_time,
          allDay: row.all_day,
          color: row.color,
          type: row.type,
          location: row.location,
          attendees: row.attendees
        }))
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '获取日历事件失败' })
    }
  })

  // 创建事件
  fastify.post('/events', async (request: FastifyRequest<{ Body: z.infer<typeof createEventSchema> }>, reply: FastifyReply) => {
    try {
      const { title, description, startTime, endTime, allDay, color, type, location, attendees } = createEventSchema.parse(request.body)
      
      // @ts-ignore
      const userId = request.user?.id
      const eventId = uuidv4()

      await fastify.db.query('BEGIN')

      // 创建事件
      await fastify.db.query(`
        INSERT INTO calendar_events (id, title, description, start_time, end_time, all_day, color, type, location, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [eventId, title, description, startTime, endTime, allDay, color, type, location, userId])

      // 添加参与者
      if (attendees && attendees.length > 0) {
        for (const attendee of attendees) {
          await fastify.db.query(`
            INSERT INTO event_attendees (event_id, user_id)
            VALUES ($1, $2)
          `, [eventId, attendee.id])
        }
      }

      await fastify.db.query('COMMIT')

      return {
        success: true,
        data: {
          id: eventId,
          title,
          description,
          startTime,
          endTime,
          allDay,
          color,
          type,
          location,
          attendees: attendees || []
        }
      }
    } catch (error) {
      await fastify.db.query('ROLLBACK')
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '创建事件失败' })
    }
  })

  // 更新事件
  fastify.patch('/events/:id', async (request: FastifyRequest<{ Params: { id: string }, Body: Partial<z.infer<typeof createEventSchema>> }>, reply: FastifyReply) => {
    try {
      const { id } = request.params
      const updates = request.body

      const setClauses = []
      const values = [id]
      let paramCount = 2

      if (updates.title !== undefined) {
        setClauses.push(`title = $${paramCount++}`)
        values.push(updates.title)
      }
      if (updates.description !== undefined) {
        setClauses.push(`description = $${paramCount++}`)
        values.push(updates.description)
      }
      if (updates.startTime !== undefined) {
        setClauses.push(`start_time = $${paramCount++}`)
        values.push(updates.startTime)
      }
      if (updates.endTime !== undefined) {
        setClauses.push(`end_time = $${paramCount++}`)
        values.push(updates.endTime)
      }
      if (updates.allDay !== undefined) {
        setClauses.push(`all_day = $${paramCount++}`)
        values.push(updates.allDay)
      }
      if (updates.color !== undefined) {
        setClauses.push(`color = $${paramCount++}`)
        values.push(updates.color)
      }
      if (updates.type !== undefined) {
        setClauses.push(`type = $${paramCount++}`)
        values.push(updates.type)
      }
      if (updates.location !== undefined) {
        setClauses.push(`location = $${paramCount++}`)
        values.push(updates.location)
      }

      setClauses.push('updated_at = NOW()')

      await fastify.db.query(`
        UPDATE calendar_events 
        SET ${setClauses.join(', ')}
        WHERE id = $1
      `, values)

      return { success: true }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '更新失败' })
    }
  })

  // 删除事件
  fastify.delete('/events/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params

      await fastify.db.query('BEGIN')

      // 删除参与者
      await fastify.db.query(`
        DELETE FROM event_attendees WHERE event_id = $1
      `, [id])

      // 软删除事件
      await fastify.db.query(`
        UPDATE calendar_events SET deleted_at = NOW() WHERE id = $1
      `, [id])

      await fastify.db.query('COMMIT')

      return { success: true }
    } catch (error) {
      await fastify.db.query('ROLLBACK')
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '删除失败' })
    }
  })

  // 获取事件详情
  fastify.get('/events/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params

      const result = await fastify.db.query(`
        SELECT e.*, 
          COALESCE(
            json_agg(
              json_build_object('id', a.user_id, 'name', u.name)
            ) FILTER (WHERE a.user_id IS NOT NULL),
            '[]'
          ) as attendees
        FROM calendar_events e
        LEFT JOIN event_attendees a ON e.id = a.event_id
        LEFT JOIN users u ON a.user_id = u.id
        WHERE e.id = $1
        GROUP BY e.id
      `, [id])

      if (result.rows.length === 0) {
        return reply.code(404).send({ success: false, error: '事件不存在' })
      }

      return { success: true, data: result.rows[0] }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '获取事件详情失败' })
    }
  })
}