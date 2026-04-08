'use strict'

import { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

// ============================================
// 企业通讯录 & 组织架构路由
// ============================================

export default async function directoryRoutes(fastify: FastifyInstance) {

  // ========================================
  // 触手端：获取通讯录
  // ========================================
  fastify.get('/enterprises/:eid/directory', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['通讯录'],
      summary: '获取企业通讯录',
      querystring: {
        type: 'object',
        properties: {
          departmentId: { type: 'string' },
          search: { type: 'string' },
          skill: { type: 'string' },
          status: { type: 'string', enum: ['available', 'busy', 'away', 'offline'] },
          page: { type: 'integer', default: 1 },
          pageSize: { type: 'integer', default: 50 }
        }
      }
    }
  }, async (request) => {
    const { eid } = request.params as any
    const { departmentId, search, skill, status, page = 1, pageSize = 50 } = request.query as any
    const offset = (page - 1) * pageSize

    let query = `
      SELECT ed.*, u.name as user_name, u.email as user_email,
             d.name as department_name,
             jt.name as job_title_name
      FROM employee_directory ed
      LEFT JOIN users u ON u.id = ed.user_id
      LEFT JOIN departments d ON d.id = ed.department_id
      LEFT JOIN job_titles jt ON jt.id = ed.job_title_id
      WHERE ed.enterprise_id = $1 AND ed.show_in_directory = true
    `
    const params: any[] = [eid]
    let p = 2

    if (departmentId) { query += ` AND ed.department_id = $${p++}`; params.push(departmentId) }
    if (status) { query += ` AND ed.availability_status = $${p++}`; params.push(status) }
    if (search) {
      query += ` AND (u.name ILIKE $${p} OR ed.display_name ILIKE $${p} OR d.name ILIKE $${p})`
      params.push(`%${search}%`); p++
    }
    if (skill) { query += ` AND $${p++} = ANY(ed.skills)`; params.push(skill) }

    query += ` ORDER BY ed.display_order, u.name LIMIT $${p++} OFFSET $${p++}`
    params.push(pageSize, offset)

    const result = await fastify.db.query(query, params)

    // 统计
    const countQuery = `
      SELECT COUNT(*) FROM employee_directory ed
      WHERE ed.enterprise_id = $1 AND ed.show_in_directory = true
    `
    const countResult = await fastify.db.query(countQuery, [eid])

    return {
      success: true,
      data: {
        employees: result.rows.map(e => ({
          id: e.id, name: e.display_name || e.user_name,
          avatarUrl: e.avatar_url, phone: e.show_phone ? e.phone : null,
          email: e.show_email ? (e.work_email || e.user_email) : null,
          department: e.department_name, jobTitle: e.job_title_name,
          location: e.location, bio: e.bio,
          skills: e.show_skills ? e.skills : null,
          status: e.availability_status, lastActive: e.last_active
        })),
        pagination: {
          total: parseInt(countResult.rows[0].count),
          page, pageSize,
          totalPages: Math.ceil(parseInt(countResult.rows[0].count) / pageSize)
        }
      }
    }
  })

  // ========================================
  // 触手端：获取单个员工详情
  // ========================================
  fastify.get('/enterprises/:eid/directory/me', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['通讯录'], summary: '获取自己的通讯录信息' }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { eid } = request.params as any

    const result = await fastify.db.query(
      `SELECT ed.*, d.name as department_name, jt.name as job_title_name
       FROM employee_directory ed
       LEFT JOIN departments d ON d.id = ed.department_id
       LEFT JOIN job_titles jt ON jt.id = ed.job_title_id
       WHERE ed.enterprise_id = $1 AND ed.user_id = $2`,
      [eid, userId]
    )

    if (result.rows.length === 0) return { success: false, error: '不在通讯录中' }

    const e = result.rows[0]
    return {
      success: true,
      data: {
        id: e.id, name: e.display_name, avatarUrl: e.avatar_url,
        phone: e.phone, workEmail: e.work_email,
        department: e.department_name, jobTitle: e.job_title_name,
        location: e.location, bio: e.bio, skills: e.skills,
        status: e.availability_status,
        showPhone: e.show_phone, showEmail: e.show_email, showSkills: e.show_skills
      }
    }
  })

  fastify.patch('/enterprises/:eid/directory/me', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['通讯录'], summary: '更新通讯录可见性' }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { eid } = request.params as any
    const updates = request.body as any

    const fields: string[] = []
    const values: any[] = []
    let i = 1

    const fieldMap: Record<string, string> = {
      displayName: 'display_name', phone: 'phone', workEmail: 'work_email',
      location: 'location', bio: 'bio', skills: 'skills',
      availabilityStatus: 'availability_status',
      showPhone: 'show_phone', showEmail: 'show_email',
      showSkills: 'show_skills', showInDirectory: 'show_in_directory',
      avatarUrl: 'avatar_url'
    }

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (updates[key] !== undefined) {
        fields.push(`${dbField} = $${i++}`)
        values.push(key === 'skills' ? JSON.stringify(updates[key]) : updates[key])
      }
    }

    if (fields.length === 0) return { success: false, error: '无更新字段' }

    fields.push('updated_at = NOW()')
    values.push(eid, userId)

    await fastify.db.query(
      `UPDATE employee_directory SET ${fields.join(', ')}
       WHERE enterprise_id = $${i++} AND user_id = $${i}`,
      values
    )

    return { success: true, message: '通讯录已更新' }
  })

  // ========================================
  // 触手端：获取组织架构
  // ========================================
  fastify.get('/enterprises/:eid/org-chart', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['通讯录'],
      summary: '获取组织架构图',
      querystring: {
        type: 'object',
        properties: { flat: { type: 'boolean', default: false } }
      }
    }
  }, async (request) => {
    const { eid } = request.params as any
    const { flat } = request.query as any

    if (flat) {
      // 平铺列表
      const depts = await fastify.db.query(
        `SELECT d.*, u.name as manager_name, u.email as manager_email
         FROM departments d
         LEFT JOIN users u ON u.id = d.manager_id
         WHERE d.enterprise_id = $1 AND d.is_active = true
         ORDER BY d.display_order`,
        [eid]
      )

      const employees = await fastify.db.query(
        `SELECT ed.department_id, COUNT(*) as count
         FROM employee_directory ed WHERE ed.enterprise_id = $1 AND ed.show_in_directory = true
         GROUP BY ed.department_id`,
        [eid]
      )

      const empMap: any = {}
      employees.rows.forEach((r: any) => { empMap[r.department_id] = parseInt(r.count) })

      return {
        success: true,
        data: depts.rows.map(d => ({
          id: d.id, name: d.name, code: d.code, description: d.description,
          parentId: d.parent_id, manager: d.manager_id ? { id: d.manager_id, name: d.manager_name } : null,
          color: d.color, displayOrder: d.display_order,
          employeeCount: empMap[d.id] || 0
        }))
      }
    }

    // 树形结构
    const depts = await fastify.db.query(
      `SELECT d.*, u.name as manager_name
       FROM departments d
       LEFT JOIN users u ON u.id = d.manager_id
       WHERE d.enterprise_id = $1 AND d.is_active = true
       ORDER BY d.display_order`,
      [eid]
    )

    const employees = await fastify.db.query(
      `SELECT ed.department_id, u.id as user_id, u.name, ed.avatar_url, ed.availability_status
       FROM employee_directory ed
       JOIN users u ON u.id = ed.user_id
       WHERE ed.enterprise_id = $1 AND ed.show_in_directory = true
       ORDER BY ed.display_order`,
      [eid]
    )

    const employeesByDept: any = {}
    employees.rows.forEach((e: any) => {
      if (!employeesByDept[e.department_id]) employeesByDept[e.department_id] = []
      employeesByDept[e.department_id].push({
        id: e.user_id, name: e.name, avatarUrl: e.avatar_url, status: e.availability_status
      })
    })

    // 构建树
    const buildTree = (parentId: string | null): any[] => {
      return depts.rows
        .filter(d => d.parent_id === parentId)
        .map(d => ({
          id: d.id, name: d.name, code: d.code, description: d.description,
          manager: d.manager_id ? { id: d.manager_id, name: d.manager_name } : null,
          color: d.color,
          employees: employeesByDept[d.id] || [],
          children: buildTree(d.id)
        }))
    }

    return { success: true, data: buildTree(null) }
  })

  // ========================================
  // 大脑端：管理通讯录
  // ========================================
  fastify.post('/enterprises/:eid/directory/employees', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['通讯录'],
      summary: '添加通讯录成员（管理员）',
      body: {
        type: 'object',
        required: ['userId', 'departmentId'],
        properties: {
          userId: { type: 'string' }, departmentId: { type: 'string' },
          jobTitleId: { type: 'string' }, displayName: { type: 'string' },
          phone: { type: 'string' }, workEmail: { type: 'string' },
          location: { type: 'string' }, bio: { type: 'string' },
          skills: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }, async (request) => {
    const { eid } = request.params as any
    const data = request.body as any

    const id = uuidv4()
    await fastify.db.query(
      `INSERT INTO employee_directory
       (id, enterprise_id, user_id, department_id, job_title_id, display_name, phone, work_email, location, bio, skills)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (enterprise_id, user_id) DO UPDATE SET
         department_id = $4, job_title_id = $5, display_name = $6,
         phone = $7, work_email = $8, location = $9, bio = $10, skills = $11`,
      [id, eid, data.userId, data.departmentId, data.jobTitleId,
       data.displayName, data.phone, data.workEmail, data.location, data.bio,
       JSON.stringify(data.skills || [])]
    )

    return { success: true, message: '成员已添加' }
  })

  // ========================================
  // 大脑端：管理部门
  // ========================================
  fastify.get('/enterprises/:eid/departments', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['通讯录'], summary: '获取部门列表' }
  }, async (request) => {
    const { eid } = request.params as any

    const result = await fastify.db.query(
      `SELECT d.*, u.name as manager_name,
        (SELECT COUNT(*) FROM employee_directory ed WHERE ed.department_id = d.id AND ed.show_in_directory = true) as member_count
       FROM departments d
       LEFT JOIN users u ON u.id = d.manager_id
       WHERE d.enterprise_id = $1 AND d.is_active = true
       ORDER BY d.display_order`,
      [eid]
    )

    return {
      success: true,
      data: result.rows.map(d => ({
        id: d.id, name: d.name, code: d.code, description: d.description,
        parentId: d.parent_id, manager: d.manager_id ? { id: d.manager_id, name: d.manager_name } : null,
        color: d.color, displayOrder: d.display_order, memberCount: parseInt(d.member_count)
      }))
    }
  })

  fastify.post('/enterprises/:eid/departments', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['通讯录'], summary: '创建部门',
      body: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string' }, parentId: { type: 'string' }, managerId: { type: 'string' }, color: { type: 'string' }, code: { type: 'string' }, description: { type: 'string' } }
      }
    }
  }, async (request) => {
    const { eid } = request.params as any
    const { name, parentId, managerId, color, code, description } = request.body as any

    const id = uuidv4()
    await fastify.db.query(
      `INSERT INTO departments (id, enterprise_id, name, parent_id, manager_id, color, code, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, eid, name, parentId || null, managerId || null, color || '#6366f1', code, description]
    )

    return { success: true, data: { id }, message: '部门已创建' }
  })

  fastify.patch('/enterprises/:eid/departments/:deptId', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['通讯录'], summary: '更新部门' }
  }, async (request) => {
    const { eid, deptId } = request.params as any
    const updates = request.body as any

    const fields: string[] = []
    const values: any[] = []
    let i = 1

    if (updates.name) { fields.push(`name = $${i++}`); values.push(updates.name) }
    if (updates.parentId !== undefined) { fields.push(`parent_id = $${i++}`); values.push(updates.parentId) }
    if (updates.managerId !== undefined) { fields.push(`manager_id = $${i++}`); values.push(updates.managerId) }
    if (updates.color) { fields.push(`color = $${i++}`); values.push(updates.color) }
    if (updates.displayOrder !== undefined) { fields.push(`display_order = $${i++}`); values.push(updates.displayOrder) }

    if (fields.length === 0) return { success: false, error: '无更新字段' }

    fields.push('updated_at = NOW()')
    values.push(eid, deptId)

    await fastify.db.query(
      `UPDATE departments SET ${fields.join(', ')}
       WHERE enterprise_id = $${i++} AND id = $${i}`,
      values
    )

    return { success: true, message: '部门已更新' }
  })

  // ========================================
  // 通讯录搜索
  // ========================================
  fastify.get('/enterprises/:eid/directory/search', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['通讯录'],
      summary: '全局搜索通讯录',
      querystring: {
        type: 'object',
        properties: { q: { type: 'string' }, limit: { type: 'integer', default: 20 } }
      }
    }
  }, async (request) => {
    const { eid } = request.params as any
    const { q, limit = 20 } = request.query as any

    if (!q || q.length < 1) return { success: true, data: { results: [], total: 0 } }

    const result = await fastify.db.query(
      `SELECT ed.*, u.name as user_name, d.name as department_name, jt.name as job_title_name
       FROM employee_directory ed
       LEFT JOIN users u ON u.id = ed.user_id
       LEFT JOIN departments d ON d.id = ed.department_id
       LEFT JOIN job_titles jt ON jt.id = ed.job_title_id
       WHERE ed.enterprise_id = $1 AND ed.show_in_directory = true
         AND (
           u.name ILIKE $2 OR ed.display_name ILIKE $2 OR ed.bio ILIKE $2
           OR d.name ILIKE $2 OR jt.name ILIKE $2
           OR EXISTS (SELECT 1 FROM unnest(ed.skills) s WHERE s ILIKE $2)
         )
       LIMIT $3`,
      [eid, `%${q}%`, limit]
    )

    return {
      success: true,
      data: {
        results: result.rows.map(e => ({
          id: e.user_id, name: e.display_name || e.user_name,
          avatarUrl: e.avatar_url, department: e.department_name,
          jobTitle: e.job_title_name, status: e.availability_status,
          matchType: 'employee'
        })),
        total: result.rows.length
      }
    }
  })
}
