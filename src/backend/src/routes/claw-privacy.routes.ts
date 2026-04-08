import { FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

const clawPrivacyRoutes: FastifyPluginAsync = async (fastify) => {

  // ========================================
  # 闅愮璁剧疆
  // ========================================

  // 鑾峰彇闅愮浠〃鐩?  fastify.get('/privacy/dashboard', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['闅愮鎺у埗'],
      summary: '鑾峰彇闅愮浠〃鐩?
    }
  }, async (request) => {
    const userId = (request.user as any).userId

    // 鑾峰彇闅愮璁剧疆
    let settings = await fastify.db.query(
      `SELECT * FROM personal_privacy_settings WHERE user_id = $1`,
      [userId]
    )

    if (settings.rows.length === 0) {
      // 鍒涘缓榛樿璁剧疆
      const settingId = uuidv4()
      await fastify.db.query(
        `INSERT INTO personal_privacy_settings (id, user_id) VALUES ($1, $2)`,
        [settingId, userId]
      )
      settings = await fastify.db.query(`SELECT * FROM personal_privacy_settings WHERE user_id = $1`, [userId])
    }

    const s = settings.rows[0]

    // 缁熻鏁版嵁鏀堕泦鎯呭喌
    const dataStats = await fastify.db.query(
      `SELECT 
         (SELECT COUNT(*) FROM user_memories WHERE user_id = $1) as memory_count,
         (SELECT COUNT(*) FROM user_habits WHERE user_id = $1) as habit_count,
         (SELECT COUNT(*) FROM personal_knowledge_nodes WHERE user_id = $1) as knowledge_nodes,
         (SELECT COUNT(*) FROM conversation_memories WHERE user_id = $1) as conversation_count,
         (SELECT COUNT(*) FROM personal_reminders WHERE user_id = $1) as reminder_count,
         (SELECT COUNT(*) FROM personal_contacts WHERE user_id = $1) as contact_count`,
      [userId]
    )

    const ds = dataStats.rows[0]

    // 鏁版嵁淇濈暀鎯呭喌
    const retentionInfo = {
      shortTermMemoryDays: s.memory_retention_days,
      autoForgetDays: s.auto_forget_days,
      isConversationCollectionEnabled: s.collect_ai_conversations,
      isProductivityDataCollectionEnabled: s.collect_productivity_data
    }

    // 鏈€杩戠殑璁块棶璁板綍
    const recentAccess = await fastify.db.query(
      `SELECT access_type, accessor_type, data_categories, created_at
       FROM privacy_access_logs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    )

    // 浼佷笟鏁版嵁鍏变韩鎯呭喌
    const enterpriseSharing = await fastify.db.query(
      `SELECT e.id, e.name, uec.connected_at,
              ps.share_with_enterprise, ps.share_working_style, ps.share_ai_preferences
       FROM user_enterprise_connections uec
       JOIN enterprises e ON e.id = uec.enterprise_id
       LEFT JOIN personal_privacy_settings ps ON ps.user_id = uec.user_id
       WHERE uec.user_id = $1 AND uec.status = 'active'`,
      [userId]
    )

    const privacyScore = calculatePrivacyScore(s)

    return {
      success: true,
      data: {
        privacyScore,
        settings: {
          dataCollection: {
            usageData: s.collect_usage_data,
            habitData: s.collect_habit_data,
            aiConversations: s.collect_ai_conversations,
            productivityData: s.collect_productivity_data
          },
          enterpriseSharing: {
            mode: s.share_with_enterprise,
            workingStyle: s.share_working_style,
            aiPreferences: s.share_ai_preferences,
            productivityStats: s.share_productivity_stats
          },
          retention: {
            shortTermMemoryDays: s.memory_retention_days,
            autoForgetDays: s.auto_forget_days,
            crossEnterpriseSync: s.allow_cross_enterprise_sync,
            dataIsolation: s.enterprise_data_isolation
          },
          lastExportAt: s.last_data_export_at,
          exportCount: s.data_export_count
        },
        dataStats: {
          memories: parseInt(ds.memory_count),
          habits: parseInt(ds.habit_count),
          knowledgeNodes: parseInt(ds.knowledge_nodes),
          conversations: parseInt(ds.conversation_count),
          reminders: parseInt(ds.reminder_count),
          contacts: parseInt(ds.contact_count)
        },
        recentAccess: recentAccess.rows.map((a: any) => ({
          type: a.access_type,
          accessor: a.accessor_type,
          categories: a.data_categories,
          time: a.created_at
        })),
        enterpriseSharing: enterpriseSharing.rows.map((e: any) => ({
          enterpriseId: e.id,
          enterpriseName: e.name,
          connectedAt: e.connected_at,
          sharingMode: e.share_with_enterprise,
          shareWorkingStyle: e.share_working_style,
          shareAiPreferences: e.share_ai_preferences
        })),
        tips: generatePrivacyTips(s, privacyScore)
      }
    }
  })

  // 鏇存柊闅愮璁剧疆
  fastify.patch('/privacy/settings', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['闅愮鎺у埗'],
      summary: '鏇存柊闅愮璁剧疆',
      body: {
        type: 'object',
        properties: {
          collectUsageData: { type: 'boolean' },
          collectHabitData: { type: 'boolean' },
          collectAiConversations: { type: 'boolean' },
          collectProductivityData: { type: 'boolean' },
          shareWithEnterprise: { type: 'string', enum: ['none', 'minimal', 'full'] },
          shareWorkingStyle: { type: 'boolean' },
          shareAiPreferences: { type: 'boolean' },
          shareProductivityStats: { type: 'boolean' },
          memoryRetentionDays: { type: 'integer', minimum: 7, maximum: 365 },
          autoForgetDays: { type: 'integer', minimum: 30, maximum: 3650 },
          allowCrossEnterpriseSync: { type: 'boolean' },
          enterpriseDataIsolation: { type: 'string', enum: ['strict', 'relaxed'] }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const updates = request.body as any

    const fields: string[] = []
    const values: any[] = []
    let i = 1

    const fieldMap: Record<string, string> = {
      collectUsageData: 'collect_usage_data',
      collectHabitData: 'collect_habit_data',
      collectAiConversations: 'collect_ai_conversations',
      collectProductivityData: 'collect_productivity_data',
      shareWithEnterprise: 'share_with_enterprise',
      shareWorkingStyle: 'share_working_style',
      shareAiPreferences: 'share_ai_preferences',
      shareProductivityStats: 'share_productivity_stats',
      memoryRetentionDays: 'memory_retention_days',
      autoForgetDays: 'auto_forget_days',
      allowCrossEnterpriseSync: 'allow_cross_enterprise_sync',
      enterpriseDataIsolation: 'enterprise_data_isolation'
    }

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (updates[key] !== undefined) {
        fields.push(`${dbField} = $${i++}`)
        values.push(updates[key])
      }
    }

    if (fields.length === 0) {
      return { success: false, error: '娌℃湁鏇存柊瀛楁' }
    }

    fields.push('updated_at = NOW()')
    values.push(userId)

    await fastify.db.query(
      `UPDATE personal_privacy_settings SET ${fields.join(', ')} WHERE user_id = $${i}`,
      values
    )

    return { success: true, message: '闅愮璁剧疆宸叉洿鏂? }
  })

  // ========================================
  # 璁块棶鏃ュ織
  // ========================================

  // 鑾峰彇璁块棶鏃ュ織
  fastify.get('/privacy/access-log', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['闅愮鎺у埗'],
      summary: '鑾峰彇闅愮璁块棶鏃ュ織',
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 50 },
          offset: { type: 'integer', default: 0 }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { limit = 50, offset = 0 } = request.query as any

    const logs = await fastify.db.query(
      `SELECT id, access_type, accessor_id, accessor_type, data_categories, 
              access_reason, ip_address, created_at
       FROM privacy_access_logs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    )

    const total = await fastify.db.query(
      `SELECT COUNT(*) FROM privacy_access_logs WHERE user_id = $1`,
      [userId]
    )

    // 缁熻
    const stats = await fastify.db.query(
      `SELECT accessor_type, COUNT(*) as count
       FROM privacy_access_logs WHERE user_id = $1
       GROUP BY accessor_type`,
      [userId]
    )

    return {
      success: true,
      data: {
        logs: logs.rows.map((l: any) => ({
          id: l.id,
          type: l.access_type,
          accessorId: l.accessor_id,
          accessorType: l.accessor_type,
          categories: l.data_categories,
          reason: l.access_reason,
          ipAddress: l.ip_address,
          time: l.created_at
        })),
        stats: stats.rows.reduce((acc: any, s: any) => {
          acc[s.accessor_type || 'unknown'] = parseInt(s.count)
          return acc
        }, {}),
        total: parseInt(total.rows[0].count)
      }
    }
  })

  // 璁板綍璁块棶锛堜緵鍐呴儴鏈嶅姟璋冪敤锛?  fastify.post('/privacy/access-log', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['闅愮鎺у埗'],
      summary: '璁板綍鏁版嵁璁块棶',
      body: {
        type: 'object',
        properties: {
          accessType: { type: 'string' },
          accessorId: { type: 'string' },
          accessorType: { type: 'string' },
          dataCategories: { type: 'array', items: { type: 'string' } },
          accessReason: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { accessType, accessorId, accessorType, dataCategories, accessReason } = request.body as any

    const logId = uuidv4()
    await fastify.db.query(
      `INSERT INTO privacy_access_logs 
       (id, user_id, access_type, accessor_id, accessor_type, data_categories, access_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [logId, userId, accessType, accessorId || null, accessorType || 'user', 
       JSON.stringify(dataCategories || []), accessReason || '']
    )

    return { success: true }
  })

  // ========================================
  # 涓€閿鍑?  // ========================================

  // 璇锋眰鏁版嵁瀵煎嚭
  fastify.post('/privacy/export', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['闅愮鎺у埗'],
      summary: '璇锋眰鏁版嵁瀵煎嚭锛圙DPR鍚堣锛?,
      body: {
        type: 'object',
        properties: {
          dataCategories: { 
            type: 'array', 
            items: { type: 'string' },
            default: ['memories', 'habits', 'knowledge', 'contacts', 'settings', 'productivity']
          },
          format: { type: 'string', enum: ['json', 'zip'], default: 'json' }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { dataCategories = [], format = 'json' } = request.body as any

    // 鑾峰彇鎵€鏈夋暟鎹?    const exportData: Record<string, any> = { exportedAt: new Date().toISOString(), userId }

    if (dataCategories.includes('memories') || dataCategories.length === 0) {
      const memories = await fastify.db.query(
        `SELECT * FROM user_memories WHERE user_id = $1`, [userId]
      )
      exportData.memories = memories.rows
    }

    if (dataCategories.includes('habits') || dataCategories.length === 0) {
      const habits = await fastify.db.query(
        `SELECT * FROM user_habits WHERE user_id = $1`, [userId]
      )
      exportData.habits = habits.rows
    }

    if (dataCategories.includes('knowledge') || dataCategories.length === 0) {
      const nodes = await fastify.db.query(
        `SELECT * FROM personal_knowledge_nodes WHERE user_id = $1`, [userId]
      )
      const edges = await fastify.db.query(
        `SELECT * FROM personal_knowledge_edges WHERE user_id = $1`, [userId]
      )
      exportData.knowledgeGraph = { nodes: nodes.rows, edges: edges.rows }
    }

    if (dataCategories.includes('contacts') || dataCategories.length === 0) {
      const contacts = await fastify.db.query(
        `SELECT * FROM personal_contacts WHERE user_id = $1`, [userId]
      )
      exportData.contacts = contacts.rows
    }

    if (dataCategories.includes('settings') || dataCategories.length === 0) {
      const privacy = await fastify.db.query(
        `SELECT * FROM personal_privacy_settings WHERE user_id = $1`, [userId]
      )
      const aiPrefs = await fastify.db.query(
        `SELECT * FROM ai_conversation_preferences WHERE user_id = $1`, [userId]
      )
      const personality = await fastify.db.query(
        `SELECT * FROM claw_personality WHERE user_id = $1`, [userId]
      )
      exportData.settings = {
        privacy: privacy.rows[0] || null,
        aiConversation: aiPrefs.rows[0] || null,
        personality: personality.rows[0] || null
      }
    }

    if (dataCategories.includes('productivity') || dataCategories.length === 0) {
      const productivity = await fastify.db.query(
        `SELECT * FROM personal_productivity_logs WHERE user_id = $1 ORDER BY log_date`, [userId]
      )
      exportData.productivity = productivity.rows
    }

    if (dataCategories.includes('milestones') || dataCategories.length === 0) {
      const milestones = await fastify.db.query(
        `SELECT * FROM personal_milestones WHERE user_id = $1`, [userId]
      )
      exportData.milestones = milestones.rows
    }

    if (dataCategories.includes('conversation_memories') || dataCategories.length === 0) {
      const convMem = await fastify.db.query(
        `SELECT * FROM conversation_memories WHERE user_id = $1`, [userId]
      )
      exportData.conversationMemories = convMem.rows
    }

    // 鏇存柊瀵煎嚭璁板綍
    await fastify.db.query(
      `UPDATE personal_privacy_settings SET 
         last_data_export_at = NOW(), data_export_count = data_export_count + 1
       WHERE user_id = $1`,
      [userId]
    )

    // 璁板綍瀵煎嚭璁块棶
    await fastify.db.query(
      `INSERT INTO privacy_access_logs (id, user_id, access_type, accessor_type, data_categories)
       VALUES (uuid_generate_v4(), $1, 'export', 'user', $2)`,
      [userId, JSON.stringify(dataCategories.length > 0 ? dataCategories : ['all'])]
    )

    return {
      success: true,
      data: {
        exportData,
        exportedCategories: Object.keys(exportData).filter(k => k !== 'exportedAt' && k !== 'userId'),
        totalRecords: Object.values(exportData).reduce((sum: number, val: any) => 
          sum + (Array.isArray(val) ? val.length : (typeof val === 'object' ? Object.keys(val).length : 0)), 0)
      },
      message: '鏁版嵁瀵煎嚭瀹屾垚'
    }
  })

  // ========================================
  # AI瀵硅瘽鍋忓ソ & Claw浜烘牸
  // ========================================

  // 鑾峰彇AI瀵硅瘽鍋忓ソ
  fastify.get('/ai-preferences', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['AI鍋忓ソ'], summary: '鑾峰彇AI瀵硅瘽鍋忓ソ' }
  }, async (request) => {
    const userId = (request.user as any).userId

    let prefs = await fastify.db.query(
      `SELECT * FROM ai_conversation_preferences WHERE user_id = $1`, [userId]
    )

    if (prefs.rows.length === 0) {
      const id = uuidv4()
      await fastify.db.query(
        `INSERT INTO ai_conversation_preferences (id, user_id) VALUES ($1, $2)`, [id, userId]
      )
      prefs = await fastify.db.query(`SELECT * FROM ai_conversation_preferences WHERE user_id = $1`, [userId])
    }

    const p = prefs.rows[0]
    return {
      success: true,
      data: {
        responseLength: p.response_length,
        tone: p.tone,
        humorLevel: p.humor_level,
        emojiUsage: p.emoji_usage,
        preferredLanguage: p.preferred_language,
        explanationDepth: p.explanation_depth,
        includeSources: p.include_sources,
        askClarifyingQuestions: p.ask_clarifying_questions,
        proactiveSuggestions: p.proactive_suggestions,
        summaryFrequency: p.summary_frequency
      }
    }
  })

  // 鏇存柊AI瀵硅瘽鍋忓ソ
  fastify.patch('/ai-preferences', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['AI鍋忓ソ'],
      summary: '鏇存柊AI瀵硅瘽鍋忓ソ',
      body: {
        type: 'object',
        properties: {
          responseLength: { type: 'string', enum: ['short', 'medium', 'long'] },
          tone: { type: 'string', enum: ['casual', 'professional', 'friendly', 'technical'] },
          humorLevel: { type: 'integer', minimum: 1, maximum: 5 },
          emojiUsage: { type: 'boolean' },
          preferredLanguage: { type: 'string' },
          explanationDepth: { type: 'string', enum: ['brief', 'medium', 'detailed'] },
          includeSources: { type: 'boolean' },
          askClarifyingQuestions: { type: 'boolean' },
          proactiveSuggestions: { type: 'boolean' },
          summaryFrequency: { type: 'string', enum: ['never', 'daily', 'weekly', 'manual'] }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const updates = request.body as any

    const fieldMap: Record<string, string> = {
      responseLength: 'response_length',
      tone: 'tone',
      humorLevel: 'humor_level',
      emojiUsage: 'emoji_usage',
      preferredLanguage: 'preferred_language',
      explanationDepth: 'explanation_depth',
      includeSources: 'include_sources',
      askClarifyingQuestions: 'ask_clarifying_questions',
      proactiveSuggestions: 'proactive_suggestions',
      summaryFrequency: 'summary_frequency'
    }

    const fields: string[] = []
    const values: any[] = []
    let i = 1

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (updates[key] !== undefined) {
        fields.push(`${dbField} = $${i++}`)
        values.push(updates[key])
      }
    }

    if (fields.length === 0) return { success: false, error: '娌℃湁鏇存柊瀛楁' }

    fields.push('updated_at = NOW()')
    values.push(userId)

    await fastify.db.query(
      `UPDATE ai_conversation_preferences SET ${fields.join(', ')} WHERE user_id = $${i}`,
      values
    )

    return { success: true, message: 'AI鍋忓ソ宸叉洿鏂? }
  })

  // 鑾峰彇Claw浜烘牸璁剧疆
  fastify.get('/personality', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['Claw浜烘牸'], summary: '鑾峰彇Claw浜烘牸璁剧疆' }
  }, async (request) => {
    const userId = (request.user as any).userId

    let personality = await fastify.db.query(
      `SELECT * FROM claw_personality WHERE user_id = $1`, [userId]
    )

    if (personality.rows.length === 0) {
      const id = uuidv4()
      await fastify.db.query(
        `INSERT INTO claw_personality (id, user_id) VALUES ($1, $2)`, [id, userId]
      )
      personality = await fastify.db.query(`SELECT * FROM claw_personality WHERE user_id = $1`, [userId])
    }

    const p = personality.rows[0]
    return {
      success: true,
      data: {
        voiceId: p.voice_id,
        voiceSpeed: p.voice_speed,
        voicePitch: p.voice_pitch,
        speakingStyle: p.speaking_style,
        greetingStyle: p.greeting_style,
        useNickname: p.use_nickname,
        nickname: p.nickname,
        pronoun: p.pronoun,
        avatarUrl: p.avatar_url,
        avatarStyle: p.avatar_style
      }
    }
  })

  // 鏇存柊Claw浜烘牸璁剧疆
  fastify.patch('/personality', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Claw浜烘牸'],
      summary: '鏇存柊Claw浜烘牸璁剧疆',
      body: {
        type: 'object',
        properties: {
          voiceId: { type: 'string' },
          voiceSpeed: { type: 'number', minimum: 0.5, maximum: 2.0 },
          voicePitch: { type: 'number', minimum: 0.5, maximum: 2.0 },
          speakingStyle: { type: 'string', enum: ['formal', 'warm', 'playful', 'professional'] },
          greetingStyle: { type: 'string', enum: ['formal', 'casual', 'emoji'] },
          useNickname: { type: 'boolean' },
          nickname: { type: 'string' },
          pronoun: { type: 'string' },
          avatarUrl: { type: 'string' },
          avatarStyle: { type: 'string', enum: ['default', 'minimal', 'detailed', 'abstract'] }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const updates = request.body as any

    const fieldMap: Record<string, string> = {
      voiceId: 'voice_id',
      voiceSpeed: 'voice_speed',
      voicePitch: 'voice_pitch',
      speakingStyle: 'speaking_style',
      greetingStyle: 'greeting_style',
      useNickname: 'use_nickname',
      nickname: 'nickname',
      pronoun: 'pronoun',
      avatarUrl: 'avatar_url',
      avatarStyle: 'avatar_style'
    }

    const fields: string[] = []
    const values: any[] = []
    let i = 1

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (updates[key] !== undefined) {
        fields.push(`${dbField} = $${i++}`)
        values.push(updates[key])
      }
    }

    if (fields.length === 0) return { success: false, error: '娌℃湁鏇存柊瀛楁' }

    fields.push('updated_at = NOW()')
    values.push(userId)

    await fastify.db.query(
      `UPDATE claw_personality SET ${fields.join(', ')} WHERE user_id = $${i}`,
      values
    )

    return { success: true, message: '浜烘牸璁剧疆宸叉洿鏂? }
  })
}

// 杈呭姪鍑芥暟锛氳绠楅殣绉佽瘎鍒?function calculatePrivacyScore(settings: any): number {
  let score = 100

  if (!settings.collect_usage_data) score += 5
  if (!settings.collect_habit_data) score += 5
  if (!settings.collect_ai_conversations) score += 10
  if (!settings.collect_productivity_data) score += 5

  if (settings.share_with_enterprise === 'none') score += 15
  else if (settings.share_with_enterprise === 'minimal') score += 5

  if (!settings.share_productivity_stats) score += 5
  if (!settings.allow_cross_enterprise_sync) score += 5

  if (settings.memory_retention_days <= 30) score += 5
  if (settings.auto_forget_days <= 180) score += 5

  return Math.min(100, Math.max(0, score))
}

// 杈呭姪鍑芥暟锛氱敓鎴愰殣绉佸缓璁?function generatePrivacyTips(settings: any, score: number): string[] {
  const tips: string[] = []

  if (score < 60) {
    tips.push('鎮ㄧ殑闅愮淇濇姢绾у埆杈冧綆锛屽缓璁叧闂笉蹇呰鐨勮嚜鍔ㄦ敹闆嗗姛鑳?)
  }
  if (settings.collect_ai_conversations) {
    tips.push('鈿狅笍 鎮ㄥ紑鍚簡AI瀵硅瘽鏀堕泦锛岃繖鍙兘鍖呭惈鏁忔劅淇℃伅')
  }
  if (settings.share_with_enterprise === 'full') {
    tips.push('鈿狅笍 鎮ㄩ€夋嫨浜嗗畬鏁村叡浜紒涓氭暟鎹紝寤鸿鏀逛负minimal妯″紡')
  }
  if (!settings.allow_cross_enterprise_sync) {
    tips.push('鉁?鎮ㄥ凡绂佺敤璺ㄤ紒涓氬悓姝ワ紝鏁版嵁闅旂淇濇姢鑹ソ')
  }
  if (settings.memory_retention_days > 180) {
    tips.push('馃挕 寤鸿缂╃煭鐭湡璁板繂淇濈暀鏃堕棿锛屾彁鍗囬殣绉佷繚鎶?)
  }

  return tips
}

export default clawPrivacyRoutes
