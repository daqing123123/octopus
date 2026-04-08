import { FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

const clawKnowledgeRoutes: FastifyPluginAsync = async (fastify) => {

  // ========================================
  // 知识图谱节点
  // ========================================

  // 获取我的知识图谱
  fastify.get('/knowledge/graph', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['知识图谱'],
      summary: '获取个人知识图谱（节点+关系）',
      querystring: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          limit: { type: 'integer', default: 100 }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { type, limit = 100 } = request.query as any

    let typeFilter = type ? `AND entity_type = '${type}'` : ''

    const nodes = await fastify.db.query(
      `SELECT id, entity_type, entity_name, entity_description, importance_score, 
              mention_count, last_mentioned, created_at
       FROM personal_knowledge_nodes 
       WHERE user_id = $1 ${typeFilter}
       ORDER BY importance_score DESC
       LIMIT $2`,
      [userId, limit]
    )

    const nodeIds = nodes.rows.map((n: any) => n.id)

    let edges: any[] = []
    if (nodeIds.length > 0) {
      const edgesResult = await fastify.db.query(
        `SELECT id, source_node_id, target_node_id, relation_type, relation_strength, mention_count
         FROM personal_knowledge_edges 
         WHERE user_id = $1 AND source_node_id = ANY($2)
         LIMIT $3`,
        [userId, nodeIds, limit * 2]
      )
      edges = edgesResult.rows
    }

    // 统计各类型数量
    const typeStats = await fastify.db.query(
      `SELECT entity_type, COUNT(*) as count
       FROM personal_knowledge_nodes WHERE user_id = $1
       GROUP BY entity_type`,
      [userId]
    )

    return {
      success: true,
      data: {
        nodes: nodes.rows.map((n: any) => ({
          id: n.id,
          type: n.entity_type,
          name: n.entity_name,
          description: n.entity_description,
          importance: n.importance_score,
          mentions: n.mention_count,
          lastMentioned: n.last_mentioned
        })),
        edges: edges.map((e: any) => ({
          id: e.id,
          source: e.source_node_id,
          target: e.target_node_id,
          type: e.relation_type,
          strength: e.relation_strength
        })),
        stats: typeStats.rows.reduce((acc: any, s: any) => {
          acc[s.entity_type] = parseInt(s.count)
          return acc
        }, {})
      }
    }
  })

  // 添加知识节点
  fastify.post('/knowledge/nodes', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['知识图谱'],
      summary: '添加知识节点',
      body: {
        type: 'object',
        required: ['entityType', 'entityName'],
        properties: {
          entityType: { type: 'string', enum: ['person', 'project', 'concept', 'tool', 'topic', 'meeting', 'task', 'document'] },
          entityName: { type: 'string', maxLength: 200 },
          entityDescription: { type: 'string' },
          entityData: { type: 'object' },
          importance: { type: 'number', minimum: 0, maximum: 1, default: 0.5 }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { entityType, entityName, entityDescription, entityData, importance = 0.5 } = request.body as any

    // 检查是否已存在
    const existing = await fastify.db.query(
      `SELECT id, mention_count FROM personal_knowledge_nodes 
       WHERE user_id = $1 AND entity_type = $2 AND entity_name = $3`,
      [userId, entityType, entityName]
    )

    if (existing.rows.length > 0) {
      // 更新已有节点
      const nodeId = existing.rows[0].id
      await fastify.db.query(
        `UPDATE personal_knowledge_nodes 
         SET mention_count = mention_count + 1, last_mentioned = NOW(),
             importance_score = LEAST(1.0, importance_score + 0.05)
         WHERE id = $1`,
        [nodeId]
      )
      return { success: true, data: { nodeId, action: 'updated' } }
    }

    const nodeId = uuidv4()
    await fastify.db.query(
      `INSERT INTO personal_knowledge_nodes 
       (id, user_id, entity_type, entity_name, entity_description, entity_data, importance_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [nodeId, userId, entityType, entityName, entityDescription || '', JSON.stringify(entityData || {}), importance]
    )

    return { success: true, data: { nodeId, action: 'created' } }
  })

  // 添加知识关系
  fastify.post('/knowledge/edges', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['知识图谱'],
      summary: '添加知识关系',
      body: {
        type: 'object',
        required: ['sourceNodeId', 'targetNodeId', 'relationType'],
        properties: {
          sourceNodeId: { type: 'string', format: 'uuid' },
          targetNodeId: { type: 'string', format: 'uuid' },
          relationType: { type: 'string' },
          strength: { type: 'number', minimum: 0, maximum: 1, default: 0.5 }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { sourceNodeId, targetNodeId, relationType, strength = 0.5 } = request.body as any

    // 验证节点所有权
    const nodes = await fastify.db.query(
      `SELECT id FROM personal_knowledge_nodes WHERE id IN ($1, $2) AND user_id = $3`,
      [sourceNodeId, targetNodeId, userId]
    )

    if (nodes.rows.length < 2) {
      return { success: false, error: '节点不存在或无权限' }
    }

    const edgeId = uuidv4()
    await fastify.db.query(
      `INSERT INTO personal_knowledge_edges 
       (id, user_id, source_node_id, target_node_id, relation_type, relation_strength)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (source_node_id, target_node_id, relation_type) DO UPDATE SET
         mention_count = personal_knowledge_edges.mention_count + 1,
         relation_strength = GREATEST(personal_knowledge_edges.relation_strength, EXCLUDED.relation_strength)`,
      [edgeId, userId, sourceNodeId, targetNodeId, relationType, strength]
    )

    return { success: true, message: '关系已添加' }
  })

  // 删除知识节点
  fastify.delete('/knowledge/nodes/:nodeId', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['知识图谱'], summary: '删除知识节点' }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { nodeId } = request.params as any

    const result = await fastify.db.query(
      `DELETE FROM personal_knowledge_nodes WHERE id = $1 AND user_id = $2 RETURNING id`,
      [nodeId, userId]
    )

    if (result.rows.length === 0) {
      return reply.status(404).send({ success: false, error: '节点不存在' })
    }

    return { success: true, message: '节点已删除' }
  })

  // 搜索知识
  fastify.get('/knowledge/search', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['知识图谱'],
      summary: '搜索知识节点',
      querystring: {
        type: 'object',
        required: ['q'],
        properties: { q: { type: 'string' } }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { q } = request.query as any

    const result = await fastify.db.query(
      `SELECT id, entity_type, entity_name, entity_description, importance_score
       FROM personal_knowledge_nodes 
       WHERE user_id = $1 AND (
         entity_name ILIKE $2 OR entity_description ILIKE $2
       )
       ORDER BY importance_score DESC
       LIMIT 20`,
      [userId, `%${q}%`]
    )

    return {
      success: true,
      data: result.rows.map((n: any) => ({
        id: n.id,
        type: n.entity_type,
        name: n.entity_name,
        description: n.entity_description,
        importance: n.importance_score
      }))
    }
  })

  // 获取某节点的相关节点
  fastify.get('/knowledge/nodes/:nodeId/related', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['知识图谱'], summary: '获取相关节点' }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { nodeId } = request.params as any

    // 双向查询相关节点
    const related = await fastify.db.query(
      `SELECT DISTINCT n.id, n.entity_type, n.entity_name, n.entity_description,
              n.importance_score, e.relation_type, e.relation_strength
       FROM personal_knowledge_nodes n
       JOIN personal_knowledge_edges e ON (
         (e.source_node_id = n.id AND e.target_node_id = $2) OR
         (e.target_node_id = n.id AND e.source_node_id = $2)
       )
       WHERE n.user_id = $1 AND n.id != $2
       ORDER BY e.relation_strength DESC, n.importance_score DESC
       LIMIT 20`,
      [userId, nodeId]
    )

    return {
      success: true,
      data: related.rows.map((r: any) => ({
        id: r.id,
        type: r.entity_type,
        name: r.entity_name,
        description: r.entity_description,
        importance: r.importance_score,
        relation: r.relation_type,
        relationStrength: r.relation_strength
      }))
    }
  })

  // ========================================
  // 生产力评分 & 时间模式
  // ========================================

  // 获取生产力评分
  fastify.get('/productivity/score', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['生产力分析'],
      summary: '获取个人生产力评分',
      querystring: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['week', 'month', 'quarter'] }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { period = 'week' } = request.query as any

    const days = period === 'week' ? 7 : period === 'month' ? 30 : 90

    const logs = await fastify.db.query(
      `SELECT log_date, messages_sent, tasks_completed, docs_created, 
              ai_queries, meeting_hours, focus_score, collaboration_score
       FROM personal_productivity_logs
       WHERE user_id = $1 AND log_date >= CURRENT_DATE - INTERVAL '${days} days'
       ORDER BY log_date`,
      [userId]
    )

    if (logs.rows.length === 0) {
      return {
        success: true,
        data: {
          overallScore: 0,
          breakdown: { communication: 0, task: 0, creativity: 0, collaboration: 0 },
          trend: [],
          period,
          tip: '开始使用平台，Claw会慢慢了解您的生产力模式'
        }
      }
    }

    // 计算各维度评分
    const totalMessages = logs.rows.reduce((s: number, l: any) => s + l.messages_sent, 0)
    const totalTasks = logs.rows.reduce((s: number, l: any) => s + l.tasks_completed, 0)
    const totalDocs = logs.rows.reduce((s: number, l: any) => s + l.docs_created, 0)
    const totalAi = logs.rows.reduce((s: number, l: any) => s + l.ai_queries, 0)
    const avgFocus = logs.rows.reduce((s: number, l: any) => s + (l.focus_score || 0), 0) / logs.rows.length
    const avgCollab = logs.rows.reduce((s: number, l: any) => s + (l.collaboration_score || 0), 0) / logs.rows.length

    // 综合评分 (0-100)
    const communication = Math.min(100, (totalMessages / days) * 5)
    const task = Math.min(100, (totalTasks / days) * 10)
    const creativity = Math.min(100, (totalDocs / days) * 8 + (totalAi / days) * 3)
    const collaboration = avgCollab

    const overall = Math.round((communication + task + creativity + collaboration) / 4)

    // 趋势（每日评分）
    const trend = logs.rows.map((l: any) => ({
      date: l.log_date,
      score: Math.round(((l.messages_sent / days) * 5 + (l.tasks_completed / days) * 10 + 
                  (l.focus_score || 50) + (l.collaboration_score || 50)) / 4)
    }))

    // 生成建议
    const tips: string[] = []
    if (avgFocus < 40) tips.push('专注度有提升空间，建议减少干扰，设置专注时段')
    if (totalTasks / days < 2) tips.push('任务完成率偏低，建议使用番茄工作法')
    if (totalDocs / days < 0.5) tips.push('文档产出较少，建议养成每日记录习惯')
    if (avgCollab > 70) tips.push('协作能力很强！继续保持')
    if (logs.rows.length >= 7 && trend.length >= 7) {
      const recent = trend.slice(-3).reduce((s: number, t: any) => s + t.score, 0) / 3
      const older = trend.slice(0, 3).reduce((s: number, t: any) => s + t.score, 0) / 3
      if (recent > older + 10) tips.push('📈 近期生产力有明显提升，继续保持！')
      else if (recent < older - 10) tips.push('📉 近期生产力有所下降，注意调整状态')
    }

    return {
      success: true,
      data: {
        overallScore: Math.round(overall),
        breakdown: {
          communication: Math.round(communication),
          task: Math.round(task),
          creativity: Math.round(creativity),
          collaboration: Math.round(collaboration),
          focus: Math.round(avgFocus)
        },
        summary: {
          totalMessages,
          totalTasks,
          totalDocs,
          totalAiQueries: totalAi,
          avgDailyScore: Math.round(overall)
        },
        trend,
        period,
        tip: tips.length > 0 ? tips.join(' | ') : '继续保持当前的工作节奏'
      }
    }
  })

  // 记录今日生产力
  fastify.post('/productivity/log', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['生产力分析'],
      summary: '记录今日生产力数据',
      body: {
        type: 'object',
        properties: {
          messagesSent: { type: 'integer', default: 0 },
          tasksCompleted: { type: 'integer', default: 0 },
          docsCreated: { type: 'integer', default: 0 },
          aiQueries: { type: 'integer', default: 0 },
          filesUploaded: { type: 'integer', default: 0 },
          meetingHours: { type: 'number', default: 0 },
          focusScore: { type: 'integer', minimum: 0, maximum: 100 },
          collaborationScore: { type: 'integer', minimum: 0, maximum: 100 },
          enterpriseId: { type: 'string', format: 'uuid' },
          workLocation: { type: 'string', enum: ['office', 'remote', 'mobile'] }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const body = request.body as any
    const logId = uuidv4()
    const now = new Date()

    await fastify.db.query(
      `INSERT INTO personal_productivity_logs 
       (id, user_id, log_date, hour_of_day, day_of_week, messages_sent, tasks_completed,
        docs_created, ai_queries, files_uploaded, meeting_hours, focus_score,
        collaboration_score, enterprise_id, work_location)
       VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (user_id, log_date, enterprise_id) DO UPDATE SET
         messages_sent = COALESCE(personal_productivity_logs.messages_sent, 0) + EXCLUDED.messages_sent,
         tasks_completed = COALESCE(personal_productivity_logs.tasks_completed, 0) + EXCLUDED.tasks_completed,
         docs_created = COALESCE(personal_productivity_logs.docs_created, 0) + EXCLUDED.docs_created,
         ai_queries = COALESCE(personal_productivity_logs.ai_queries, 0) + EXCLUDED.ai_queries,
         meeting_hours = COALESCE(personal_productivity_logs.meeting_hours, 0) + EXCLUDED.meeting_hours`,
      [logId, userId, now.getHours(), now.getDay(),
       body.messagesSent || 0, body.tasksCompleted || 0, body.docsCreated || 0,
       body.aiQueries || 0, body.filesUploaded || 0, body.meetingHours || 0,
       body.focusScore || null, body.collaborationScore || null,
       body.enterpriseId || null, body.workLocation || null]
    )

    return { success: true, message: '生产力数据已记录' }
  })

  // 获取时间模式分析
  fastify.get('/productivity/time-patterns', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['生产力分析'],
      summary: '获取时间模式分析'
    }
  }, async (request) => {
    const userId = (request.user as any).userId

    const logs = await fastify.db.query(
      `SELECT hour_of_day, day_of_week, messages_sent, tasks_completed, 
              docs_created, focus_score, collaboration_score
       FROM personal_productivity_logs
       WHERE user_id = $1 AND log_date >= CURRENT_DATE - INTERVAL '30 days'
         AND hour_of_day IS NOT NULL`,
      [userId]
    )

    if (logs.rows.length < 10) {
      return {
        success: true,
        data: {
          peakHours: [],
          bestDays: [],
          message: '数据不足，需要至少10天的使用记录才能分析时间模式'
        }
      }
    }

    // 按小时聚合
    const byHour: Record<number, { messages: number, tasks: number, focus: number, count: number }> = {}
    for (let h = 0; h < 24; h++) {
      byHour[h] = { messages: 0, tasks: 0, focus: 0, count: 0 }
    }

    logs.rows.forEach((l: any) => {
      const h = l.hour_of_day
      byHour[h].messages += l.messages_sent
      byHour[h].tasks += l.tasks_completed
      byHour[h].focus += l.focus_score || 0
      byHour[h].count++
    })

    // 找出高效时段
    const peakHours = Object.entries(byHour)
      .filter(([_, data]) => data.count > 0)
      .map(([hour, data]) => ({
        hour: parseInt(hour),
        avgMessages: Math.round(data.messages / data.count),
        avgTasks: Math.round(data.tasks / data.count),
        avgFocus: data.count > 0 ? Math.round(data.focus / data.count) : 0,
        activityLevel: Math.round((data.messages + data.tasks * 2) / data.count)
      }))
      .filter(h => h.activityLevel > 0)
      .sort((a, b) => b.activityLevel - a.activityLevel)
      .slice(0, 3)

    // 按星期几聚合
    const byDay: Record<number, { messages: number, tasks: number, score: number, count: number }> = {}
    for (let d = 1; d <= 7; d++) {
      byDay[d] = { messages: 0, tasks: 0, score: 0, count: 0 }
    }

    logs.rows.forEach((l: any) => {
      const d = l.day_of_week
      byDay[d].messages += l.messages_sent
      byDay[d].tasks += l.tasks_completed
      byDay[d].score += (l.focus_score || 50) + (l.collaboration_score || 50)
      byDay[d].count++
    })

    const bestDays = Object.entries(byDay)
      .filter(([_, data]) => data.count > 0)
      .map(([day, data]) => ({
        dayOfWeek: parseInt(day),
        dayName: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][parseInt(day)],
        avgMessages: Math.round(data.messages / data.count),
        avgTasks: Math.round(data.tasks / data.count),
        productivityScore: Math.round(data.score / data.count / 2)
      }))
      .filter(d => d.avgMessages > 0)
      .sort((a, b) => b.productivityScore - a.productivityScore)

    return {
      success: true,
      data: {
        peakHours: peakHours.map(h => ({
          ...h,
          timeRange: `${h.hour}:00-${h.hour + 1}:00`,
          recommendation: h.avgFocus > 70 ? '高效时段，适合处理复杂任务' :
                         h.avgMessages > 20 ? '沟通活跃，适合协作交流' : '整理时间，适合文档工作'
        })),
        bestDays,
        analysis: peakHours.length > 0 ? `您的高效时段通常是上午 ${peakHours[0]?.hour || 9}:00 左右` : ''
      }
    }
  })

  // ========================================
  // 技能雷达图
  // ========================================

  // 获取技能评估
  fastify.get('/skills/radar', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['技能分析'],
      summary: '获取技能雷达图'
    }
  }, async (request) => {
    const userId = (request.user as any).userId

    const skills = await fastify.db.query(
      `SELECT skill_category, skill_name, proficiency_level, evidence_count, last_assessed
       FROM user_skill_assessments
       WHERE user_id = $1
       ORDER BY proficiency_level DESC`,
      [userId]
    )

    // 按类别汇总
    const categories = ['communication', 'management', 'creative', 'technical', 'analysis',
                       'collaboration', 'leadership', 'problem_solving']

    const categoryLabels: Record<string, string> = {
      communication: '沟通协作',
      management: '任务管理',
      creative: '创意写作',
      technical: '技术能力',
      analysis: '分析能力',
      collaboration: '团队协作',
      leadership: '领导力',
      problem_solving: '问题解决'
    }

    const radarData = categories.map(cat => {
      const catSkills = skills.rows.filter((s: any) => s.skill_category === cat)
      if (catSkills.length === 0) {
        return { category: cat, label: categoryLabels[cat] || cat, level: 1, skills: [] }
      }
      const avgLevel = catSkills.reduce((s: number, sk: any) => s + sk.proficiency_level, 0) / catSkills.length
      return {
        category: cat,
        label: categoryLabels[cat] || cat,
        level: Math.round(avgLevel * 10) / 10,
        skills: catSkills.map((sk: any) => ({
          name: sk.skill_name,
          level: sk.proficiency_level,
          evidence: sk.evidence_count
        }))
      }
    })

    return {
      success: true,
      data: {
        radar: radarData,
        overallScore: Math.round(radarData.reduce((s, c) => s + c.level, 0) / radarData.length * 20),
        topSkills: skills.rows.slice(0, 5).map((s: any) => ({
          name: s.skill_name,
          category: s.skill_category,
          level: s.proficiency_level
        }))
      }
    }
  })

  // 更新技能评分
  fastify.post('/skills/radar', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['技能分析'],
      summary: '更新技能评分',
      body: {
        type: 'object',
        required: ['skillCategory', 'skillName', 'proficiencyLevel'],
        properties: {
          skillCategory: { type: 'string' },
          skillName: { type: 'string' },
          proficiencyLevel: { type: 'integer', minimum: 1, maximum: 5 },
          assessmentSource: { type: 'string', default: 'self_assessment' }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { skillCategory, skillName, proficiencyLevel, assessmentSource = 'self_assessment' } = request.body as any

    await fastify.db.query(
      `INSERT INTO user_skill_assessments (id, user_id, skill_category, skill_name, proficiency_level, assessment_source, evidence_count)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, 1)
       ON CONFLICT (user_id, skill_name) DO UPDATE SET
         proficiency_level = EXCLUDED.proficiency_level,
         assessment_source = EXCLUDED.assessment_source,
         evidence_count = user_skill_assessments.evidence_count + 1,
         last_assessed = NOW()`,
      [userId, skillCategory, skillName, proficiencyLevel, assessmentSource]
    )

    return { success: true, message: '技能评分已更新' }
  })

  // ========================================
  // 每日使用快照
  // ========================================

  // 获取每日使用趋势
  fastify.get('/usage/trend', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['使用趋势'],
      summary: '获取每日使用趋势',
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'integer', default: 30 }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { days = 30 } = request.query as any

    const snapshots = await fastify.db.query(
      `SELECT snapshot_date, usage_by_module, focus_minutes, meeting_minutes,
              deep_work_minutes, productivity_score, engagement_level
       FROM daily_usage_snapshots
       WHERE user_id = $1 AND snapshot_date >= CURRENT_DATE - INTERVAL '${days} days'
       ORDER BY snapshot_date`,
      [userId]
    )

    return {
      success: true,
      data: {
        trend: snapshots.rows.map((s: any) => ({
          date: s.snapshot_date,
          modules: s.usage_by_module,
          focusMinutes: s.focus_minutes,
          meetingMinutes: s.meeting_minutes,
          deepWorkMinutes: s.deep_work_minutes,
          productivityScore: s.productivity_score,
          engagementLevel: s.engagement_level
        })),
        summary: {
          avgFocusMinutes: Math.round(snapshots.rows.reduce((s: number, d: any) => s + d.focus_minutes, 0) / Math.max(1, snapshots.rows.length)),
          avgProductivityScore: Math.round(snapshots.rows.reduce((s: number, d: any) => s + (d.productivity_score || 0), 0) / Math.max(1, snapshots.rows.length)),
          totalDays: snapshots.rows.length
        }
      }
    }
  })
}

export default clawKnowledgeRoutes
