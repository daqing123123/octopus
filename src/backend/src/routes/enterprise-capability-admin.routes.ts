import { FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

const enterpriseCapabilityAdminRoutes: FastifyPluginAsync = async (fastify) => {

  // ========================================
  // 管理员：管理企业AI模型
  // ========================================

  // 获取企业AI模型列表
  fastify.get('/:enterpriseId/ai-models', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业AI模型管理'],
      summary: '获取企业AI模型列表'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any

    // 检查管理员权限
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0 || !['owner', 'admin'].includes(member.rows[0].role)) {
      return reply.status(403).send({ error: '无权管理企业AI模型' })
    }

    const result = await fastify.db.query(
      `SELECT id, provider, model_id, model_name, api_endpoint, max_tokens, 
              temperature, system_prompt, monthly_limit, monthly_used, 
              is_enabled, is_default, created_at
       FROM enterprise_ai_models
       WHERE enterprise_id = $1
       ORDER BY is_default DESC, created_at DESC`,
      [enterpriseId]
    )

    // 解密API密钥（只返回是否已配置）
    const models = result.rows.map(m => ({
      ...m,
      hasApiKey: !!m.api_key_encrypted,
      api_key_encrypted: undefined  // 不返回加密的密钥
    }))

    return {
      success: true,
      data: models
    }
  })

  // 添加AI模型
  fastify.post('/:enterpriseId/ai-models', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业AI模型管理'],
      summary: '添加企业AI模型',
      body: {
        type: 'object',
        required: ['provider', 'modelId', 'modelName'],
        properties: {
          provider: { type: 'string' },
          modelId: { type: 'string' },
          modelName: { type: 'string' },
          apiEndpoint: { type: 'string' },
          apiKey: { type: 'string' },
          maxTokens: { type: 'integer' },
          temperature: { type: 'number' },
          systemPrompt: { type: 'string' },
          monthlyLimit: { type: 'integer' },
          isDefault: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any
    const {
      provider, modelId, modelName, apiEndpoint, apiKey,
      maxTokens, temperature, systemPrompt, monthlyLimit, isDefault
    } = request.body as any

    // 检查管理员权限
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0 || !['owner', 'admin'].includes(member.rows[0].role)) {
      return reply.status(403).send({ error: '无权管理企业AI模型' })
    }

    // 如果设为默认，先取消其他默认
    if (isDefault) {
      await fastify.db.query(
        `UPDATE enterprise_ai_models SET is_default = false WHERE enterprise_id = $1`,
        [enterpriseId]
      )
    }

    // 加密API密钥
    const encryptedApiKey = apiKey ? Buffer.from(apiKey).toString('base64') : null

    const modelId_ = uuidv4()
    await fastify.db.query(
      `INSERT INTO enterprise_ai_models 
       (id, enterprise_id, provider, model_id, model_name, api_endpoint, api_key_encrypted,
        max_tokens, temperature, system_prompt, monthly_limit, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [modelId_, enterpriseId, provider, modelId, modelName, apiEndpoint || null,
       encryptedApiKey, maxTokens || 4096, temperature || 0.7, systemPrompt || null,
       monthlyLimit || null, isDefault || false]
    )

    return {
      success: true,
      message: `AI模型"${modelName}"添加成功`,
      data: { id: modelId_ }
    }
  })

  // 更新AI模型
  fastify.patch('/:enterpriseId/ai-models/:modelId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业AI模型管理'],
      summary: '更新企业AI模型'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { enterpriseId, modelId } = request.params as any
    const updates = request.body as any

    // 检查管理员权限
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0 || !['owner', 'admin'].includes(member.rows[0].role)) {
      return reply.status(403).send({ error: '无权管理企业AI模型' })
    }

    // 如果设为默认，先取消其他默认
    if (updates.isDefault) {
      await fastify.db.query(
        `UPDATE enterprise_ai_models SET is_default = false WHERE enterprise_id = $1`,
        [enterpriseId]
      )
    }

    // 构建更新语句
    const fields: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (updates.modelName !== undefined) {
      fields.push(`model_name = $${paramIndex++}`)
      values.push(updates.modelName)
    }
    if (updates.apiEndpoint !== undefined) {
      fields.push(`api_endpoint = $${paramIndex++}`)
      values.push(updates.apiEndpoint)
    }
    if (updates.apiKey !== undefined) {
      fields.push(`api_key_encrypted = $${paramIndex++}`)
      values.push(updates.apiKey ? Buffer.from(updates.apiKey).toString('base64') : null)
    }
    if (updates.maxTokens !== undefined) {
      fields.push(`max_tokens = $${paramIndex++}`)
      values.push(updates.maxTokens)
    }
    if (updates.temperature !== undefined) {
      fields.push(`temperature = $${paramIndex++}`)
      values.push(updates.temperature)
    }
    if (updates.systemPrompt !== undefined) {
      fields.push(`system_prompt = $${paramIndex++}`)
      values.push(updates.systemPrompt)
    }
    if (updates.monthlyLimit !== undefined) {
      fields.push(`monthly_limit = $${paramIndex++}`)
      values.push(updates.monthlyLimit)
    }
    if (updates.isDefault !== undefined) {
      fields.push(`is_default = $${paramIndex++}`)
      values.push(updates.isDefault)
    }
    if (updates.isEnabled !== undefined) {
      fields.push(`is_enabled = $${paramIndex++}`)
      values.push(updates.isEnabled)
    }

    if (fields.length > 0) {
      fields.push(`updated_at = NOW()`)
      values.push(modelId, enterpriseId)

      await fastify.db.query(
        `UPDATE enterprise_ai_models SET ${fields.join(', ')} 
         WHERE id = $${paramIndex++} AND enterprise_id = $${paramIndex}`,
        values
      )
    }

    return { success: true, message: 'AI模型已更新' }
  })

  // 删除AI模型
  fastify.delete('/:enterpriseId/ai-models/:modelId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业AI模型管理'],
      summary: '删除企业AI模型'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { enterpriseId, modelId } = request.params as any

    // 检查管理员权限
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0 || !['owner', 'admin'].includes(member.rows[0].role)) {
      return reply.status(403).send({ error: '无权管理企业AI模型' })
    }

    await fastify.db.query(
      `DELETE FROM enterprise_ai_models WHERE id = $1 AND enterprise_id = $2`,
      [modelId, enterpriseId]
    )

    return { success: true, message: 'AI模型已删除' }
  })

  // ========================================
  // 管理员：管理企业工作流
  // ========================================

  // 获取企业工作流列表
  fastify.get('/:enterpriseId/workflows', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业工作流管理'],
      summary: '获取企业工作流列表'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any

    // 检查成员身份
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0) {
      return reply.status(403).send({ error: '无权访问' })
    }

    const result = await fastify.db.query(
      `SELECT id, name, description, category, workflow_def, 
              roles_allowed, use_count, is_active, is_public,
              created_at
       FROM enterprise_workflows
       WHERE enterprise_id = $1
       ORDER BY use_count DESC, created_at DESC`,
      [enterpriseId]
    )

    return { success: true, data: result.rows }
  })

  // 添加工作流
  fastify.post('/:enterpriseId/workflows', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业工作流管理'],
      summary: '添加企业工作流'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any
    const { name, description, category, workflowDef, rolesAllowed, isPublic } = request.body as any

    // 检查管理员权限
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0 || !['owner', 'admin'].includes(member.rows[0].role)) {
      return reply.status(403).send({ error: '无权管理企业工作流' })
    }

    const workflowId = uuidv4()
    await fastify.db.query(
      `INSERT INTO enterprise_workflows 
       (id, enterprise_id, name, description, category, workflow_def, roles_allowed, is_public, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [workflowId, enterpriseId, name, description || null, category || 'general',
       JSON.stringify(workflowDef || {}), rolesAllowed || null, isPublic !== false, userId]
    )

    return {
      success: true,
      message: `工作流"${name}"添加成功`,
      data: { id: workflowId }
    }
  })

  // 更新工作流
  fastify.patch('/:enterpriseId/workflows/:workflowId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业工作流管理'],
      summary: '更新企业工作流'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { enterpriseId, workflowId } = request.params as any
    const updates = request.body as any

    // 检查管理员权限
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0 || !['owner', 'admin'].includes(member.rows[0].role)) {
      return reply.status(403).send({ error: '无权管理企业工作流' })
    }

    const fields: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`)
      values.push(updates.name)
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`)
      values.push(updates.description)
    }
    if (updates.category !== undefined) {
      fields.push(`category = $${paramIndex++}`)
      values.push(updates.category)
    }
    if (updates.workflowDef !== undefined) {
      fields.push(`workflow_def = $${paramIndex++}`)
      values.push(JSON.stringify(updates.workflowDef))
    }
    if (updates.isPublic !== undefined) {
      fields.push(`is_public = $${paramIndex++}`)
      values.push(updates.isPublic)
    }
    if (updates.isActive !== undefined) {
      fields.push(`is_active = $${paramIndex++}`)
      values.push(updates.isActive)
    }

    if (fields.length > 0) {
      fields.push(`updated_at = NOW()`)
      values.push(workflowId, enterpriseId)

      await fastify.db.query(
        `UPDATE enterprise_workflows SET ${fields.join(', ')} 
         WHERE id = $${paramIndex++} AND enterprise_id = $${paramIndex}`,
        values
      )
    }

    return { success: true, message: '工作流已更新' }
  })

  // 删除工作流
  fastify.delete('/:enterpriseId/workflows/:workflowId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业工作流管理'],
      summary: '删除企业工作流'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { enterpriseId, workflowId } = request.params as any

    // 检查管理员权限
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0 || !['owner', 'admin'].includes(member.rows[0].role)) {
      return reply.status(403).send({ error: '无权管理企业工作流' })
    }

    await fastify.db.query(
      `DELETE FROM enterprise_workflows WHERE id = $1 AND enterprise_id = $2`,
      [workflowId, enterpriseId]
    )

    return { success: true, message: '工作流已删除' }
  })

  // ========================================
  // 管理员：管理快捷命令
  // ========================================

  // 获取快捷命令列表
  fastify.get('/:enterpriseId/shortcuts', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业快捷命令管理'],
      summary: '获取企业快捷命令列表'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any

    // 检查成员身份
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0) {
      return reply.status(403).send({ error: '无权访问' })
    }

    const result = await fastify.db.query(
      `SELECT id, name, description, shortcut_key, action_type, action_config,
              icon, color, sort_order, is_active
       FROM enterprise_shortcuts
       WHERE enterprise_id = $1
       ORDER BY sort_order, name`,
      [enterpriseId]
    )

    return { success: true, data: result.rows }
  })

  // 添加快捷命令
  fastify.post('/:enterpriseId/shortcuts', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业快捷命令管理'],
      summary: '添加快捷命令'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any
    const { name, description, shortcutKey, actionType, actionConfig, icon, color } = request.body as any

    // 检查管理员权限
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0 || !['owner', 'admin'].includes(member.rows[0].role)) {
      return reply.status(403).send({ error: '无权管理快捷命令' })
    }

    // 检查命令是否已存在
    const existing = await fastify.db.query(
      `SELECT id FROM enterprise_shortcuts 
       WHERE enterprise_id = $1 AND shortcut_key = $2`,
      [enterpriseId, shortcutKey]
    )

    if (existing.rows.length > 0) {
      return reply.status(400).send({ error: '该命令已存在' })
    }

    const shortcutId = uuidv4()
    await fastify.db.query(
      `INSERT INTO enterprise_shortcuts 
       (id, enterprise_id, name, description, shortcut_key, action_type, action_config, icon, color)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [shortcutId, enterpriseId, name, description || null, shortcutKey,
       actionType || 'workflow', JSON.stringify(actionConfig || {}), icon || '⚡', color || '#6366f1']
    )

    return {
      success: true,
      message: `快捷命令"${name}"添加成功`,
      data: { id: shortcutId }
    }
  })

  // 更新快捷命令
  fastify.patch('/:enterpriseId/shortcuts/:shortcutId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业快捷命令管理'],
      summary: '更新快捷命令'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { enterpriseId, shortcutId } = request.params as any
    const updates = request.body as any

    // 检查管理员权限
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0 || !['owner', 'admin'].includes(member.rows[0].role)) {
      return reply.status(403).send({ error: '无权管理快捷命令' })
    }

    const fields: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`)
      values.push(updates.name)
    }
    if (updates.shortcutKey !== undefined) {
      fields.push(`shortcut_key = $${paramIndex++}`)
      values.push(updates.shortcutKey)
    }
    if (updates.actionType !== undefined) {
      fields.push(`action_type = $${paramIndex++}`)
      values.push(updates.actionType)
    }
    if (updates.actionConfig !== undefined) {
      fields.push(`action_config = $${paramIndex++}`)
      values.push(JSON.stringify(updates.actionConfig))
    }
    if (updates.icon !== undefined) {
      fields.push(`icon = $${paramIndex++}`)
      values.push(updates.icon)
    }
    if (updates.color !== undefined) {
      fields.push(`color = $${paramIndex++}`)
      values.push(updates.color)
    }
    if (updates.sortOrder !== undefined) {
      fields.push(`sort_order = $${paramIndex++}`)
      values.push(updates.sortOrder)
    }
    if (updates.isActive !== undefined) {
      fields.push(`is_active = $${paramIndex++}`)
      values.push(updates.isActive)
    }

    if (fields.length > 0) {
      values.push(shortcutId, enterpriseId)

      await fastify.db.query(
        `UPDATE enterprise_shortcuts SET ${fields.join(', ')} 
         WHERE id = $${paramIndex++} AND enterprise_id = $${paramIndex}`,
        values
      )
    }

    return { success: true, message: '快捷命令已更新' }
  })

  // 删除快捷命令
  fastify.delete('/:enterpriseId/shortcuts/:shortcutId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业快捷命令管理'],
      summary: '删除快捷命令'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { enterpriseId, shortcutId } = request.params as any

    // 检查管理员权限
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0 || !['owner', 'admin'].includes(member.rows[0].role)) {
      return reply.status(403).send({ error: '无权管理快捷命令' })
    }

    await fastify.db.query(
      `DELETE FROM enterprise_shortcuts WHERE id = $1 AND enterprise_id = $2`,
      [shortcutId, enterpriseId]
    )

    return { success: true, message: '快捷命令已删除' }
  })

  // ========================================
  // 管理员：管理知识源
  // ========================================

  // 获取知识源列表
  fastify.get('/:enterpriseId/knowledge-sources', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业知识源管理'],
      summary: '获取企业知识源列表'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any

    // 检查成员身份
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0) {
      return reply.status(403).send({ error: '无权访问' })
    }

    const result = await fastify.db.query(
      `SELECT id, source_type, source_name, config, sync_enabled, 
              sync_frequency, last_synced_at, is_active, created_at
       FROM enterprise_knowledge_sources
       WHERE enterprise_id = $1
       ORDER BY created_at DESC`,
      [enterpriseId]
    )

    // 不返回敏感配置
    const sources = result.rows.map(s => ({
      ...s,
      config: { hasConfig: Object.keys(s.config || {}).length > 0 }
    }))

    return { success: true, data: sources }
  })

  // 添加知识源
  fastify.post('/:enterpriseId/knowledge-sources', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业知识源管理'],
      summary: '添加知识源'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any
    const { sourceType, sourceName, config, syncEnabled, syncFrequency } = request.body as any

    // 检查管理员权限
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0 || !['owner', 'admin'].includes(member.rows[0].role)) {
      return reply.status(403).send({ error: '无权管理知识源' })
    }

    const sourceId = uuidv4()
    await fastify.db.query(
      `INSERT INTO enterprise_knowledge_sources 
       (id, enterprise_id, source_type, source_name, config, sync_enabled, sync_frequency)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [sourceId, enterpriseId, sourceType, sourceName, JSON.stringify(config || {}),
       syncEnabled !== false, syncFrequency || 'daily']
    )

    return {
      success: true,
      message: `知识源"${sourceName}"添加成功`,
      data: { id: sourceId }
    }
  })

  // 同步知识源
  fastify.post('/:enterpriseId/knowledge-sources/:sourceId/sync', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['企业知识源管理'],
      summary: '手动同步知识源'
    }
  }, async (request, reply) => {
    const userId = (request.user as any).userId
    const { enterpriseId, sourceId } = request.params as any

    // 检查管理员权限
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0 || !['owner', 'admin'].includes(member.rows[0].role)) {
      return reply.status(403).send({ error: '无权管理知识源' })
    }

    // 获取知识源
    const source = await fastify.db.query(
      `SELECT * FROM enterprise_knowledge_sources 
       WHERE id = $1 AND enterprise_id = $2`,
      [sourceId, enterpriseId]
    )

    if (source.rows.length === 0) {
      return reply.status(404).send({ error: '知识源不存在' })
    }

    // 实际同步逻辑（这里只是示例）
    // 在生产环境中，需要调用实际的同步逻辑

    await fastify.db.query(
      `UPDATE enterprise_knowledge_sources SET last_synced_at = NOW() WHERE id = $1`,
      [sourceId]
    )

    return {
      success: true,
      message: '知识源同步完成',
      data: { syncedAt: new Date().toISOString() }
    }
  })
}

export default enterpriseCapabilityAdminRoutes
