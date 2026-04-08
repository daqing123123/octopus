import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'

// 问卷创建 Schema
const createSurveySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  questions: z.array(z.object({
    questionId: z.string(),
    type: z.enum(['text', 'textarea', 'radio', 'checkbox', 'select', 'rating', 'date', 'file']),
    title: z.string(),
    description: z.string().optional(),
    required: z.boolean().default(false),
    options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
    validation: z.object({
      minLength: z.number().optional(),
      maxLength: z.number().optional(),
      min: z.number().optional(),
      max: z.number().optional()
    }).optional()
  })),
  settings: z.object({
    anonymous: z.boolean().default(false),
    allowMultiple: z.boolean().default(false),
    showProgress: z.boolean().default(true),
    showResult: z.boolean().default(false),
    deadline: z.string().optional(),
    limit: z.number().optional()
  }).optional()
})

// 提交答案 Schema
const submitAnswerSchema = z.object({
  surveyId: z.string(),
  answers: z.record(z.any())
})

export default async function surveyRoutes(fastify: FastifyInstance) {
  
  // ========================================
  // 问卷管理
  // ========================================
  
  // 获取问卷列表
  fastify.get('/', async (request: FastifyRequest<{ Querystring: { status?: string } }>, reply: FastifyReply) => {
    try {
      // @ts-ignore
      const userId = request.user?.id
      const { status } = request.query

      let query = `
        SELECT s.*, 
          (SELECT COUNT(*) FROM survey_responses sr WHERE sr.survey_id = s.id) as "responseCount"
        FROM surveys s
        WHERE s.created_by = $1 AND s.deleted_at IS NULL
      `
      const params: any[] = [userId]
      
      if (status) {
        query += ` AND s.status = $2`
        params.push(status)
      }
      
      query += ` ORDER BY s.created_at DESC`

      const result = await fastify.db.query(query, params)

      return {
        success: true,
        data: result.rows.map(row => ({
          id: row.id,
          title: row.title,
          description: row.description,
          status: row.status,
          responseCount: parseInt(row.responseCount),
          settings: row.settings,
          createdAt: row.created_at,
          deadline: row.deadline
        }))
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '获取问卷列表失败' })
    }
  })

  // 创建问卷
  fastify.post('/', async (request: FastifyRequest<{ Body: z.infer<typeof createSurveySchema> }>, reply: FastifyReply) => {
    try {
      const surveyData = createSurveySchema.parse(request.body)
      
      // @ts-ignore
      const userId = request.user?.id
      const surveyId = uuidv4()

      const result = await fastify.db.query(`
        INSERT INTO surveys (id, title, description, questions, settings, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [
        surveyId,
        surveyData.title,
        surveyData.description,
        JSON.stringify(surveyData.questions),
        JSON.stringify(surveyData.settings || {}),
        userId
      ])

      return {
        success: true,
        data: {
          id: result.rows[0].id,
          title: result.rows[0].title,
          shareLink: `/survey/${surveyId}`
        }
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '创建问卷失败' })
    }
  })

  // 更新问卷
  fastify.put('/:id', async (request: FastifyRequest<{ Params: { id: string }, Body: Partial<z.infer<typeof createSurveySchema>> }>, reply: FastifyReply) => {
    try {
      const { id } = request.params
      const updates = request.body

      // 检查是否有已提交的答案
      const responseCount = await fastify.db.query(`
        SELECT COUNT(*) FROM survey_responses WHERE survey_id = $1
      `, [id])

      if (parseInt(responseCount.rows[0].count) > 0) {
        return reply.code(400).send({ 
          success: false, 
          error: '该问卷已有回答，无法编辑' 
        })
      }

      const result = await fastify.db.query(`
        UPDATE surveys 
        SET title = COALESCE($1, title),
            description = COALESCE($2, description),
            questions = COALESCE($3, questions),
            settings = COALESCE($4, settings),
            updated_at = NOW()
        WHERE id = $5
        RETURNING *
      `, [
        updates.title,
        updates.description,
        updates.questions ? JSON.stringify(updates.questions) : null,
        updates.settings ? JSON.stringify(updates.settings) : null,
        id
      ])

      if (result.rows.length === 0) {
        return reply.code(404).send({ success: false, error: '问卷不存在' })
      }

      return { success: true, data: result.rows[0] }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '更新失败' })
    }
  })

  // 发布问卷
  fastify.patch('/:id/publish', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params

      await fastify.db.query(`
        UPDATE surveys SET status = 'active', published_at = NOW() WHERE id = $1
      `, [id])

      return { success: true }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '发布失败' })
    }
  })

  // 停止收集
  fastify.patch('/:id/close', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params

      await fastify.db.query(`
        UPDATE surveys SET status = 'closed' WHERE id = $1
      `, [id])

      return { success: true }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '操作失败' })
    }
  })

  // 删除问卷
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params

      await fastify.db.query(`
        UPDATE surveys SET deleted_at = NOW() WHERE id = $1
      `, [id])

      return { success: true }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '删除失败' })
    }
  })

  // ========================================
  // 问卷填写（公开接口）
  // ========================================
  
  // 获取问卷详情（填写页面）
  fastify.get('/public/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params

      const result = await fastify.db.query(`
        SELECT id, title, description, questions, settings, status, deadline
        FROM surveys
        WHERE id = $1 AND deleted_at IS NULL
      `, [id])

      if (result.rows.length === 0) {
        return reply.code(404).send({ success: false, error: '问卷不存在' })
      }

      const survey = result.rows[0]

      // 检查状态
      if (survey.status === 'draft') {
        return reply.code(403).send({ success: false, error: '问卷尚未发布' })
      }

      if (survey.status === 'closed') {
        return reply.code(403).send({ success: false, error: '问卷已停止收集' })
      }

      // 检查截止时间
      if (survey.deadline && new Date(survey.deadline) < new Date()) {
        return reply.code(403).send({ success: false, error: '问卷已截止' })
      }

      return {
        success: true,
        data: {
          id: survey.id,
          title: survey.title,
          description: survey.description,
          questions: survey.questions,
          settings: survey.settings
        }
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '获取问卷失败' })
    }
  })

  // 提交问卷答案
  fastify.post('/submit', async (request: FastifyRequest<{ Body: z.infer<typeof submitAnswerSchema> }>, reply: FastifyReply) => {
    try {
      const { surveyId, answers } = submitAnswerSchema.parse(request.body)

      // 获取问卷
      const surveyResult = await fastify.db.query(`
        SELECT * FROM surveys WHERE id = $1 AND status = 'active' AND deleted_at IS NULL
      `, [surveyId])

      if (surveyResult.rows.length === 0) {
        return reply.code(404).send({ success: false, error: '问卷不存在或已停止' })
      }

      const survey = surveyResult.rows[0]

      // 检查是否允许重复提交
      if (!survey.settings?.allowMultiple) {
        // @ts-ignore
        const userId = request.user?.id
        const existingResponse = await fastify.db.query(`
          SELECT id FROM survey_responses 
          WHERE survey_id = $1 AND respondent_id = $2
        `, [surveyId, userId])

        if (existingResponse.rows.length > 0) {
          return reply.code(400).send({ success: false, error: '您已提交过答案' })
        }
      }

      // 检查提交数量限制
      if (survey.settings?.limit) {
        const countResult = await fastify.db.query(`
          SELECT COUNT(*) FROM survey_responses WHERE survey_id = $1
        `, [surveyId])

        if (parseInt(countResult.rows[0].count) >= survey.settings.limit) {
          return reply.code(403).send({ success: false, error: '问卷提交数量已达上限' })
        }
      }

      const responseId = uuidv4()

      await fastify.db.query(`
        INSERT INTO survey_responses (id, survey_id, respondent_id, answers)
        VALUES ($1, $2, $3, $4)
      `, [
        responseId,
        surveyId,
        // @ts-ignore
        request.user?.id || null,
        JSON.stringify(answers)
      ])

      return { success: true, data: { responseId } }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '提交失败' })
    }
  })

  // ========================================
  // 统计分析
  // ========================================
  
  // 获取问卷统计
  fastify.get('/:id/stats', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params

      // 获取问卷信息
      const surveyResult = await fastify.db.query(`
        SELECT title, questions FROM surveys WHERE id = $1
      `, [id])

      if (surveyResult.rows.length === 0) {
        return reply.code(404).send({ success: false, error: '问卷不存在' })
      }

      const survey = surveyResult.rows[0]

      // 获取所有回答
      const responsesResult = await fastify.db.query(`
        SELECT answers, created_at FROM survey_responses WHERE survey_id = $1
        ORDER BY created_at DESC
      `, [id])

      const responses = responsesResult.rows
      const questions = survey.questions

      // 统计每道题的结果
      const stats = questions.map((q: any) => {
        const questionStats: any = {
          questionId: q.questionId,
          title: q.title,
          type: q.type,
          total: responses.length
        }

        if (['radio', 'select'].includes(q.type)) {
          // 单选统计
          const optionCounts: Record<string, number> = {}
          q.options?.forEach((opt: any) => { optionCounts[opt.value] = 0 })

          responses.forEach((r: any) => {
            const answer = r.answers[q.questionId]
            if (answer && optionCounts[answer] !== undefined) {
              optionCounts[answer]++
            }
          })

          questionStats.options = q.options?.map((opt: any) => ({
            ...opt,
            count: optionCounts[opt.value],
            percentage: responses.length > 0 
              ? Math.round((optionCounts[opt.value] / responses.length) * 100) 
              : 0
          }))
        } else if (q.type === 'checkbox') {
          // 多选统计
          const optionCounts: Record<string, number> = {}
          q.options?.forEach((opt: any) => { optionCounts[opt.value] = 0 })

          responses.forEach((r: any) => {
            const answers = r.answers[q.questionId] || []
            answers.forEach((answer: string) => {
              if (optionCounts[answer] !== undefined) {
                optionCounts[answer]++
              }
            })
          })

          questionStats.options = q.options?.map((opt: any) => ({
            ...opt,
            count: optionCounts[opt.value],
            percentage: responses.length > 0 
              ? Math.round((optionCounts[opt.value] / responses.length) * 100) 
              : 0
          }))
        } else if (q.type === 'rating') {
          // 评分统计
          const ratings = responses
            .map((r: any) => r.answers[q.questionId])
            .filter((v: any) => typeof v === 'number')

          if (ratings.length > 0) {
            questionStats.average = ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length
            questionStats.min = Math.min(...ratings)
            questionStats.max = Math.max(...ratings)
          }
        } else if (['text', 'textarea'].includes(q.type)) {
          // 文本题统计
          questionStats.textAnswers = responses
            .map((r: any) => r.answers[q.questionId])
            .filter((v: any) => v && v.trim())
            .slice(0, 100) // 最多返回100条
        }

        return questionStats
      })

      return {
        success: true,
        data: {
          totalResponses: responses.length,
          questions: stats
        }
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '获取统计失败' })
    }
  })

  // 导出回答数据
  fastify.get('/:id/export', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params

      const surveyResult = await fastify.db.query(`
        SELECT title, questions FROM surveys WHERE id = $1
      `, [id])

      if (surveyResult.rows.length === 0) {
        return reply.code(404).send({ success: false, error: '问卷不存在' })
      }

      const survey = surveyResult.rows[0]

      const responsesResult = await fastify.db.query(`
        SELECT sr.answers, sr.created_at, u.name as "respondentName"
        FROM survey_responses sr
        LEFT JOIN users u ON sr.respondent_id = u.id
        WHERE sr.survey_id = $1
        ORDER BY sr.created_at DESC
      `, [id])

      const questions = survey.questions
      const responses = responsesResult.rows

      // 生成 CSV
      const headers = ['提交时间', '提交人', ...questions.map((q: any) => q.title)]
      const rows = responses.map((r: any) => {
        const row = [
          r.created_at.toISOString(),
          r.respondentName || '匿名'
        ]
        questions.forEach((q: any) => {
          const answer = r.answers[q.questionId]
          if (Array.isArray(answer)) {
            row.push(answer.join(', '))
          } else {
            row.push(answer || '')
          }
        })
        return row
      })

      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/