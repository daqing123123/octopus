import { FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

const connectionCapabilityRoutes: FastifyPluginAsync = async (fastify) => {

  // ========================================
  // 连接即获取企业能力
  // ========================================

  /**
   * 核心API：获取当前连接的企业能力清单
   * 
   * 这是"触手连上大脑 = 立即获得企业能力"的关键接口
   * 
   * 返回用户连接后可以使用的所有能力：
   * 1. AI模型（企业购买的）
   * 2. 知识库（企业文档）
   * 3. 工作流（一键操作）
   * 4. 快捷命令
   */
  fastify.get('/connections/:connectionId/capabilities', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['连接能力'],
      summary: '获取连接的企业能力清单',
      description: '触手连接企业后，立即获取企业能力清单，包括AI模型、知识库、工作流等'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { connectionId } = request.params as any

    // 验证连接归属
    const connection = await fastify.db.query(
      `SELECT c.*, e.name as enterprise_name, e.logo_url as enterprise_logo,
              pc.id as personal_claw_id, pc.name as personal_claw_name,
              ec.id as enterprise_claw_id, ec.name as enterprise_claw_name
       FROM user_enterprise_connections c
       JOIN enterprises e ON c.enterprise_id = e.id
       LEFT JOIN personal_claws pc ON c.personal_claw_id = pc.id
       LEFT JOIN enterprise_claws ec ON c.enterprise_claw_id = ec.id
       WHERE c.id = $1 AND c.user_id = $2 AND c.status = 'active'`,
      [connectionId, userId]
    )

    if (connection.rows.length === 0) {
      return reply.status(404).send({ 
        success: false, 
        error: '连接不存在或已断开' 
      })
    }

    const conn = connection.rows[0]
    const enterpriseId = conn.enterprise_id

    // 并行获取所有能力
    const [
      capabilitiesResult,
      aiModelsResult,
      knowledgeSourcesResult,
      workflowsResult,
      shortcutsResult,
      connectionCapabilitiesResult
    ] = await Promise.all([
      // 企业的能力清单
      fastify.db.query(
        `SELECT * FROM enterprise_capabilities 
         WHERE enterprise_id = $1 AND is_enabled = true
         ORDER BY capability_type, capability_name`,
        [enterpriseId]
      ),
      // 企业AI模型
      fastify.db.query(
        `SELECT id, provider, model_id, model_name, max_tokens, temperature, system_prompt, is_default
         FROM enterprise_ai_models 
         WHERE enterprise_id = $1 AND is_enabled = true
         ORDER BY is_default DESC, model_name`,
        [enterpriseId]
      ),
      // 知识源
      fastify.db.query(
        `SELECT id, source_type, source_name, sync_enabled, last_synced_at, is_active
         FROM enterprise_knowledge_sources
         WHERE enterprise_id = $1 AND is_active = true`,
        [enterpriseId]
      ),
      // 工作流
      fastify.db.query(
        `SELECT id, name, description, category, use_count, is_public
         FROM enterprise_workflows
         WHERE enterprise_id = $1 AND is_active = true AND is_public = true
         ORDER BY use_count DESC, name
         LIMIT 20`,
        [enterpriseId]
      ),
      // 快捷命令
      fastify.db.query(
        `SELECT id, name, description, shortcut_key, icon, color, action_type
         FROM enterprise_shortcuts
         WHERE enterprise_id = $1 AND is_active = true
         ORDER BY sort_order, name
         LIMIT 20`,
        [enterpriseId]
      ),
      // 该连接已获取的能力
      fastify.db.query(
        `SELECT cc.*, ec.capability_type, ec.capability_name, ec.capability_key
         FROM connection_capabilities cc
         JOIN enterprise_capabilities ec ON cc.capability_id = ec.id
         WHERE cc.connection_id = $1 AND cc.is_active = true`,
        [connectionId]
      )
    ])

    // 构建能力清单
    const capabilityList = {
      connection: {
        id: connectionId,
        enterpriseName: conn.enterprise_name,
        enterpriseLogo: conn.enterprise_logo,
        personalClawName: conn.personal_claw_name,
        enterpriseClawName: conn.enterprise_claw_name,
        connectedAt: conn.connected_at
      },
      
      // AI模型（触手可以使用企业购买的模型）
      aiModels: {
        title: 'AI模型',
        description: '触手可使用企业购买的AI模型',
        items: aiModelsResult.rows.map(m => ({
          id: m.id,
          provider: m.provider,
          modelId: m.model_id,
          modelName: m.model_name || m.model_id,
          isDefault: m.is_default,
          features: {
            maxTokens: m.max_tokens,
            temperature: m.temperature,
            hasSystemPrompt: !!m.system_prompt
          }
        })),
        count: aiModelsResult.rows.length
      },
      
      // 知识库（触手可以搜索企业知识）
      knowledgeBases: {
        title: '企业知识库',
        description: '触手可以搜索企业文档和资料',
        items: knowledgeSourcesResult.rows.map(k => ({
          id: k.id,
          sourceType: k.source_type,
          sourceName: k.source_name,
          lastSynced: k.last_synced_at,
          status: k.sync_enabled ? 'synced' : 'manual'
        })),
        count: knowledgeSourcesResult.rows.length
      },
      
      // 工作流（触手可以使用企业工作流）
      workflows: {
        title: '企业工作流',
        description: '触手可以使用企业预设的工作流',
        items: workflowsResult.rows.map(w => ({
          id: w.id,
          name: w.name,
          description: w.description,
          category: w.category,
          usageCount: w.use_count
        })),
        count: workflowsResult.rows.length
      },
      
      // 快捷命令
      shortcuts: {
        title: '快捷命令',
        description: '触手可用的快捷命令',
        items: shortcutsResult.rows.map(s => ({
          id: s.id,
          name: s.name,
          command: s.shortcut_key,
          description: s.description,
          icon: s.icon,
          color: s.color
        })),
        count: shortcutsResult.rows.length
      },
      
      // 已获取的能力
      grantedCapabilities: {
        title: '已获取能力',
        description: '连接时自动获取的能力',
        items: connectionCapabilitiesResult.rows.map(c => ({
          capabilityType: c.capability_type,
          capabilityName: c.capability_name,
          grantedAt: c.granted_at,
          useCount: c.use_count
        })),
        count: connectionCapabilitiesResult.rows.length
      },
      
      // 统计摘要
      summary: {
        totalCapabilities: capabilitiesResult.rows.length,
        aiModelsCount: aiModelsResult.rows.length,
        knowledgeSourcesCount: knowledgeSourcesResult.rows.length,
        workflowsCount: workflowsResult.rows.length,
        shortcutsCount: shortcutsResult.rows.length,
        grantedCount: connectionCapabilitiesResult.rows.length
      }
    }

    return {
      success: true,
      data: capabilityList,
      message: `连接"${conn.enterprise_name}"后，触手"${conn.personal_claw_name}"获得了${capabilityList.summary.totalCapabilities}项企业能力`
    }
  })

  // ========================================
  // 连接时一键获取所有能力
  // ========================================
  fastify.post('/connections/:connectionId/capabilities/grant-all', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['连接能力'],
      summary: '连接时一键获取所有企业能力',
      description: '新连接或重新连接时，自动获取所有可用的企业能力'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { connectionId } = request.params as any

    // 验证连接
    const connection = await fastify.db.query(
      `SELECT c.*, e.name as enterprise_name
       FROM user_enterprise_connections c
       JOIN enterprises e ON c.enterprise_id = e.id
       WHERE c.id = $1 AND c.user_id = $2 AND c.status = 'active'`,
      [connectionId, userId]
    )

    if (connection.rows.length === 0) {
      return reply.status(404).send({ error: '连接不存在' })
    }

    const conn = connection.rows[0]

    // 获取所有启用的能力
    const capabilities = await fastify.db.query(
      `SELECT id, capability_type, capability_name, capability_key
       FROM enterprise_capabilities
       WHERE enterprise_id = $1 AND is_enabled = true`,
      [conn.enterprise_id]
    )

    let grantedCount = 0
    const grantedCapabilities = []

    for (const cap of capabilities.rows) {
      // 检查是否已获取
      const existing = await fastify.db.query(
        `SELECT id FROM connection_capabilities 
         WHERE connection_id = $1 AND capability_id = $2`,
        [connectionId, cap.id]
      )

      if (existing.rows.length === 0) {
        // 创建获取记录
        await fastify.db.query(
          `INSERT INTO connection_capabilities (id, connection_id, capability_id)
           VALUES ($1, $2, $3)`,
          [uuidv4(), connectionId, cap.id]
        )
        grantedCount++
        grantedCapabilities.push(cap.capability_name)
      }

      // 记录事件
      await fastify.db.query(
        `INSERT INTO connection_capability_events 
         (id, connection_id, capability_id, event_type, event_data)
         VALUES ($1, $2, $3, 'granted', $4)`,
        [uuidv4(), connectionId, cap.id, JSON.stringify({ source: 'grant_all' })]
      )
    }

    return {
      success: true,
      message: `触手已获取${grantedCount}项企业能力`,
      data: {
        enterpriseName: conn.enterprise_name,
        capabilitiesGranted: grantedCapabilities,
        totalGranted: grantedCount,
        nextSteps: [
          '尝试说"/help"查看触手可用命令',
          '尝试说"/知识 [问题]"搜索企业知识',
          '尝试说"/工作流"查看可用工作流'
        ]
      }
    }
  })

  // ========================================
  // 使用企业AI模型
  // ========================================
  fastify.post('/connections/:connectionId/ai/chat', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['连接AI'],
      summary: '使用企业AI模型',
      body: {
        type: 'object',
        required: ['message'],
        properties: {
          message: { type: 'string' },
          modelId: { type: 'string' },  // 可选，使用企业默认模型
          systemPrompt: { type: 'string' },
          temperature: { type: 'number' },
          stream: { type: 'boolean', default: false }
        }
      }
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { connectionId } = request.params as any
    const { message, modelId, systemPrompt, temperature, stream = false } = request.body as any

    // 验证连接
    const connection = await fastify.db.query(
      `SELECT c.*, e.name as enterprise_name
       FROM user_enterprise_connections c
       JOIN enterprises e ON c.enterprise_id = e.id
       WHERE c.id = $1 AND c.user_id = $2 AND c.status = 'active'`,
      [connectionId, userId]
    )

    if (connection.rows.length === 0) {
      return reply.status(403).send({ error: '未连接到该企业' })
    }

    // 获取AI模型
    let modelQuery = `SELECT * FROM enterprise_ai_models WHERE enterprise_id = $1 AND is_enabled = true`
    const params: any[] = [connection.rows[0].enterprise_id]

    if (modelId) {
      modelQuery += ` AND id = $2`
      params.push(modelId)
    } else {
      modelQuery += ` AND is_default = true`
    }

    const modelResult = await fastify.db.query(modelQuery, params)

    if (modelResult.rows.length === 0) {
      return reply.status(400).send({ 
        error: '企业未配置AI模型，或指定的模型不可用' 
      })
    }

    const model = modelResult.rows[0]

    // 检查配额
    if (model.monthly_limit && model.monthly_used >= model.monthly_limit) {
      return reply.status(429).send({ 
        error: '企业AI模型月配额已用完',
        resetDay: model.reset_day
      })
    }

    // 更新使用统计
    await fastify.db.query(
      `UPDATE enterprise_ai_models SET monthly_used = monthly_used + 1 WHERE id = $1`,
      [model.id]
    )

    // 记录连接能力使用
    await fastify.db.query(
      `INSERT INTO connection_capability_events 
       (id, connection_id, event_type, event_data)
       VALUES ($1, $2, 'used', $3)`,
      [uuidv4(), connectionId, JSON.stringify({ 
        capability_type: 'ai_model', 
        model_id: model.model_id,
        message_length: message.length
      })]
    )

    // 这里实际调用AI模型（省略具体实现）
    // 在生产环境中，需要调用实际的AI API

    return {
      success: true,
      data: {
        model: {
          provider: model.provider,
          modelId: model.model_id,
          modelName: model.model_name
        },
        message: 'AI模型调用成功（模拟响应）',
        response: `[${model.model_name}] 这是一条来自企业AI模型的响应。企业名称: ${connection.rows[0].enterprise_name}。这里可以接入实际的AI API。`,
        usage: {
          promptTokens: Math.ceil(message.length / 4),
          completionTokens: 50,
          totalTokens: Math.ceil(message.length / 4) + 50
        }
      }
    }
  })

  // ========================================
  // 搜索企业知识库
  // ========================================
  fastify.post('/connections/:connectionId/knowledge/search', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['连接知识库'],
      summary: '搜索企业知识库',
      body: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string' },
          sources: { type: 'array', items: { type: 'string' } },  // 可选，指定来源
          limit: { type: 'integer', default: 10 }
        }
      }
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { connectionId } = request.params as any
    const { query, sources, limit = 10 } = request.body as any

    // 验证连接
    const connection = await fastify.db.query(
      `SELECT c.*, e.name as enterprise_name
       FROM user_enterprise_connections c
       JOIN enterprises e ON c.enterprise_id = e.id
       WHERE c.id = $1 AND c.user_id = $2 AND c.status = 'active'`,
      [connectionId, userId]
    )

    if (connection.rows.length === 0) {
      return reply.status(403).send({ error: '未连接到该企业' })
    }

    // 获取知识源
    let sourceQuery = `SELECT * FROM enterprise_knowledge_sources WHERE enterprise_id = $1 AND is_active = true`
    const sourceParams: any[] = [connection.rows[0].enterprise_id]

    if (sources && sources.length > 0) {
      sourceQuery += ` AND source_type = ANY($2)`
      sourceParams.push(sources)
    }

    const sourcesResult = await fastify.db.query(sourceQuery, sourceParams)

    // 记录使用
    await fastify.db.query(
      `INSERT INTO connection_capability_events 
       (id, connection_id, event_type, event_data)
       VALUES ($1, $2, 'used', $3)`,
      [uuidv4(), connectionId, JSON.stringify({ 
        capability_type: 'knowledge_base', 
        query,
        sourcesCount: sourcesResult.rows.length
      })]
    )

    // 模拟搜索结果（实际需要接入向量数据库或搜索引擎）
    return {
      success: true,
      data: {
        query,
        sources: sourcesResult.rows.map(s => ({
          id: s.id,
          sourceType: s.source_type,
          sourceName: s.source_name,
          lastSynced: s.last_synced_at
        })),
        results: [
          // 实际实现中，这里应该返回真实的搜索结果
          {
            title: '企业知识文档（示例）',
            snippet: `关于"${query}"的相关内容...`,
            source: 'company_wiki',
            relevance: 0.95
          }
        ],
        totalResults: 1,
        message: `从${sourcesResult.rows.length}个知识源中搜索到相关结果`
      }
    }
  })

  // ========================================
  // 执行企业工作流
  // ========================================
  fastify.post('/connections/:connectionId/workflows/:workflowId/execute', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['连接工作流'],
      summary: '执行企业工作流',
      body: {
        type: 'object',
        properties: {
          inputs: { type: 'object' }  // 工作流输入参数
        }
      }
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { connectionId, workflowId } = request.params as any
    const { inputs = {} } = request.body as any

    // 验证连接
    const connection = await fastify.db.query(
      `SELECT c.*, e.name as enterprise_name
       FROM user_enterprise_connections c
       JOIN enterprises e ON c.enterprise_id = e.id
       WHERE c.id = $1 AND c.user_id = $2 AND c.status = 'active'`,
      [connectionId, userId]
    )

    if (connection.rows.length === 0) {
      return reply.status(403).send({ error: '未连接到该企业' })
    }

    // 获取工作流
    const workflow = await fastify.db.query(
      `SELECT * FROM enterprise_workflows 
       WHERE id = $1 AND enterprise_id = $2 AND is_active = true`,
      [workflowId, connection.rows[0].enterprise_id]
    )

    if (workflow.rows.length === 0) {
      return reply.status(404).send({ error: '工作流不存在' })
    }

    const wf = workflow.rows[0]

    // 更新使用统计
    await fastify.db.query(
      `UPDATE enterprise_workflows SET use_count = use_count + 1 WHERE id = $1`,
      [workflowId]
    )

    // 记录使用
    await fastify.db.query(
      `INSERT INTO connection_capability_events 
       (id, connection_id, event_type, event_data)
       VALUES ($1, $2, 'used', $3)`,
      [uuidv4(), connectionId, JSON.stringify({ 
        capability_type: 'workflow', 
        workflow_id: workflowId,
        workflow_name: wf.name
      })]
    )

    // 执行工作流（实际实现需要解析 workflow_def 并执行）
    return {
      success: true,
      data: {
        workflowId,
        workflowName: wf.name,
        status: 'completed',
        outputs: {
          result: '工作流执行成功（示例）',
          executedAt: new Date().toISOString()
        },
        message: `工作流"${wf.name}"执行完成`
      }
    }
  })

  // ========================================
  // 获取连接能力使用统计
  // ========================================
  fastify.get('/connections/:connectionId/capabilities/usage', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['连接能力'],
      summary: '获取能力使用统计'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { connectionId } = request.params as any

    // 验证连接
    const connection = await fastify.db.query(
      `SELECT c.* FROM user_enterprise_connections c
       WHERE c.id = $1 AND c.user_id = $2 AND c.status = 'active'`,
      [connectionId, userId]
    )

    if (connection.rows.length === 0) {
      return reply.status(403).send({ error: '未连接到该企业' })
    }

    // 获取使用统计
    const usageStats = await fastify.db.query(
      `SELECT 
         event_type,
         COUNT(*) as count,
         MAX(created_at) as last_used
       FROM connection_capability_events
       WHERE connection_id = $1
       GROUP BY event_type`,
      [connectionId]
    )

    // 获取最近使用记录
    const recentUsage = await fastify.db.query(
      `SELECT * FROM connection_capability_events
       WHERE connection_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [connectionId]
    )

    return {
      success: true,
      data: {
        summary: usageStats.rows.map(s => ({
          eventType: s.event_type,
          count: parseInt(s.count),
          lastUsed: s.last_used
        })),
        recentUsage: recentUsage.rows.map(r => ({
          eventType: r.event_type,
          eventData: r.event_data,
          createdAt: r.created_at
        })),
        totalEvents: usageStats.rows.reduce((acc, s) => acc + parseInt(s.count), 0)
      }
    }
  })
}

export default connectionCapabilityRoutes
