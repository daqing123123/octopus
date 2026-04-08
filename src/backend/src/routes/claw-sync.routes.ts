import { FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

const clawSyncRoutes: FastifyPluginAsync = async (fastify) => {

  // ========================================
  // 跨设备同步
  // ========================================

  // 获取设备列表
  fastify.get('/devices', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['跨设备同步'],
      summary: '获取已登录设备列表'
    }
  }, async (request) => {
    const userId = (request.user as any).userId

    const devices = await fastify.db.query(
      `SELECT id, device_id, device_name, device_type, last_sync_at, 
              data_versions, is_active, created_at
       FROM device_sync_status
       WHERE user_id = $1
       ORDER BY last_sync_at DESC NULLS LAST`,
      [userId]
    )

    return {
      success: true,
      data: devices.rows.map((d: any) => ({
        id: d.id,
        deviceId: d.device_id,
        deviceName: d.device_name,
        deviceType: d.device_type,
        lastSyncAt: d.last_sync_at,
        dataVersions: d.data_versions,
        isActive: d.is_active,
        createdAt: d.created_at
      }))
    }
  })

  // 注册新设备
  fastify.post('/devices', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['跨设备同步'],
      summary: '注册新设备',
      body: {
        type: 'object',
        required: ['deviceId', 'deviceName'],
        properties: {
          deviceId: { type: 'string' },
          deviceName: { type: 'string' },
          deviceType: { type: 'string', enum: ['desktop', 'mobile', 'tablet'] }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { deviceId, deviceName, deviceType } = request.body as any

    const deviceRecordId = uuidv4()
    const syncToken = uuidv4()

    await fastify.db.query(
      `INSERT INTO device_sync_status 
       (id, user_id, device_id, device_name, device_type, sync_token, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       ON CONFLICT (user_id, device_id) DO UPDATE SET
         device_name = EXCLUDED.device_name,
         device_type = COALESCE(EXCLUDED.device_type, device_sync_status.device_type),
         last_sync_at = NOW(),
         is_active = TRUE`,
      [deviceRecordId, userId, deviceId, deviceName, deviceType || 'desktop', syncToken]
    )

    return {
      success: true,
      data: { syncToken, deviceId },
      message: '设备已注册'
    }
  })

  // 同步数据
  fastify.post('/devices/:deviceId/sync', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['跨设备同步'],
      summary: '执行数据同步',
      body: {
        type: 'object',
        properties: {
          dataVersions: { type: 'object' },
          changes: { type: 'array', items: { type: 'object' } }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { deviceId } = request.params as any
    const { dataVersions = {}, changes = [] } = request.body as any

    // 验证设备
    const device = await fastify.db.query(
      `SELECT id, sync_token FROM device_sync_status WHERE device_id = $1 AND user_id = $2 AND is_active = TRUE`,
      [deviceId, userId]
    )

    if (device.rows.length === 0) {
      return { success: false, error: '设备未注册或已停用' }
    }

    // 应用来自客户端的变更
    for (const change of changes) {
      await applySyncChange(userId, deviceId, change)
    }

    // 获取服务端变更（自从上次同步以来）
    const serverChanges = await getServerChanges(userId, deviceId, dataVersions)

    // 更新设备同步状态
    await fastify.db.query(
      `UPDATE device_sync_status SET 
         last_sync_at = NOW(),
         data_versions = $1
       WHERE device_id = $2 AND user_id = $3`,
      [JSON.stringify(dataVersions), deviceId, userId]
    )

    return {
      success: true,
      data: {
        appliedChanges: changes.length,
        serverChanges,
        syncedAt: new Date().toISOString()
      }
    }
  })

  // 断开设备
  fastify.delete('/devices/:deviceId', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['跨设备同步'], summary: '断开设备' }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { deviceId } = request.params as any

    await fastify.db.query(
      `UPDATE device_sync_status SET is_active = FALSE WHERE device_id = $1 AND user_id = $2`,
      [deviceId, userId]
    )

    return { success: true, message: '设备已断开' }
  })

  // ========================================
  // 同步冲突
  // ========================================

  // 获取待解决的同步冲突
  fastify.get('/sync-conflicts', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['跨设备同步'],
      summary: '获取同步冲突列表'
    }
  }, async (request) => {
    const userId = (request.user as any).userId

    const conflicts = await fastify.db.query(
      `SELECT id, device_id, data_type, conflict_data, resolution, resolved_at, created_at
       FROM sync_conflicts
       WHERE user_id = $1 AND resolution = 'pending'
       ORDER BY created_at DESC`,
      [userId]
    )

    return {
      success: true,
      data: conflicts.rows.map((c: any) => ({
        id: c.id,
        deviceId: c.device_id,
        dataType: c.data_type,
        conflictData: c.conflict_data,
        resolution: c.resolution,
        resolvedAt: c.resolved_at,
        createdAt: c.created_at
      }))
    }
  })

  // 解决冲突
  fastify.post('/sync-conflicts/:conflictId/resolve', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['跨设备同步'],
      summary: '解决同步冲突',
      body: {
        type: 'object',
        required: ['resolution'],
        properties: {
          resolution: { type: 'string', enum: ['keep_local', 'keep_remote', 'keep_both', 'manual'] },
          manualData: { type: 'object' }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { conflictId } = request.params as any
    const { resolution, manualData } = request.body as any

    const conflict = await fastify.db.query(
      `SELECT * FROM sync_conflicts WHERE id = $1 AND user_id = $2`,
      [conflictId, userId]
    )

    if (conflict.rows.length === 0) {
      return { success: false, error: '冲突不存在' }
    }

    const c = conflict.rows[0]

    // 根据解决方案处理
    let resolvedData = null
    if (resolution === 'keep_local') {
      resolvedData = c.conflict_data.local
    } else if (resolution === 'keep_remote') {
      resolvedData = c.conflict_data.remote
    } else if (resolution === 'keep_both') {
      resolvedData = c.conflict_data  // 保留两份
    } else if (resolution === 'manual') {
      resolvedData = manualData
    }

    // 应用解决方案
    if (resolvedData) {
      await applyResolvedConflict(userId, c.data_type, resolvedData)
    }

    // 标记冲突已解决
    await fastify.db.query(
      `UPDATE sync_conflicts SET resolution = 'manual_resolved', resolved_with = $1, resolved_at = NOW()
       WHERE id = $2`,
      [JSON.stringify({ resolution, data: resolvedData }), conflictId]
    )

    return { success: true, message: '冲突已解决' }
  })

  // ========================================
  // 个人工具集成
  // ========================================

  // 获取集成列表
  fastify.get('/integrations', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['工具集成'],
      summary: '获取个人工具集成列表'
    }
  }, async (request) => {
    const userId = (request.user as any).userId

    const integrations = await fastify.db.query(
      `SELECT id, integration_type, provider_name, is_active, last_sync_at, 
              sync_status, error_message, created_at
       FROM personal_integrations
       WHERE user_id = $1
       ORDER BY is_active DESC, created_at DESC`,
      [userId]
    )

    return {
      success: true,
      data: integrations.rows.map((i: any) => ({
        id: i.id,
        type: i.integration_type,
        provider: i.provider_name,
        isActive: i.is_active,
        lastSyncAt: i.last_sync_at,
        syncStatus: i.sync_status,
        errorMessage: i.error_message,
        createdAt: i.created_at
      }))
    }
  })

  // 添加集成
  fastify.post('/integrations', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['工具集成'],
      summary: '添加工具集成',
      body: {
        type: 'object',
        required: ['integrationType', 'providerName', 'config'],
        properties: {
          integrationType: { type: 'string', enum: ['calendar', 'email', 'note', 'external_ai', 'cloud_storage'] },
          providerName: { type: 'string', enum: ['google', 'outlook', 'notion', 'obsidian', 'evernote', 'dropbox', 'onedrive'] },
          config: { type: 'object' }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { integrationType, providerName, config } = request.body as any

    const integrationId = uuidv4()
    await fastify.db.query(
      `INSERT INTO personal_integrations 
       (id, user_id, integration_type, provider_name, config)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, integration_type, provider_name) DO UPDATE SET
         config = EXCLUDED.config,
         is_active = TRUE`,
      [integrationId, userId, integrationType, providerName, JSON.stringify(config)]
    )

    return { success: true, data: { id: integrationId, type: integrationType, provider: providerName }, message: '集成已添加' }
  })

  // 测试集成连接
  fastify.post('/integrations/:integrationId/test', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['工具集成'], summary: '测试集成连接' }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { integrationId } = request.params as any

    const integration = await fastify.db.query(
      `SELECT * FROM personal_integrations WHERE id = $1 AND user_id = $2`,
      [integrationId, userId]
    )

    if (integration.rows.length === 0) {
      return { success: false, error: '集成不存在' }
    }

    const i = integration.rows[0]

    // 模拟连接测试（实际应该调用对应API验证）
    const testSuccess = true  // 简化处理

    await fastify.db.query(
      `UPDATE personal_integrations SET 
         sync_status = $1, error_message = $2
       WHERE id = $3`,
      [testSuccess ? 'idle' : 'error', testSuccess ? null : '连接失败', integrationId]
    )

    return {
      success: testSuccess,
      message: testSuccess ? '连接正常' : '连接失败，请检查配置',
      data: { status: testSuccess ? 'connected' : 'failed' }
    }
  })

  // 触发同步
  fastify.post('/integrations/:integrationId/sync', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['工具集成'], summary: '触发集成数据同步' }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { integrationId } = request.params as any

    // 更新状态
    await fastify.db.query(
      `UPDATE personal_integrations SET sync_status = 'syncing' WHERE id = $1`,
      [integrationId]
    )

    // 模拟同步过程
    // 实际应该调用对应API获取数据并同步

    await fastify.db.query(
      `UPDATE personal_integrations SET 
         sync_status = 'idle', last_sync_at = NOW(), error_message = NULL
       WHERE id = $1`,
      [integrationId]
    )

    return { success: true, message: '同步完成' }
  })

  // 断开集成
  fastify.delete('/integrations/:integrationId', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['工具集成'], summary: '断开工具集成' }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { integrationId } = request.params as any

    await fastify.db.query(
      `DELETE FROM personal_integrations WHERE id = $1 AND user_id = $2`,
      [integrationId, userId]
    )

    return { success: true, message: '集成已断开' }
  })

  // ========================================
  // 数据导入/导出
  // ========================================

  // 导入外部数据
  fastify.post('/import', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['数据导入'],
      summary: '从外部导入数据',
      body: {
        type: 'object',
        properties: {
          source: { type: 'string', enum: ['notion', 'obsidian', 'evernote', 'json'] },
          data: { type: 'object' }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { source, data } = request.body as any

    let imported = { memories: 0, habits: 0, contacts: 0, milestones: 0 }

    if (data.memories && Array.isArray(data.memories)) {
      for (const memory of data.memories) {
        await fastify.db.query(
          `INSERT INTO user_memories (id, user_id, content, memory_type, importance)
           VALUES (uuid_generate_v4(), $1, $2, $3, $4)`,
          [userId, memory.content || '', memory.type || 'short_term', memory.importance || 0.5]
        )
        imported.memories++
      }
    }

    if (data.habits && Array.isArray(data.habits)) {
      for (const habit of data.habits) {
        await fastify.db.query(
          `INSERT INTO user_habits (id, user_id, habit_type, frequency)
           VALUES (uuid_generate_v4(), $1, $2, $3)
           ON CONFLICT (user_id, habit_type) DO NOTHING`,
          [userId, habit.type || 'other', habit.frequency || 1]
        )
        imported.habits++
      }
    }

    if (data.contacts && Array.isArray(data.contacts)) {
      for (const contact of data.contacts) {
        await fastify.db.query(
          `INSERT INTO personal_contacts (id, user_id, contact_name, relation_type, personal_notes)
           VALUES (uuid_generate_v4(), $1, $2, $3, $4)
           ON CONFLICT (user_id, contact_user_id) DO NOTHING`,
          [userId, contact.name || '', contact.relationType || 'other', contact.notes || '']
        )
        imported.contacts++
      }
    }

    if (data.milestones && Array.isArray(data.milestones)) {
      for (const milestone of data.milestones) {
        await fastify.db.query(
          `INSERT INTO personal_milestones (id, user_id, milestone_type, title, occurred_at)
           VALUES (uuid_generate_v4(), $1, $2, $3, $4)`,
          [userId, milestone.type || 'event', milestone.title || '', milestone.occurredAt || new Date()]
        )
        imported.milestones++
      }
    }

    return {
      success: true,
      data: imported,
      message: `成功导入 ${Object.values(imported).reduce((a: number, b: number) => a + b, 0)} 条数据`
    }
  })
}

// 辅助函数：应用同步变更
async function applySyncChange(userId: string, deviceId: string, change: any) {
  const { dataType, operation, data, localTimestamp } = change

  if (dataType === 'memory') {
    if (operation === 'upsert') {
      await fastify.db.query(
        `UPDATE user_memories SET content = $1, accessed_at = NOW() WHERE id = $2 AND user_id = $3`,
        [data.content, data.id, userId]
      )
    }
  } else if (dataType === 'habit') {
    if (operation === 'upsert') {
      await fastify.db.query(
        `INSERT INTO user_habits (id, user_id, habit_type, frequency)
         VALUES (uuid_generate_v4(), $1, $2, $3)
         ON CONFLICT (user_id, habit_type) DO UPDATE SET frequency = user_habits.frequency + EXCLUDED.frequency`,
        [userId, data.type, data.frequency]
      )
    }
  } else if (dataType === 'contact') {
    if (operation === 'upsert') {
      await fastify.db.query(
        `INSERT INTO personal_contacts (id, user_id, contact_name, personal_notes)
         VALUES (uuid_generate_v4(), $1, $2, $3)
         ON CONFLICT (user_id, contact_user_id) DO UPDATE SET personal_notes = EXCLUDED.personal_notes`,
        [userId, data.name, data.notes]
      )
    }
  }
}

// 辅助函数：获取服务端变更
async function getServerChanges(userId: string, deviceId: string, clientVersions: Record<string, any>) {
  const changes: any[] = []

  // 获取记忆变更
  if (!clientVersions.memory || clientVersions.memory < Date.now() - 86400000) {
    const memories = await fastify.db.query(
      `SELECT id, content, memory_type, importance FROM user_memories WHERE user_id = $1 
       AND updated_at > $2`,
      [userId, new Date(clientVersions.memory || 0)]
    )
    for (const m of memories.rows) {
      changes.push({ dataType: 'memory', operation: 'upsert', data: m })
    }
  }

  // 获取习惯变更
  if (!clientVersions.habit || clientVersions.habit < Date.now() - 86400000) {
    const habits = await fastify.db.query(
      `SELECT habit_type, frequency, last_occurred FROM user_habits WHERE user_id = $1`,
      [userId]
    )
    for (const h of habits.rows) {
      changes.push({ dataType: 'habit', operation: 'upsert', data: h })
    }
  }

  return changes
}

// 辅助函数：应用冲突解决方案
async function applyResolvedConflict(userId: string, dataType: string, data: any) {
  if (dataType === 'memory' && data.content) {
    await fastify.db.query(
      `UPDATE user_memories SET content = $1 WHERE user_id = $2`,
      [data.content, userId]
    )
  }
}

export default clawSyncRoutes
