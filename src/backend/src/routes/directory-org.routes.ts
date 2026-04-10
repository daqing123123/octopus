/**
 * 通讯录与组织架构路由
 * 支持按部门/项目/技能搜索同事
 */

import { FastifyPluginAsync } from 'fastify'

const directoryOrgRoutes: FastifyPluginAsync = async (fastify) => {

  // ========================================
  // 通讯录搜索
  // ========================================

  // 搜索同事
  fastify.get('/:enterpriseId/directory/search', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['通讯录'],
      summary: '搜索同事',
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          department: { type: 'string' },
          role: { type: 'string' },
          skills: { type: 'string' },
          limit: { type: 'integer', default: 20 },
          offset: { type: 'integer', default: 0 }
        }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any
    const { q, department, role, skills, limit = 20, offset = 0 } = request.query as any

    // 检查成员身份
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0) {
      return { success: false, error: '无权访问' }
    }

    let query = `
      SELECT 
        u.id, u.name, u.email, u.avatar, u.title,
        em.department, em.position, em.skills, em.bio,
        e.name as enterprise_name
      FROM enterprise_members em
      JOIN users u ON u.id = em.user_id
      JOIN enterprises e ON e.id = em.enterprise_id
      WHERE em.enterprise_id = $1 AND em.status = 'active'
    `
    const params: any[] = [enterpriseId]
    let paramIndex = 2

    // 关键字搜索
    if (q) {
      query += ` AND (
        u.name ILIKE $${paramIndex} OR 
        u.email ILIKE $${paramIndex} OR 
        em.position ILIKE $${paramIndex} OR 
        em.skills::text ILIKE $${paramIndex} OR
        em.bio ILIKE $${paramIndex}
      )`
      params.push(`%${q}%`)
      paramIndex++
    }

    // 部门筛选
    if (department) {
      query += ` AND em.department = $${paramIndex}`
      params.push(department)
      paramIndex++
    }

    // 职位筛选
    if (role) {
      query += ` AND em.position ILIKE $${paramIndex}`
      params.push(`%${role}%`)
      paramIndex++
    }

    // 技能筛选
    if (skills) {
      query += ` AND em.skills::text ILIKE $${paramIndex}`
      params.push(`%${skills}%`)
      paramIndex++
    }

    // 只显示公开档案的成员
    query += ` AND (em.is_public = true OR em.user_id = $1)`

    query += ` ORDER BY u.name LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`
    params.push(limit, offset)

    const result = await fastify.db.query(query, params)

    // 获取总数
    let countQuery = `
      SELECT COUNT(*) FROM enterprise_members em
      WHERE em.enterprise_id = $1 AND em.status = 'active' AND (em.is_public = true OR em.user_id = $1)
    `
    const countParams: any[] = [enterpriseId]
    
    if (q) {
      countQuery += ` AND (
        (SELECT name FROM users WHERE id = em.user_id) ILIKE $2 OR 
        em.position ILIKE $2 OR 
        em.skills::text ILIKE $2
      )`
      countParams.push(`%${q}%`)
    }

    const countResult = await fastify.db.query(countQuery, countParams)

    return {
      success: true,
      data: result.rows.map(r => ({
        id: r.id,
        name: r.name,
        email: r.email,
        avatar: r.avatar,
        title: r.title || r.position,
        department: r.department,
        skills: r.skills ? JSON.parse(r.skills) : [],
        bio: r.bio,
        enterpriseName: r.enterprise_name
      })),
      pagination: {
        total: parseInt(countResult.rows[0].count),
        limit,
        offset
      }
    }
  })

  // 获取组织架构（部门树）
  fastify.get('/:enterpriseId/directory/org-tree', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['通讯录'],
      summary: '获取组织架构树'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any

    // 检查成员身份
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0) {
      return { success: false, error: '无权访问' }
    }

    // 获取所有部门
    const departments = await fastify.db.query(
      `SELECT DISTINCT department, COUNT(*) as member_count
       FROM enterprise_members
       WHERE enterprise_id = $1 AND status = 'active' AND department IS NOT NULL
       GROUP BY department
       ORDER BY department`,
      [enterpriseId]
    )

    // 获取部门负责人
    const managers = await fastify.db.query(
      `SELECT em.department, u.id, u.name, u.avatar, u.title
       FROM enterprise_members em
       JOIN users u ON u.id = em.user_id
       WHERE em.enterprise_id = $1 AND em.status = 'active' 
         AND em.position ILIKE '%负责人%' OR em.position ILIKE '%主管%' OR em.position ILIKE '%经理%'
       ORDER BY em.department, u.name`,
      [enterpriseId]
    )

    // 按部门分组负责人
    const managerMap = new Map()
    for (const m of managers.rows) {
      if (!managerMap.has(m.department)) {
        managerMap.set(m.department, [])
      }
      managerMap.get(m.department).push({
        id: m.id,
        name: m.name,
        avatar: m.avatar,
        title: m.title
      })
    }

    // 构建树形结构
    const orgTree = departments.rows.map(d => ({
      department: d.department,
      memberCount: parseInt(d.member_count),
      managers: managerMap.get(d.department) || []
    }))

    return {
      success: true,
      data: orgTree
    }
  })

  // 获取部门成员
  fastify.get('/:enterpriseId/directory/departments/:department/members', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['通讯录'],
      summary: '获取部门成员列表'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId, department } = request.params as any

    // 检查成员身份
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0) {
      return { success: false, error: '无权访问' }
    }

    const result = await fastify.db.query(
      `SELECT u.id, u.name, u.email, u.avatar, u.title, em.position, em.skills
       FROM enterprise_members em
       JOIN users u ON u.id = em.user_id
       WHERE em.enterprise_id = $1 AND em.department = $2 
         AND em.status = 'active' AND em.is_public = true
       ORDER BY em.position, u.name`,
      [enterpriseId, department]
    )

    return {
      success: true,
      data: result.rows.map(r => ({
        id: r.id,
        name: r.name,
        email: r.email,
        avatar: r.avatar,
        title: r.title || r.position,
        skills: r.skills ? JSON.parse(r.skills) : []
      }))
    }
  })

  // 获取同事详情
  fastify.get('/:enterpriseId/directory/members/:memberId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['通讯录'],
      summary: '获取同事详细信息'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId, memberId } = request.params as any

    // 检查成员身份
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0) {
      return { success: false, error: '无权访问' }
    }

    // 获取目标成员信息
    const target = await fastify.db.query(
      `SELECT u.id, u.name, u.email, u.avatar, u.title, u.phone,
              em.department, em.position, em.skills, em.bio, em.is_public,
              e.name as enterprise_name
       FROM enterprise_members em
       JOIN users u ON u.id = em.user_id
       JOIN enterprises e ON e.id = em.enterprise_id
       WHERE em.user_id = $1 AND em.enterprise_id = $2 AND em.status = 'active'`,
      [memberId, enterpriseId]
    )

    if (target.rows.length === 0) {
      return { success: false, error: '成员不存在' }
    }

    const memberData = target.rows[0]

    // 检查是否有权限查看完整信息
    const isSelf = memberId === userId
    const isAdmin = ['owner', 'admin'].includes(member.rows[0].role)
    const isPublic = memberData.is_public

    if (!isSelf && !isAdmin && !isPublic) {
      // 只返回公开信息
      return {
        success: true,
        data: {
          id: memberData.id,
          name: memberData.name,
          avatar: memberData.avatar,
          title: memberData.title,
          department: memberData.department,
          enterpriseName: memberData.enterprise_name,
          isPublic: false
        },
        message: '该成员设置了隐私保护'
      }
    }

    // 获取最近动态
    const recentActivity = await fastify.db.query(
      `SELECT id, type, content, created_at
       FROM activity_logs
       WHERE user_id = $1 AND enterprise_id = $2
       ORDER BY created_at DESC
       LIMIT 5`,
      [memberId, enterpriseId]
    )

    // 获取共同项目
    const sharedProjects = await fastify.db.query(
      `SELECT DISTINCT p.id, p.name
       FROM project_members pm
       JOIN projects p ON p.id = pm.project_id
       WHERE pm.user_id = $1 AND p.enterprise_id = $2`,
      [memberId, enterpriseId]
    )

    return {
      success: true,
      data: {
        id: memberData.id,
        name: memberData.name,
        email: memberData.email,
        avatar: memberData.avatar,
        phone: isSelf || isAdmin ? memberData.phone : null,
        title: memberData.title,
        department: memberData.department,
        position: memberData.position,
        skills: memberData.skills ? JSON.parse(memberData.skills) : [],
        bio: memberData.bio,
        enterpriseName: memberData.enterprise_name,
        recentActivity: recentActivity.rows,
        sharedProjects: sharedProjects.rows
      }
    }
  })

  // 获取技能地图
  fastify.get('/:enterpriseId/directory/skills-map', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['通讯录'],
      summary: '获取团队技能地图'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any

    // 检查成员身份
    const member = await fastify.db.query(
      `SELECT role FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0) {
      return { success: false, error: '无权访问' }
    }

    // 获取所有技能及其熟练度
    const skillsData = await fastify.db.query(
      `SELECT u.id, u.name, u.avatar, em.department, em.skills
       FROM enterprise_members em
       JOIN users u ON u.id = em.user_id
       WHERE em.enterprise_id = $1 AND em.status = 'active' 
         AND em.skills IS NOT NULL AND em.skills != '[]'`,
      [enterpriseId]
    )

    // 解析并聚合技能
    const skillsMap = new Map<string, { count: number, members: any[] }>()

    for (const row of skillsData.rows) {
      const skills: any[] = typeof row.skills === 'string' 
        ? JSON.parse(row.skills) 
        : (row.skills || [])

      for (const skill of skills) {
        if (typeof skill === 'string') {
          // 普通技能格式
          if (!skillsMap.has(skill)) {
            skillsMap.set(skill, { count: 0, members: [] })
          }
          skillsMap.get(skill)!.count++
          skillsMap.get(skill)!.members.push({
            id: row.id,
            name: row.name,
            avatar: row.avatar,
            department: row.department
          })
        } else if (skill.name) {
          // 带熟练度的格式
          if (!skillsMap.has(skill.name)) {
            skillsMap.set(skill.name, { count: 0, members: [] })
          }
          skillsMap.get(skill.name)!.count++
          skillsMap.get(skill.name)!.members.push({
            id: row.id,
            name: row.name,
            avatar: row.avatar,
            department: row.department,
            level: skill.level
          })
        }
      }
    }

    // 转换为数组并按熟练度排序
    const skillsList = Array.from(skillsMap.entries())
      .map(([name, data]) => ({
        name,
        count: data.count,
        members: data.members.slice(0, 5) // 只返回前5个成员
      }))
      .sort((a, b) => b.count - a.count)

    return {
      success: true,
      data: skillsList
    }
  })

  // 智能推荐同事（基于项目、技能、共同联系）
  fastify.get('/:enterpriseId/directory/recommendations', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['通讯录'],
      summary: '智能推荐同事'
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.params as any

    // 检查成员身份
    const member = await fastify.db.query(
      `SELECT role, skills FROM enterprise_members 
       WHERE enterprise_id = $1 AND user_id = $2 AND status = 'active'`,
      [enterpriseId, userId]
    )

    if (member.rows.length === 0) {
      return { success: false, error: '无权访问' }
    }

    const userSkills: string[] = member.rows[0].skills 
      ? JSON.parse(member.rows[0].skills) 
      : []

    // 查找技能相似的同事
    const similarSkills = await fastify.db.query(
      `SELECT u.id, u.name, u.avatar, u.title, em.department, em.skills,
              COUNT(*) as skill_match
       FROM enterprise_members em
       JOIN users u ON u.id = em.user_id
       WHERE em.enterprise_id = $1 AND em.user_id != $2 AND em.status = 'active'
         AND em.skills IS NOT NULL AND em.skills != '[]'
       GROUP BY u.id, u.name, u.avatar, u.title, em.department, em.skills
       ORDER BY skill_match DESC
       LIMIT 5`,
      [enterpriseId, userId]
    )

    // 查找同一项目的同事
    const sameProject = await fastify.db.query(
      `SELECT DISTINCT u.id, u.name, u.avatar, u.title, em.department, p.name as project_name
       FROM project_members pm
       JOIN projects p ON p.id = pm.project_id
       JOIN enterprise_members em ON em.user_id = pm.user_id
       JOIN users u ON u.id = em.user_id
       WHERE p.id IN (
         SELECT pm2.project_id FROM project_members pm2 WHERE pm2.user_id = $1
       ) AND pm.user_id != $1
       LIMIT 5`,
      [userId]
    )

    // 新加入的成员
    const newMembers = await fastify.db.query(
      `SELECT u.id, u.name, u.avatar, u.title, em.department, em.created_at
       FROM enterprise_members em
       JOIN users u ON u.id = em.user_id
       WHERE em.enterprise_id = $1 AND em.user_id != $2 AND em.status = 'active'
       ORDER BY em.created_at DESC
       LIMIT 5`,
      [enterpriseId, userId]
    )

    return {
      success: true,
      data: {
        similarSkills: similarSkills.rows.map(r => ({
          ...r,
          skills: r.skills ? JSON.parse(r.skills) : []
        })),
        sameProject: sameProject.rows,
        newMembers: newMembers.rows
      }
    }
  })
}

export default directoryOrgRoutes
