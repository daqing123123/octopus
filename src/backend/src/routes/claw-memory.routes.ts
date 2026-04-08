import { FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

const clawMemoryRoutes: FastifyPluginAsync = async (fastify) => {

  // ========================================
  // 浜虹墿鍏崇郴绠＄悊
  // ========================================

  // 鑾峰彇鑱旂郴浜哄垪琛?  fastify.get('/contacts', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['浜虹墿鍏崇郴'],
      summary: '鑾峰彇涓汉鑱旂郴浜哄垪琛?,
      querystring: {
        type: 'object',
        properties: {
          relationType: { type: 'string' },
          limit: { type: 'integer', default: 50 },
          offset: { type: 'integer', default: 0 }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { relationType, limit = 50, offset = 0 } = request.query as any

    let typeFilter = relationType ? `AND relation_type = '${relationType}'` : ''

    const contacts = await fastify.db.query(
      `SELECT id, contact_user_id, contact_name, contact_email, contact_avatar,
              relation_type, first_met_at, last_interaction_at, interaction_count,
              shared_projects, shared_enterprises, personal_notes, tags
       FROM personal_contacts
       WHERE user_id = $1 ${typeFilter}
       ORDER BY last_interaction_at DESC NULLS LAST
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    )

    const total = await fastify.db.query(
      `SELECT COUNT(*) FROM personal_contacts WHERE user_id = $1 ${typeFilter}`,
      [userId]
    )

    return {
      success: true,
      data: {
        contacts: contacts.rows.map((c: any) => ({
          id: c.id,
          contactUserId: c.contact_user_id,
          name: c.contact_name,
          email: c.contact_email,
          avatar: c.contact_avatar,
          relationType: c.relation_type,
          firstMetAt: c.first_met_at,
          lastInteractionAt: c.last_interaction_at,
          interactionCount: c.interaction_count,
          sharedProjects: c.shared_projects,
          sharedEnterprises: c.shared_enterprises,
          notes: c.personal_notes,
          tags: c.tags
        })),
        total: parseInt(total.rows[0].count)
      }
    }
  })

  // 娣诲姞/鏇存柊鑱旂郴浜?  fastify.post('/contacts', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['浜虹墿鍏崇郴'],
      summary: '娣诲姞鎴栨洿鏂拌仈绯讳汉',
      body: {
        type: 'object',
        properties: {
          contactUserId: { type: 'string', format: 'uuid' },
          contactName: { type: 'string' },
          contactEmail: { type: 'string' },
          contactAvatar: { type: 'string' },
          relationType: { type: 'string', enum: ['colleague', 'client', 'partner', 'friend', 'mentor', 'other'] },
          firstMetAt: { type: 'string', format: 'date-time' },
          personalNotes: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { contactUserId, contactName, contactEmail, contactAvatar, relationType, firstMetAt, personalNotes, tags } = request.body as any

    const contactId = uuidv4()
    await fastify.db.query(
      `INSERT INTO personal_contacts 
       (id, user_id, contact_user_id, contact_name, contact_email, contact_avatar,
        relation_type, first_met_at, personal_notes, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (user_id, contact_user_id) DO UPDATE SET
         contact_name = COALESCE(EXCLUDED.contact_name, personal_contacts.contact_name),
         contact_email = COALESCE(EXCLUDED.contact_email, personal_contacts.contact_email),
         contact_avatar = COALESCE(EXCLUDED.contact_avatar, personal_contacts.contact_avatar),
         relation_type = COALESCE(EXCLUDED.relation_type, personal_contacts.relation_type),
         last_interaction_at = NOW(),
         interaction_count = personal_contacts.interaction_count + 1,
         personal_notes = COALESCE(EXCLUDED.personal_notes, personal_contacts.personal_notes),
         tags = COALESCE(EXCLUDED.tags, personal_contacts.tags)`,
      [contactId, userId, contactUserId || null, contactName || '', contactEmail || '',
       contactAvatar || '', relationType || 'colleague', firstMetAt || null, 
       personalNotes || '', JSON.stringify(tags || [])]
    )

    return { success: true, message: '鑱旂郴浜哄凡淇濆瓨' }
  })

  // 鑾峰彇鑱旂郴浜鸿鎯?  fastify.get('/contacts/:contactId', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['浜虹墿鍏崇郴'], summary: '鑾峰彇鑱旂郴浜鸿鎯? }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { contactId } = request.params as any

    const contact = await fastify.db.query(
      `SELECT * FROM personal_contacts WHERE id = $1 AND user_id = $2`,
      [contactId, userId]
    )

    if (contact.rows.length === 0) {
      return reply.status(404).send({ success: false, error: '鑱旂郴浜轰笉瀛樺湪' })
    }

    const c = contact.rows[0]

    // 鑾峰彇鍏卞悓椤圭洰
    const sharedProjects = await fastify.db.query(
      `SELECT t.id, t.title, t.status FROM tasks t
       WHERE t.assignee_id = $1 AND EXISTS (
         SELECT 1 FROM tasks t2 WHERE t2.title = t.title AND t2.assignee_id = $2
       )
       LIMIT 5`,
      [userId, c.contact_user_id]
    )

    return {
      success: true,
      data: {
        id: c.id,
        contactUserId: c.contact_user_id,
        name: c.contact_name,
        email: c.contact_email,
        avatar: c.contact_avatar,
        relationType: c.relation_type,
        firstMetAt: c.first_met_at,
        lastInteractionAt: c.last_interaction_at,
        interactionCount: c.interaction_count,
        sharedProjects: c.shared_projects,
        sharedEnterprises: c.shared_enterprises,
        notes: c.personal_notes,
        tags: c.tags,
        sharedTasks: sharedProjects.rows
      }
    }
  })

  // 鏇存柊浜掑姩璁板綍
  fastify.post('/contacts/:contactId/interact', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['浜虹墿鍏崇郴'],
      summary: '璁板綍涓庤仈绯讳汉鐨勪簰鍔?
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { contactId } = request.params as any

    await fastify.db.query(
      `UPDATE personal_contacts SET last_interaction_at = NOW(), interaction_count = interaction_count + 1
       WHERE id = $1 AND user_id = $2`,
      [contactId, userId]
    )

    return { success: true, message: '浜掑姩宸茶褰? }
  })

  // 鍒犻櫎鑱旂郴浜?  fastify.delete('/contacts/:contactId', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['浜虹墿鍏崇郴'], summary: '鍒犻櫎鑱旂郴浜? }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { contactId } = request.params as any

    await fastify.db.query(
      `DELETE FROM personal_contacts WHERE id = $1 AND user_id = $2`,
      [contactId, userId]
    )

    return { success: true, message: '鑱旂郴浜哄凡鍒犻櫎' }
  })

  // 鎼滅储鑱旂郴浜?  fastify.get('/contacts/search', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['浜虹墿鍏崇郴'],
      summary: '鎼滅储鑱旂郴浜?,
      querystring: { type: 'object', required: ['q'], properties: { q: { type: 'string' } } }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { q } = request.query as any

    const contacts = await fastify.db.query(
      `SELECT id, contact_name, contact_email, relation_type, tags
       FROM personal_contacts
       WHERE user_id = $1 AND (
         contact_name ILIKE $2 OR contact_email ILIKE $2 OR 
         personal_notes ILIKE $2 OR $3 = ANY(tags)
       )
       LIMIT 20`,
      [userId, `%${q}%`, q]
    )

    return { success: true, data: contacts.rows }
  })

  // ========================================
  # 閲嶈鏃跺埢鏍囪
  // ========================================

  // 鑾峰彇閲嶈鏃跺埢鍒楄〃
  fastify.get('/milestones', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['閲嶈鏃跺埢'],
      summary: '鑾峰彇閲嶈鏃跺埢鍒楄〃',
      querystring: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          year: { type: 'integer' },
          limit: { type: 'integer', default: 50 }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { type, year, limit = 50 } = request.query as any

    let filters = ['user_id = $1']
    const params: any[] = [userId]
    let pIdx = 2

    if (type) {
      filters.push(`milestone_type = $${pIdx++}`)
      params.push(type)
    }
    if (year) {
      filters.push(`EXTRACT(YEAR FROM occurred_at) = $${pIdx++}`)
      params.push(year)
    }

    params.push(limit)

    const milestones = await fastify.db.query(
      `SELECT id, milestone_type, title, description, occurred_at, context_data, 
              importance, reminder_enabled, reminded_at
       FROM personal_milestones
       WHERE ${filters.join(' AND ')}
       ORDER BY occurred_at DESC
       LIMIT $${pIdx}`,
      params
    )

    // 鑾峰彇骞翠唤鍒楄〃
    const years = await fastify.db.query(
      `SELECT DISTINCT EXTRACT(YEAR FROM occurred_at) as year
       FROM personal_milestones WHERE user_id = $1
       ORDER BY year DESC`,
      [userId]
    )

    return {
      success: true,
      data: {
        milestones: milestones.rows.map((m: any) => ({
          id: m.id,
          type: m.milestone_type,
          title: m.title,
          description: m.description,
          occurredAt: m.occurred_at,
          context: m.context_data,
          importance: m.importance,
          hasReminder: m.reminder_enabled,
          remindedAt: m.reminded_at
        })),
        years: years.rows.map((y: any) => parseInt(y.year)),
        types: ['decision', 'promise', 'achievement', 'learning', 'event']
      }
    }
  })

  // 鍒涘缓閲嶈鏃跺埢
  fastify.post('/milestones', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['閲嶈鏃跺埢'],
      summary: '鍒涘缓閲嶈鏃跺埢',
      body: {
        type: 'object',
        required: ['milestoneType', 'title', 'occurredAt'],
        properties: {
          milestoneType: { type: 'string', enum: ['decision', 'promise', 'achievement', 'learning', 'event'] },
          title: { type: 'string', maxLength: 200 },
          description: { type: 'string' },
          occurredAt: { type: 'string', format: 'date-time' },
          contextData: { type: 'object' },
          importance: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
          enableReminder: { type: 'boolean', default: false }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { milestoneType, title, description, occurredAt, contextData, importance = 5, enableReminder } = request.body as any

    const milestoneId = uuidv4()
    await fastify.db.query(
      `INSERT INTO personal_milestones 
       (id, user_id, milestone_type, title, description, occurred_at, context_data, importance, reminder_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [milestoneId, userId, milestoneType, title, description || '', occurredAt, 
       JSON.stringify(contextData || {}), importance, enableReminder || false]
    )

    return { success: true, data: { id: milestoneId }, message: '閲嶈鏃跺埢宸茶褰? }
  })

  // 鏇存柊閲嶈鏃跺埢
  fastify.patch('/milestones/:milestoneId', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['閲嶈鏃跺埢'], summary: '鏇存柊閲嶈鏃跺埢' }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { milestoneId } = request.params as any
    const updates = request.body as any

    const fields: string[] = []
    const values: any[] = []
    let i = 1

    if (updates.title !== undefined) { fields.push(`title = $${i++}`); values.push(updates.title) }
    if (updates.description !== undefined) { fields.push(`description = $${i++}`); values.push(updates.description) }
    if (updates.importance !== undefined) { fields.push(`importance = $${i++}`); values.push(updates.importance) }
    if (updates.enableReminder !== undefined) { fields.push(`reminder_enabled = $${i++}`); values.push(updates.enableReminder) }

    if (fields.length === 0) return { success: false, error: '娌℃湁鏇存柊瀛楁' }

    values.push(milestoneId, userId)
    await fastify.db.query(
      `UPDATE personal_milestones SET ${fields.join(', ')} WHERE id = $${i++} AND user_id = $${i}`,
      values
    )

    return { success: true, message: '宸叉洿鏂? }
  })

  // 鍒犻櫎閲嶈鏃跺埢
  fastify.delete('/milestones/:milestoneId', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['閲嶈鏃跺埢'], summary: '鍒犻櫎閲嶈鏃跺埢' }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { milestoneId } = request.params as any

    await fastify.db.query(
      `DELETE FROM personal_milestones WHERE id = $1 AND user_id = $2`,
      [milestoneId, userId]
    )

    return { success: true, message: '宸插垹闄? }
  })

  // ========================================
  // 瀵硅瘽璁板繂
  // ========================================

  // 鑾峰彇瀵硅瘽璁板繂鍒楄〃
  fastify.get('/conversation-memories', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['瀵硅瘽璁板繂'],
      summary: '鑾峰彇瀵硅瘽璁板繂',
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 30 },
          offset: { type: 'integer', default: 0 }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { limit = 30, offset = 0 } = request.query as any

    const memories = await fastify.db.query(
      `SELECT id, conversation_id, summary, key_points, entities, sentiment, importance, referenced_in
       FROM conversation_memories
       WHERE user_id = $1
       ORDER BY importance DESC, created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    )

    const total = await fastify.db.query(
      `SELECT COUNT(*) FROM conversation_memories WHERE user_id = $1`,
      [userId]
    )

    return {
      success: true,
      data: {
        memories: memories.rows.map((m: any) => ({
          id: m.id,
          conversationId: m.conversation_id,
          summary: m.summary,
          keyPoints: m.key_points,
          entities: m.entities,
          sentiment: m.sentiment,
          importance: m.importance,
          referencedCount: (m.referenced_in || []).length
        })),
        total: parseInt(total.rows[0].count)
      }
    }
  })

  // 淇濆瓨瀵硅瘽璁板繂
  fastify.post('/conversation-memories', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['瀵硅瘽璁板繂'],
      summary: '淇濆瓨瀵硅瘽璁板繂',
      body: {
        type: 'object',
        required: ['summary'],
        properties: {
          conversationId: { type: 'string', format: 'uuid' },
          summary: { type: 'string' },
          keyPoints: { type: 'array', items: { type: 'string' } },
          entities: { type: 'array', items: { type: 'string' } },
          sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
          importance: { type: 'integer', minimum: 1, maximum: 10, default: 5 }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { conversationId, summary, keyPoints, entities, sentiment, importance = 5 } = request.body as any

    const memoryId = uuidv4()
    await fastify.db.query(
      `INSERT INTO conversation_memories 
       (id, user_id, conversation_id, summary, key_points, entities, sentiment, importance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [memoryId, userId, conversationId || null, summary, JSON.stringify(keyPoints || []),
       JSON.stringify(entities || []), sentiment || 'neutral', importance]
    )

    // 鍚屾椂娣诲姞鍒扮煡璇嗗浘璋憋紙鎻愬彇瀹炰綋锛?    if (entities && entities.length > 0) {
      for (const entity of entities.slice(0, 5)) {
        await fastify.db.query(
          `INSERT INTO personal_knowledge_nodes (id, user_id, entity_type, entity_name, entity_description, importance_score)
           VALUES (uuid_generate_v4(), $1, 'concept', $2, $3, $4)
           ON CONFLICT DO NOTHING`,
          [userId, entity, `浠庡璇濅腑鎻愬彇: ${summary.slice(0, 50)}`, importance / 10]
        )
      }
    }

    return { success: true, data: { id: memoryId }, message: '瀵硅瘽璁板繂宸蹭繚瀛? }
  })

  // 寮曠敤瀵硅瘽璁板繂
  fastify.post('/conversation-memories/:memoryId/cite', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['瀵硅瘽璁板繂'],
      summary: '寮曠敤瀵硅瘽璁板繂锛堝湪鍚庣画瀵硅瘽涓娇鐢級'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { memoryId } = request.params as any

    const memory = await fastify.db.query(
      `UPDATE conversation_memories SET referenced_in = referenced_in || $1
       WHERE id = $2 AND user_id = $3
       RETURNING summary, key_points`,
      [JSON.stringify([{ citedAt: new Date().toISOString() }]), memoryId, userId]
    )

    if (memory.rows.length === 0) {
      return { success: false, error: '璁板繂涓嶅瓨鍦? }
    }

    return {
      success: true,
      data: {
        summary: memory.rows[0].summary,
        keyPoints: memory.rows[0].key_points
      }
    }
  })

  // ========================================
  // 閬楀繕鏇茬嚎澶嶄範璁″垝
  // ========================================

  // 鑾峰彇澶嶄範璁″垝
  fastify.get('/memory-review/schedule', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['璁板繂澶嶄範'],
      summary: '鑾峰彇璁板繂澶嶄範璁″垝'
    }
  }, async (request) => {
    const userId = (request.user as any).userId

    const reviews = await fastify.db.query(
      `SELECT id, memory_type, memory_id, ease_factor, interval_days, repetitions,
              next_review_at, last_reviewed_at, retention_score
       FROM memory_review_schedule
       WHERE user_id = $1 AND next_review_at IS NOT NULL
       ORDER BY next_review_at ASC
       LIMIT 50`,
      [userId]
    )

    // 浠婃棩寰呭涔犳暟閲?    const todayCount = await fastify.db.query(
      `SELECT COUNT(*) FROM memory_review_schedule
       WHERE user_id = $1 AND next_review_at <= NOW()`,
      [userId]
    )

    // 鑾峰彇澶嶄範鍘嗗彶
    const history = await fastify.db.query(
      `SELECT id, memory_type, memory_id, repetitions, retention_score, last_reviewed_at
       FROM memory_review_schedule
       WHERE user_id = $1 AND last_reviewed_at IS NOT NULL
       ORDER BY last_reviewed_at DESC
       LIMIT 20`,
      [userId]
    )

    return {
      success: true,
      data: {
        dueToday: parseInt(todayCount.rows[0].count),
        schedule: reviews.rows.map((r: any) => ({
          id: r.id,
          memoryType: r.memory_type,
          memoryId: r.memory_id,
          easeFactor: r.ease_factor,
          intervalDays: r.interval_days,
          repetitions: r.repetitions,
          nextReviewAt: r.next_review_at,
          lastReviewedAt: r.last_reviewed_at,
          retentionScore: r.retention_score
        })),
        history: history.rows
      }
    }
  })

  // 鎵ц澶嶄範锛堟洿鏂伴仐蹇樻洸绾匡級
  fastify.post('/memory-review/:scheduleId/review', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['璁板繂澶嶄範'],
      summary: '瀹屾垚璁板繂澶嶄範锛堣瘎浼拌蹇嗕繚鐣欏害锛?,
      body: {
        type: 'object',
        required: ['quality'],
        properties: {
          quality: { type: 'integer', minimum: 0, maximum: 5 }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { scheduleId } = request.params as any
    const { quality } = request.body as any  // 0-5: 0=瀹屽叏蹇樿, 5=瀹岀編璁颁綇

    // SM-2 绠楁硶鐨勭畝鍖栧疄鐜?    const schedule = await fastify.db.query(
      `SELECT ease_factor, interval_days, repetitions FROM memory_review_schedule
       WHERE id = $1 AND user_id = $2`,
      [scheduleId, userId]
    )

    if (schedule.rows.length === 0) {
      return { success: false, error: '澶嶄範璁″垝涓嶅瓨鍦? }
    }

    const r = schedule.rows[0]
    let easeFactor = r.ease_factor
    let intervalDays = r.interval_days
    let repetitions = r.repetitions

    // SM-2 绠楁硶
    easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
    repetitions++

    if (quality < 3) {
      // 閲嶆柊寮€濮?      repetitions = 0
      intervalDays = 1
    } else if (repetitions === 1) {
      intervalDays = 1
    } else if (repetitions === 2) {
      intervalDays = 6
    } else {
      intervalDays = Math.round(intervalDays * easeFactor)
    }

    // 璁＄畻淇濈暀搴?    const retentionScore = quality / 5

    // 涓嬫澶嶄範鏃堕棿
    const nextReview = new Date()
    nextReview.setDate(nextReview.getDate() + intervalDays)

    await fastify.db.query(
      `UPDATE memory_review_schedule SET
         ease_factor = $1, interval_days = $2, repetitions = $3,
         next_review_at = $4, last_reviewed_at = NOW(), retention_score = $5
       WHERE id = $6`,
      [easeFactor, intervalDays, repetitions, nextReview, retentionScore, scheduleId]
    )

    return {
      success: true,
      data: {
        nextReviewAt: nextReview,
        intervalDays,
        repetitions,
        retentionScore,
        tip: quality < 3 ? '闇€瑕佸姞寮鸿蹇嗭紝寤鸿澧炲姞澶嶄範棰戠巼' : '璁板繂淇濇寔鑹ソ'
      }
    }
  })

  // 娣诲姞璁板繂鍒板涔犺鍒?  fastify.post('/memory-review/add', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['璁板繂澶嶄範'],
      summary: '灏嗚蹇嗗姞鍏ュ涔犺鍒?,
      body: {
        type: 'object',
        required: ['memoryType', 'memoryId'],
        properties: {
          memoryType: { type: 'string', enum: ['short_term', 'long_term', 'conversation', 'milestone'] },
          memoryId: { type: 'string' },
          initialInterval: { type: 'integer', default: 1 }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { memoryType, memoryId, initialInterval = 1 } = request.body as any

    const nextReview = new Date()
    nextReview.setDate(nextReview.getDate() + initialInterval)

    await fastify.db.query(
      `INSERT INTO memory_review_schedule 
       (id, user_id, memory_type, memory_id, interval_days, next_review_at)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5)
       ON CONFLICT (user_id, memory_type, memory_id) DO NOTHING`,
      [userId, memoryType, memoryId, initialInterval, nextReview]
    )

    return { success: true, data: { nextReviewAt: nextReview } }
  })
}

export default clawMemoryRoutes
