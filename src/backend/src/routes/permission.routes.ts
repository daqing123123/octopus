/**
 * 统一权限管理系统
 * 支持：资源权限、角色管理、权限继承、审批流程
 */

import { FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

// ============================================================
// 工具函数
// ============================================================

// 权限层级（从低到高）
const PERMISSION_LEVELS: Record<string, number> = {
  none: 0,
  view: 1,
  comment: 2,
  edit: 3,
  admin: 4,
}

const PERMISSION_ROUTES: FastifyPluginAsync = async (fastify) => {

  // ========================================
  // 资源权限检查（核心中间件）
  // ========================================
  
  // 创建资源时自动注册到权限系统
  fastify.post('/permissions/resources', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['权限'],
      summary: '注册资源到权限系统',
      body: {
        type: 'object',
        required: ['resourceType', 'resourceId', 'enterpriseId'],
        properties: {
          resourceType: { type: 'string' },
          resourceId: { type: 'string' },
          enterpriseId: { type: 'string' },
          name: { type: 'string' },
          sensitivityLevel: { type: 'string', enum: ['public', 'internal', 'confidential', 'secret'] }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { resourceType, resourceId, enterpriseId, name, sensitivityLevel } = request.body as any

    // 获取资源表名
    const tableMap: Record<string, string> = {
      document: 'documents',
      task: 'tasks',
      file: 'files',
      folder: 'documents',
      table: 'tables',
      meeting: 'meetings'
    }
    const tableName = tableMap[resourceType] || 'documents'

    // 验证资源是否存在
    const resource = await fastify.db.query(
      `SELECT id FROM ${tableName} WHERE id = $1`,
      [resourceId]
    )

    // 如果资源不存在，先创建占位（某些场景资源后创建）
    
    // 注册到资源表
    const resourceEntryId = uuidv4()
    await fastify.db.query(
      `INSERT INTO resources (id, resource_type, resource_id, enterprise_id, owner_id, name, sensitivity_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (resource_type, resource_id) DO UPDATE SET
         name = EXCLUDED.name, sensitivity_level = EXCLUDED.sensitivity_level`,
      [resourceEntryId, resourceType, resourceId, enterpriseId, userId, name, sensitivityLevel || 'internal']
    )

    // 自动给所有者最高权限
    await fastify.db.query(
      `INSERT INTO resource_permissions (id, resource_id, principal_type, principal_id, permission, granted_by)
       VALUES ($1, $2, 'user', $3, 'admin', $3)
       ON CONFLICT DO NOTHING`,
      [uuidv4(), resourceEntryId, userId]
    )

    return {
      success: true,
      data: { resourceEntryId },
      message: '资源已注册到权限系统'
    }
  })

  // ========================================
  // 授予权限
  // ========================================
  fastify.post('/permissions/resources/:resourceId/grant', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['权限'],
      summary: '授予资源权限',
      body: {
        type: 'object',
        required: ['principalType', 'principalId', 'permission'],
        properties: {
          principalType: { type: 'string', enum: ['user', 'role', 'department', 'everyone'] },
          principalId: { type: 'string' },
          permission: { type: 'string', enum: ['view', 'comment', 'edit', 'admin'] },
          expiresAt: { type: 'string', format: 'date-time' }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { resourceId } = request.params as any
    const { principalType, principalId, permission, expiresAt } = request.body as any

    // 检查授予者是否有 admin 权限
    const hasAdmin = await checkPermission(fastify, resourceId, userId, 'admin')
    if (!hasAdmin) {
      return { success: false, error: '无管理权限' }
    }

    // 检查权限层级
    if (PERMISSION_LEVELS[permission] > PERMISSION_LEVELS['admin']) {
      return { success: false, error: '无效的权限级别' }
    }

    const permId = uuidv4()
    await fastify.db.query(
      `INSERT INTO resource_permissions (id, resource_id, principal_type, principal_id, permission, granted_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (resource_id, principal_type, principal_id, permission) 
       DO UPDATE SET expires_at = EXCLUDED.expires_at, granted_by = EXCLUDED.granted_by`,
      [permId, resourceId, principalType, principalId, permission, userId, expiresAt || null]
    )

    // 记录协作事件
    await fastify.db.query(
      `INSERT INTO collaboration_events (id, resource_id, user_id, event_type, event_data)
       VALUES ($1, $2, $3, 'permission_change', $4)`,
      [uuidv4(), resourceId, userId, JSON.stringify({ action: 'grant', targetType: principalType, targetId: principalId, permission })]
    )

    return {
      success: true,
      message: `已授予 ${principalType} "${permission}" 权限`
    }
  })

  // ========================================
  // 批量授予权限（整部门/角色）
  // ========================================
  fastify.post('/permissions/resources/:resourceId/grant-batch', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['权限'],
      summary: '批量授予权限'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { resourceId } = request.params as any
    const { grants } = request.body as { grants: Array<{ principalType: string; principalId?: string; permission: string }> }

    // 检查 admin 权限
    const hasAdmin = await checkPermission(fastify, resourceId, userId, 'admin')
    if (!hasAdmin) {
      return { success: false, error: '无管理权限' }
    }

    let granted = 0
    for (const grant of grants) {
      if (grant.principalType === 'everyone') {
        await fastify.db.query(
          `INSERT INTO resource_permissions (id, resource_id, principal_type, principal_id, permission, granted_by)
           VALUES ($1, $2, 'everyone', NULL, $3, $4)
           ON CONFLICT DO NOTHING`,
          [uuidv4(), resourceId, grant.permission, userId]
        )
      } else {
        await fastify.db.query(
          `INSERT INTO resource_permissions (id, resource_id, principal_type, principal_id, permission, granted_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT DO NOTHING`,
          [uuidv4(), resourceId, grant.principalType, grant.principalId, grant.permission, userId]
        )
      }
      granted++
    }

    return {
      success: true,
      message: `已批量授予 ${granted} 项权限`
    }
  })

  // ========================================
  // 撤销权限
  // ========================================
  fastify.delete('/permissions/resources/:resourceId/permissions/:permissionId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['权限'],
      summary: '撤销权限'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { resourceId, permissionId } = request.params as any

    const hasAdmin = await checkPermission(fastify, resourceId, userId, 'admin')
    if (!hasAdmin) {
      return { success: false, error: '无管理权限' }
    }

    // 不能撤销所有者权限
    const perm = await fastify.db.query(
      `SELECT rp.*, r.owner_id FROM resource_permissions rp
       JOIN resources r ON rp.resource_id = r.id
       WHERE rp.id = $1`,
      [permissionId]
    )

    if (perm.rows.length === 0) {
      return { success: false, error: '权限不存在' }
    }

    if (perm.rows[0].principal_type === 'user' && perm.rows[0].principal_id === perm.rows[0].owner_id) {
      return { success: false, error: '不能撤销所有者的管理权限' }
    }

    await fastify.db.query(`DELETE FROM resource_permissions WHERE id = $1`, [permissionId])

    return {
      success: true,
      message: '权限已撤销'
    }
  })

  // ========================================
  // 检查权限（常用 API）
  // ========================================
  fastify.get('/permissions/check', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['权限'],
      summary: '检查资源权限',
      querystring: {
        type: 'object',
        required: ['resourceType', 'resourceId'],
        properties: {
          resourceType: { type: 'string' },
          resourceId: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { resourceType, resourceId } = request.query as any

    const effectivePermission = await getEffectivePermission(fastify, resourceId, userId)

    return {
      success: true,
      data: {
        hasAccess: effectivePermission !== 'none',
        permission: effectivePermission,
        canView: effectivePermission !== 'none',
        canEdit: ['edit', 'admin'].includes(effectivePermission),
        canComment: ['comment', 'edit', 'admin'].includes(effectivePermission),
        canAdmin: effectivePermission === 'admin'
      }
    }
  })

  // ========================================
  // 获取资源权限列表
  // ========================================
  fastify.get('/permissions/resources/:resourceId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['权限'],
      summary: '获取资源的所有权限'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { resourceId } = request.params as any

    // 需要有查看权限
    const hasView = await checkPermission(fastify, resourceId, userId, 'view')
    if (!hasView) {
      return { success: false, error: '无访问权限' }
    }

    // 获取资源信息
    const resource = await fastify.db.query(
      `SELECT r.*, u.name as owner_name FROM resources r
       LEFT JOIN users u ON r.owner_id = u.id
       WHERE r.id = $1`,
      [resourceId]
    )

    // 获取权限列表
    const permissions = await fastify.db.query(
      `SELECT rp.*, 
              CASE WHEN rp.principal_type = 'user' THEN u.name ELSE NULL END as user_name,
              CASE WHEN rp.principal_type = 'role' THEN ro.name ELSE NULL END as role_name,
              CASE WHEN rp.principal_type = 'department' THEN d.name ELSE NULL END as dept_name,
              g.name as granted_by_name
       FROM resource_permissions rp
       LEFT JOIN users u ON rp.principal_type = 'user' AND rp.principal_id = u.id
       LEFT JOIN roles ro ON rp.principal_type = 'role' AND rp.principal_id = ro.id
       LEFT JOIN departments d ON rp.principal_type = 'department' AND rp.principal_id = d.id
       LEFT JOIN users g ON rp.granted_by = g.id
       WHERE rp.resource_id = $1
       ORDER BY rp.permission = 'admin' DESC, rp.created_at ASC`,
      [resourceId]
    )

    // 获取继承的权限
    const inherited = await fastify.db.query(
      `SELECT r.name as parent_name, rp.*
       FROM permission_inheritance pi
       JOIN resources r ON pi.parent_resource_id = r.id
       JOIN resource_permissions rp ON rp.resource_id = r.id
       WHERE pi.child_resource_id = $1 AND rp.inherited = false
       ORDER BY rp.permission DESC`,
      [resourceId]
    )

    return {
      success: true,
      data: {
        resource: resource.rows[0],
        permissions: permissions.rows,
        inherited: inherited.rows
      }
    }
  })

  // ========================================
  // 获取用户可访问的资源列表
  // ========================================
  fastify.get('/permissions/my-resources', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['权限'],
      summary: '获取我的可访问资源',
      querystring: {
        type: 'object',
        properties: {
          resourceType: { type: 'string' },
          enterpriseId: { type: 'string' },
          limit: { type: 'integer', default: 50 },
          offset: { type: 'integer', default: 0 }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { resourceType, enterpriseId, limit, offset } = request.query as any

    // 复杂查询：用户作为负责人、作为分享对象、作为公开资源
    const result = await fastify.db.query(
      `WITH accessible AS (
        SELECT DISTINCT r.id, r.resource_type, r.resource_id, r.name, r.sensitivity_level,
               r.owner_id, r.updated_at, 'owner' as access_type,
               'admin' as max_permission
        FROM resources r WHERE r.owner_id = $1 AND ($2 = '' OR r.resource_type = $2)
        
        UNION ALL
        
        SELECT DISTINCT r.id, r.resource_type, r.resource_id, r.name, r.sensitivity_level,
               r.owner_id, r.updated_at, 'shared' as access_type,
               MAX(rp.permission) as max_permission
        FROM resources r
        JOIN resource_permissions rp ON rp.resource_id = r.id
        WHERE (rp.principal_type = 'user' AND rp.principal_id = $1)
           OR (rp.principal_type = 'everyone')
           OR (rp.principal_type = 'department' AND rp.principal_id IN (
               SELECT department_id FROM user_departments WHERE user_id = $1
           ))
          AND ($2 = '' OR r.resource_type = $2)
        GROUP BY r.id
       )
       SELECT * FROM accessible 
       WHERE $3 = '' OR resource_type = $3
       ORDER BY updated_at DESC
       LIMIT $4 OFFSET $5`,
      [userId, resourceType || '', enterpriseId || '', limit || 50, offset || 0]
    )

    return {
      success: true,
      data: result.rows
    }
  })

  // ========================================
  // 申请权限
  // ========================================
  fastify.post('/permissions/request', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['权限'],
      summary: '申请资源访问权限'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { resourceId, requestedPermission, reason } = request.body as any

    // 获取资源所有者
    const resource = await fastify.db.query(
      `SELECT r.*, u.name as owner_name, u.email as owner_email
       FROM resources r
       LEFT JOIN users u ON r.owner_id = u.id
       WHERE r.id = $1`,
      [resourceId]
    )

    if (resource.rows.length === 0) {
      return { success: false, error: '资源不存在' }
    }

    const ownerId = resource.rows[0].owner_id

    // 创建权限申请通知
    const notificationId = uuidv4()
    await fastify.db.query(
      `INSERT INTO notifications (id, user_id, type, title, content, data, created_at)
       VALUES ($1, $2, 'permission_request', '权限申请', $3, $4, NOW())`,
      [
        notificationId,
        ownerId,
        `用户申请访问 "${resource.rows[0].name}" 的 "${requestedPermission}" 权限`,
        JSON.stringify({ resourceId, requesterId: userId, requestedPermission, reason })
      ]
    )

    return {
      success: true,
      message: '已向资源所有者发送权限申请',
      data: { notificationId }
    }
  })

  // ========================================
  // 权限继承管理
  // ========================================
  fastify.post('/permissions/resources/:resourceId/inherit', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['权限'],
      summary: '设置权限继承关系'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { resourceId } = request.params as any
    const { parentResourceId, inheritPermissions, inheritFromLevel } = request.body as any

    const hasAdmin = await checkPermission(fastify, resourceId, userId, 'admin')
    if (!hasAdmin) {
      return { success: false, error: '无管理权限' }
    }

    // 添加继承关系
    await fastify.db.query(
      `INSERT INTO permission_inheritance (id, parent_resource_id, child_resource_id, inherit_permissions, inherit_from_level)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (parent_resource_id, child_resource_id) 
       DO UPDATE SET inherit_permissions = EXCLUDED.inherit_permissions, inherit_from_level = EXCLUDED.inherit_from_level`,
      [uuidv4(), parentResourceId, resourceId, inheritPermissions !== false, inheritFromLevel || 'all']
    )

    return {
      success: true,
      message: '权限继承关系已设置'
    }
  })

  // ========================================
  // 角色管理
  // ========================================
  fastify.get('/roles', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['权限'],
      summary: '获取角色列表'
    }
  }, async (request) => {
    const { enterpriseId } = request.query as any

    const result = await fastify.db.query(
      `SELECT * FROM roles WHERE enterprise_id = $1 OR is_system = true ORDER BY is_system DESC, created_at ASC`,
      [enterpriseId || null]
    )

    return {
      success: true,
      data: result.rows
    }
  })

  // 创建自定义角色
  fastify.post('/roles', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['权限'],
      summary: '创建自定义角色'
    }
  }, async (request) => {
    const { enterpriseId, name, code, description, permissions } = request.body as any

    const roleId = uuidv4()
    await fastify.db.query(
      `INSERT INTO roles (id, enterprise_id, name, code, description, permissions)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [roleId, enterpriseId, name, code, description, JSON.stringify(permissions || [])]
    )

    return {
      success: true,
      data: { roleId },
      message: '角色创建成功'
    }
  })

  // ========================================
  // 权限变更历史
  // ========================================
  fastify.get('/permissions/resources/:resourceId/history', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['权限'],
      summary: '获取权限变更历史'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { resourceId } = request.params as any

    const hasView = await checkPermission(fastify, resourceId, userId, 'view')
    if (!hasView) {
      return { success: false, error: '无访问权限' }
    }

    const events = await fastify.db.query(
      `SELECT ce.*, u.name as user_name, u.avatar_url
       FROM collaboration_events ce
       LEFT JOIN users u ON ce.user_id = u.id
       WHERE ce.resource_id = $1 AND ce.event_type = 'permission_change'
       ORDER BY ce.created_at DESC
       LIMIT 50`,
      [resourceId]
    )

    return {
      success: true,
      data: events.rows
    }
  })

  // ========================================
  // 权限总结算（清理过期权限）
  // ========================================
  fastify.post('/permissions/cleanup', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['权限'],
      summary: '清理过期权限（管理员）'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.body as any

    // 简单的权限检查：只有管理员可以清理
    const isAdmin = await fastify.db.query(
      `SELECT id FROM user_enterprise_connections WHERE user_id = $1 AND enterprise_id = $2 AND role = 'admin'`,
      [userId, enterpriseId]
    )

    if (isAdmin.rows.length === 0) {
      return { success: false, error: '需要企业管理员权限' }
    }

    // 删除过期权限
    const result = await fastify.db.query(
      `DELETE FROM resource_permissions WHERE expires_at IS NOT NULL AND expires_at < NOW() RETURNING id`,
      []
    )

    return {
      success: true,
      message: `已清理 ${result.rowCount} 个过期权限`
    }
  })
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 检查用户对资源的权限
 */
async function checkPermission(
  fastify: any,
  resourceId: string,
  userId: string,
  requiredPermission: string
): Promise<boolean> {
  const effective = await getEffectivePermission(fastify, resourceId, userId)
  return PERMISSION_LEVELS[effective] >= PERMISSION_LEVELS[requiredPermission]
}

/**
 * 获取用户对资源的最高有效权限
 */
async function getEffectivePermission(
  fastify: any,
  resourceId: string,
  userId: string
): Promise<string> {
  // 1. 检查是否是所有者
  const owner = await fastify.db.query(
    `SELECT owner_id FROM resources WHERE id = $1`,
    [resourceId]
  )
  if (owner.rows.length > 0 && owner.rows[0].owner_id === userId) {
    return 'admin'
  }

  // 2. 检查直接授权
  const direct = await fastify.db.query(
    `SELECT permission FROM resource_permissions
     WHERE resource_id = $1 
       AND principal_type = 'user' 
       AND principal_id = $2
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY CASE permission 
       WHEN 'admin' THEN 4 WHEN 'edit' THEN 3 WHEN 'comment' THEN 2 WHEN 'view' THEN 1 
       ELSE 0 END DESC
     LIMIT 1`,
    [resourceId, userId]
  )
  if (direct.rows.length > 0) {
    return direct.rows[0].permission
  }

  // 3. 检查角色权限
  const userRoles = await fastify.db.query(
    `SELECT role FROM user_enterprise_connections WHERE user_id = $1 AND status = 'active'`,
    [userId]
  )
  for (const row of userRoles.rows) {
    const role = await fastify.db.query(
      `SELECT permissions FROM roles WHERE code = $1 AND (enterprise_id IS NULL OR enterprise_id IN (
        SELECT enterprise_id FROM user_enterprise_connections WHERE user_id = $2 AND role = 'admin'
      ))`,
      [row.role, userId]
    )
    if (role.rows.length > 0) {
      const perms = role.rows[0].permissions
      if (perms.includes('*') || perms.includes('document:*') || perms.includes('document:edit')) {
        return 'edit'
      }
    }
  }

  // 4. 检查部门权限
  const depts = await fastify.db.query(
    `SELECT department_id FROM user_departments WHERE user_id = $1`,
    [userId]
  )
  for (const d of depts.rows) {
    const dept = await fastify.db.query(
      `SELECT permission FROM resource_permissions
       WHERE resource_id = $1 AND principal_type = 'department' AND principal_id = $2
         AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      [resourceId, d.department_id]
    )
    if (dept.rows.length > 0) {
      return dept.rows[0].permission
    }
  }

  // 5. 检查公开权限
  const pub = await fastify.db.query(
    `SELECT permission FROM resource_permissions
     WHERE resource_id = $1 AND principal_type = 'everyone'
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [resourceId]
  )
  if (pub.rows.length > 0) {
    return pub.rows[0].permission
  }

  // 6. 检查继承权限
  const parent = await fastify.db.query(
    `SELECT parent_resource_id, inherit_from_level FROM permission_inheritance
     WHERE child_resource_id = $1 AND inherit_permissions = true`,
    [resourceId]
  )
  if (parent.rows.length > 0) {
    const inherited = await getEffectivePermission(fastify, parent.rows[0].parent_resource_id, userId)
    if (inherited !== 'none') {
      return inherited
    }
  }

  return 'none'
}

export default PERMISSION_ROUTES
