import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'

// OKR 创建 Schema
const createOKRSchema = z.object({
  objective: z.string().min(1),
  period: z.enum(['quarter', 'year']),
  year: z.number(),
  quarter: z.number().optional(),
  keyResults: z.array(z.object({
    title: z.string(),
    targetValue: z.number(),
    unit: z.string(),
    currentValue: z.number().default(0)
  }))
})

// Key Result 更新 Schema
const updateKeyResultSchema = z.object({
  currentValue: z.number()
})

export default async function okrRoutes(fastify: FastifyInstance) {
  
  // 获取 OKR 列表
  fastify.get('/', async (request: FastifyRequest<{ Querystring: { period?: string } }>, reply: FastifyReply) => {
    try {
      // @ts-ignore
      const userId = request.user?.id
      const { period } = request.query

      let query = `
        SELECT o.*, 
          json_agg(
            json_build_object(
              'id', kr.id,
              'title', kr.title,
              'targetValue', kr.target_value,
              'currentValue', kr.current_value,
              'unit', kr.unit,
              'progress', kr.progress,
              'status', kr.status
            ) ORDER BY kr.created_at
          ) as "keyResults"
        FROM okrs o
        LEFT JOIN key_results kr ON o.id = kr.okr_id
        WHERE o.created_by = $1 AND o.deleted_at IS NULL
      `
      
      const params: any[] = [userId]
      
      if (period) {
        query += ` AND o.period = $2`
        params.push(period)
      }
      
      query += ` GROUP BY o.id ORDER BY o.year DESC, o.quarter DESC NULLS LAST`

      const result = await fastify.db.query(query, params)

      return {
        success: true,
        data: result.rows.map(row => ({
          id: row.id,
          objective: row.objective,
          keyResults: row.keyResults || [],
          progress: row.progress,
          status: row.status,
          period: row.period,
          year: row.year,
          quarter: row.quarter,
          createdAt: row.created_at
        }))
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '获取 OKR 失败' })
    }
  })

  // 创建 OKR
  fastify.post('/', async (request: FastifyRequest<{ Body: z.infer<typeof createOKRSchema> }>, reply: FastifyReply) => {
    try {
      const { objective, period, year, quarter, keyResults } = createOKRSchema.parse(request.body)
      
      // @ts-ignore
      const userId = request.user?.id
      const okrId = uuidv4()

      await fastify.db.query('BEGIN')

      // 创建 OKR
      await fastify.db.query(`
        INSERT INTO okrs (id, objective, period, year, quarter, created_by, progress, status)
        VALUES ($1, $2, $3, $4, $5, $6, 0, 'on_track')
      `, [okrId, objective, period, year, quarter || null, userId])

      // 创建 Key Results
      for (const kr of keyResults) {
        const krId = uuidv4()
        const progress = Math.round((kr.currentValue / kr.targetValue) * 100)
        
        await fastify.db.query(`
          INSERT INTO key_results (id, okr_id, title, target_value, current_value, unit, progress, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [krId, okrId, kr.title, kr.targetValue, kr.currentValue, kr.unit, progress, 'not_started'])
      }

      await fastify.db.query('COMMIT')

      // 返回创建的 OKR
      const result = await fastify.db.query(`
        SELECT o.*, 
          json_agg(
            json_build_object(
              'id', kr.id,
              'title', kr.title,
              'targetValue', kr.target_value,
              'currentValue', kr.current_value,
              'unit', kr.unit,
              'progress', kr.progress,
              'status', kr.status
            ) ORDER BY kr.created_at
          ) as "keyResults"
        FROM okrs o
        LEFT JOIN key_results kr ON o.id = kr.okr_id
        WHERE o.id = $1
        GROUP BY o.id
      `, [okrId])

      return {
        success: true,
        data: {
          id: result.rows[0].id,
          objective: result.rows[0].objective,
          keyResults: result.rows[0].keyResults,
          progress: result.rows[0].progress,
          status: result.rows[0].status,
          period: result.rows[0].period,
          year: result.rows[0].year,
          quarter: result.rows[0].quarter,
          createdAt: result.rows[0].created_at
        }
      }
    } catch (error) {
      await fastify.db.query('ROLLBACK')
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '创建 OKR 失败' })
    }
  })

  // 更新 Key Result
  fastify.patch('/:okrId/key-results/:krId', async (
    request: FastifyRequest<{ Params: { okrId: string; krId: string }, Body: z.infer<typeof updateKeyResultSchema> }>,
    reply: FastifyReply
  ) => {
    try {
      const { okrId, krId } = request.params
      const { currentValue } = updateKeyResultSchema.parse(request.body)

      // 获取目标值
      const krResult = await fastify.db.query(`
        SELECT target_value FROM key_results WHERE id = $1
      `, [krId])

      if (krResult.rows.length === 0) {
        return reply.code(404).send({ success: false, error: 'Key Result 不存在' })
      }

      const targetValue = krResult.rows[0].target_value
      const progress = Math.min(100, Math.round((currentValue / targetValue) * 100))

      // 更新 Key Result
      await fastify.db.query(`
        UPDATE key_results 
        SET current_value = $1, progress = $2, 
            status = CASE 
              WHEN $2 >= 100 THEN 'completed'
              WHEN $2 > 0 THEN 'in_progress'
              ELSE 'not_started'
            END,
            updated_at = NOW()
        WHERE id = $3
      `, [currentValue, progress, krId])

      // 更新 OKR 总进度
      await fastify.db.query(`
        UPDATE okrs 
        SET progress = (
          SELECT AVG(progress)::int FROM key_results WHERE okr_id = $1
        ),
        status = CASE 
          WHEN (SELECT AVG(progress)::int FROM key_results WHERE okr_id = $1) >= 70 THEN 'on_track'
          WHEN (SELECT AVG(progress)::int FROM key_results WHERE okr_id = $1) >= 40 THEN 'at_risk'
          ELSE 'behind'
        END,
        updated_at = NOW()
        WHERE id = $1
      `, [okrId])

      return { success: true }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '更新失败' })
    }
  })

  // 删除 OKR
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params

      await fastify.db.query('BEGIN')

      // 删除关联的 Key Results
      await fastify.db.query(`
        DELETE FROM key_results WHERE okr_id = $1
      `, [id])

      // 软删除 OKR
      await fastify.db.query(`
        UPDATE okrs SET deleted_at = NOW() WHERE id = $1
      `, [id])

      await fastify.db.query('COMMIT')

      return { success: true }
    } catch (error) {
      await fastify.db.query('ROLLBACK')
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '删除失败' })
    }
  })

  // 获取 OKR 详情
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params

      const result = await fastify.db.query(`
        SELECT o.*, 
          json_agg(
            json_build_object(
              'id', kr.id,
              'title', kr.title,
              'targetValue', kr.target_value,
              'currentValue', kr.current_value,
              'unit', kr.unit,
              'progress', kr.progress,
              'status', kr.status
            ) ORDER BY kr.created_at
          ) as "keyResults"
        FROM okrs o
        LEFT JOIN key_results kr ON o.id = kr.okr_id
        WHERE o.id = $1
        GROUP BY o.id
      `, [id])

      if (result.rows.length === 0) {
        return reply.code(404).send({ success: false, error: 'OKR 不存在' })
      }

      return { success: true, data: result.rows[0] }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '获取 OKR 详情失败' })
    }
  })
}