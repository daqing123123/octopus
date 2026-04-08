'use strict'

import { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

// ============================================
// 员工档案完善度路由 - 触手档案评分系统
// ============================================

export default async function profileCompletenessRoutes(fastify: FastifyInstance) {

  // ========================================
  // 触手端：获取完善度评分
  // ========================================
  fastify.get('/me/profile-completeness', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['档案完善度'],
      summary: '获取个人档案完善度评分',
      querystring: {
        type: 'object',
        properties: { enterpriseId: { type: 'string' } }
      }
    }
  }, async (request) => {
    const userId = (request.user as any).userId
    const { enterpriseId } = request.query as any

    // 默认完善度规则
    const defaultRules = [
      { fieldName: 'realName', fieldLabel: '真实姓名', fieldGroup: '基本信息', weight: 15, isRequired: true },
      { fieldName: 'avatar', fieldLabel: '头像', fieldGroup: '基本信息', weight: 10, isRequired: false },
      { fieldName: 'gender', fieldLabel: '性别', fieldGroup: '基本信息', weight: 5, isRequired: false },
      { fieldName: 'birthday', fieldLabel: '生日', fieldGroup: '基本信息', weight: 5, isRequired: false },
      { fieldName: 'personalPhone', fieldLabel: '手机号', fieldGroup: '联系方式', weight: 10, isRequired: true },
      { fieldName: 'workEmail', fieldLabel: '工作邮箱', fieldGroup: '联系方式', weight: 10, isRequired: false },
      { fieldName: 'emergencyContact', fieldLabel: '紧急联系人', fieldGroup: '联系方式', weight: 10, isRequired: true },
      { fieldName: 'idCard', fieldLabel: '身份证', fieldGroup: '证件信息', weight: 15, isRequired: true },
      { fieldName: 'skills', fieldLabel: '技能标签', fieldGroup: '工作能力', weight: 10, isRequired: false },
      { fieldName: 'workExperience', fieldLabel: '工作经历', fieldGroup: '工作能力', weight: 10, isRequired: false },
      { fieldName: 'bio', fieldLabel: '个人简介', fieldGroup: '工作能力', weight: 5, isRequired: false },
      { fieldName: 'linkedinUrl', fieldLabel: 'LinkedIn', fieldGroup: '工作能力', weight: 5, isRequired: false },
    ]

    // 获取用户档案
    const profile = await fastify.db.query(
      `SELECT up.*, ep.profile_status, ep.id_card_number, ep.skills as ep_skills,
              ep.work_experience as ep_work_exp
       FROM user_profiles up
       LEFT JOIN employee_profiles ep ON ep.user_id = up.user_id
       WHERE up.user_id = $1`,
      [userId]
    )

    const p = profile.rows[0] || {}

    // 计算各字段得分
    const fields = defaultRules.map(rule => {
      let filled = false
      let value = null

      switch (rule.fieldName) {
        case 'realName': filled = !!(p.real_name || p.name); value = p.real_name || p.name; break
        case 'avatar': filled = !!(p.avatar_url); value = p.avatar_url; break
        case 'gender': filled = !!(p.gender); value = p.gender; break
        case 'birthday': filled = !!(p.birthday); value = p.birthday; break
        case 'personalPhone': filled = !!(p.phone); value = p.phone; break
        case 'workEmail': filled = !!(p.work_email || p.email); value = p.work_email || p.email; break
        case 'emergencyContact': filled = !!(p.emergency_contact); value = p.emergency_contact; break
        case 'idCard': filled = !!(p.id_card_number); value = p.id_card_number ? '***' + p.id_card_number.slice(-4) : null; break
        case 'skills':
          filled = !!((p.skills || p.ep_skills || []).length > 0)
          value = p.skills || p.ep_skills || []
          break
        case 'workExperience':
          filled = !!((p.work_experience || p.ep_work_exp || []).length > 0)
          value = p.work_experience || p.ep_work_exp || []
          break
        case 'bio': filled = !!(p.bio); value = p.bio; break
        case 'linkedinUrl': filled = !!(p.linkedin_url); value = p.linkedin_url; break
      }

      return {
        ...rule,
        filled,
        value,
        score: filled ? rule.weight : 0
      }
    })

    // 按组分类
    const groups: any = {}
    fields.forEach(f => {
      if (!groups[f.fieldGroup]) groups[f.fieldGroup] = { label: f.fieldGroup, items: [], totalWeight: 0, maxScore: 0, score: 0 }
      groups[f.fieldGroup].items.push(f)
      groups[f.fieldGroup].totalWeight += f.weight
      groups[f.fieldGroup].score += f.score
      groups[f.fieldGroup].maxScore += f.weight
    })

    const totalScore = fields.reduce((sum, f) => sum + f.score, 0)
    const maxScore = fields.reduce((sum, f) => sum + f.weight, 0)
    const percent = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0

    // 找出缺失项
    const missingFields = fields.filter(f => !f.filled && f.isRequired)
    const suggestedNext = fields.filter(f => !f.filled && !f.isRequired).slice(0, 3)

    // 评级
    let grade = 'D'
    if (percent >= 90) grade = 'S'
    else if (percent >= 80) grade = 'A'
    else if (percent >= 60) grade = 'B'
    else if (percent >= 40) grade = 'C'

    return {
      success: true,
      data: {
        overallScore: totalScore,
        maxScore,
        percent,
        grade,
        completedFields: fields.filter(f => f.filled).length,
        totalFields: fields.length,
        missingRequired: missingFields.map(f => ({ field: f.fieldLabel, reason: `${f.fieldLabel}为必填项` })),
        suggestedNext: suggestedNext.map(f => ({ field: f.fieldLabel, weight: f.weight })),
        groups: Object.values(groups).map((g: any) => ({
          label: g.label,
          score: g.score,
          maxScore: g.maxScore,
          percent: g.maxScore > 0 ? Math.round((g.score / g.maxScore) * 100) : 0,
          items: g.items.map((item: any) => ({
            field: item.fieldLabel,
            filled: item.filled,
            value: item.value ? (Array.isArray(item.value) ? `${item.value.length}项` : (item.fieldName === 'avatar' ? '已上传' : item.value)) : null,
            isRequired: item.isRequired,
            score: item.score
          }))
        })),
        tips: percent < 100 ? getTips(fields, missingFields) : ['🎉 档案已完善！']
      }
    }
  })

  // ========================================
  // 触手端：一键补全引导
  // ========================================
  fastify.get('/me/profile-completeness/quick-fill', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['档案完善度'],
      summary: '获取快速补全建议（按优先级排序）'
    }
  }, async (request) => {
    const userId = (request.user as any).userId

    // 获取当前档案
    const profile = await fastify.db.query(
      `SELECT * FROM user_profiles WHERE user_id = $1`,
      [userId]
    )

    const p = profile.rows[0] || {}

    const quickFillItems = [
      { field: 'realName', label: '填写真实姓名', priority: 1, current: p.real_name || p.name, action: 'redirect', target: '/settings/profile' },
      { field: 'avatar', label: '上传头像', priority: 2, current: p.avatar_url ? '已上传' : '未上传', action: 'upload', target: 'avatar' },
      { field: 'emergencyContact', label: '填写紧急联系人', priority: 3, current: p.emergency_contact ? '已填写' : '未填写', action: 'form', target: 'emergencyContact' },
      { field: 'idCard', label: '上传身份证', priority: 4, current: '未上传', action: 'upload', target: 'idCard' },
      { field: 'skills', label: '添加技能标签', priority: 5, current: (p.skills || []).length > 0 ? `${(p.skills || []).length}个技能` : '未添加', action: 'tag', target: 'skills' },
      { field: 'bio', label: '填写个人简介', priority: 6, current: p.bio ? '已填写' : '未填写', action: 'form', target: 'bio' },
    ]

    return {
      success: true,
      data: quickFillItems.filter(i => i.priority <= 4)
    }
  })

  // ========================================
  // 大脑端：获取团队完善度统计
  // ========================================
  fastify.get('/enterprises/:eid/profile-completeness/stats', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['档案完善度'],
      summary: '获取企业团队档案完善度统计（管理员）'
    }
  }, async (request) => {
    const { eid } = request.params as any

    const members = await fastify.db.query(
      `SELECT ed.user_id, up.real_name, up.name, up.avatar_url, up.phone, up.email,
              up.emergency_contact, up.birthday, up.gender, up.bio, up.linkedin_url,
              ep.id_card_number, ep.skills
       FROM user_enterprise_connections uec
       JOIN user_profiles up ON up.user_id = uec.user_id
       LEFT JOIN employee_profiles ep ON ep.user_id = uec.user_id
       LEFT JOIN employee_directory ed ON ed.user_id = uec.user_id AND ed.enterprise_id = uec.enterprise_id
       WHERE uec.enterprise_id = $1 AND uec.status = 'active'`,
      [eid]
    )

    // 完善度计算
    const rules = [
      { name: 'name', w: 15 }, { name: 'avatar', w: 10 }, { name: 'phone', w: 10 },
      { name: 'email', w: 10 }, { name: 'emergency', w: 10 },
      { name: 'idCard', w: 15 }, { name: 'skills', w: 10 },
      { name: 'bio', w: 10 }, { name: 'experience', w: 10 }
    ]

    const membersWithScore = members.rows.map((m: any) => {
      let score = 0
      const maxScore = rules.reduce((s, r) => s + r.w, 0)
      const filled: any = {}

      rules.forEach(r => {
        let isFilled = false
        switch (r.name) {
          case 'name': isFilled = !!(m.real_name || m.name); break
          case 'avatar': isFilled = !!m.avatar_url; break
          case 'phone': isFilled = !!m.phone; break
          case 'email': isFilled = !!(m.email || m.work_email); break
          case 'emergency': isFilled = !!m.emergency_contact; break
          case 'idCard': isFilled = !!m.id_card_number; break
          case 'skills': isFilled = !!(m.skills && m.skills.length > 0); break
          case 'bio': isFilled = !!m.bio; break
          case 'experience': isFilled = !!(m.work_experience && m.work_experience.length > 0); break
        }
        if (isFilled) score += r.w
        filled[r.name] = isFilled
      })

      const percent = Math.round((score / maxScore) * 100)
      let grade = 'D'
      if (percent >= 90) grade = 'S'
      else if (percent >= 80) grade = 'A'
      else if (percent >= 60) grade = 'B'
      else if (percent >= 40) grade = 'C'

      return {
        userId: m.user_id, name: m.real_name || m.name, avatarUrl: m.avatar_url,
        score, maxScore, percent, grade, filled
      }
    })

    // 分布统计
    const distribution = { S: 0, A: 0, B: 0, C: 0, D: 0 }
    membersWithScore.forEach(m => { distribution[m.grade as keyof typeof distribution]++ })

    const avgScore = membersWithScore.length > 0
      ? Math.round(membersWithScore.reduce((s, m) => s + m.percent, 0) / membersWithScore.length)
      : 0

    // 需要关注的成员（评分C/D）
    const needsAttention = membersWithScore.filter(m => m.grade === 'C' || m.grade === 'D')

    return {
      success: true,
      data: {
        totalMembers: membersWithScore.length,
        averageScore: avgScore,
        distribution,
        breakdown: distribution,
        topPerformers: membersWithScore.filter(m => m.grade === 'S' || m.grade === 'A').slice(0, 5),
        needsAttention: needsAttention.slice(0, 10),
        members: membersWithScore
      }
    }
  })

  // ========================================
  // 大脑端：提醒成员完善档案
  // ========================================
  fastify.post('/enterprises/:eid/profile-completeness/remind', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['档案完善度'],
      summary: '提醒成员完善档案',
      body: {
        type: 'object',
        properties: {
          userIds: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }, async (request) => {
    const { eid } = request.params as any
    const { userIds } = request.body as any

    const targets = userIds || (await fastify.db.query(
      `SELECT user_id FROM user_enterprise_connections WHERE enterprise_id = $1 AND status = 'active'`,
      [eid]
    )).rows.map((r: any) => r.user_id)

    for (const uid of targets) {
      await fastify.db.query(
        `INSERT INTO notifications (recipient_id, notification_type, title, content, source, source_enterprise_id, priority)
         VALUES ($1, 'profile_incomplete', $2, $3, 'brain', $4, 5)`,
        [uid, '📋 请完善您的档案', '您的员工档案信息不完整，请尽快完善以便同事更好地了解您。', eid]
      )
    }

    return { success: true, message: `已发送提醒至 ${targets.length} 位成员` }
  })
}

function getTips(fields: any[], missingFields: any[]) {
  const tips: string[] = []

  if (missingFields.some(f => f.fieldName === 'realName')) tips.push('👤 填写真实姓名，让同事更容易认识您')
  if (missingFields.some(f => f.fieldName === 'emergencyContact')) tips.push('🆘 填写紧急联系人，保障工作安全')
  if (missingFields.some(f => f.fieldName === 'idCard')) tips.push('🪪 上传身份证，完成入职必要流程')
  if (fields.find(f => f.fieldName === 'skills' && !f.filled)) tips.push('🎯 添加技能标签，展示您的专业能力')
  if (fields.find(f => f.fieldName === 'bio' && !f.filled)) tips.push('✍️ 写一段个人简介，让大家更了解您')
  if (fields.find(f => f.fieldName === 'avatar' && !f.filled)) tips.push('📷 上传一张头像，让同事一眼认出您')

  return tips.length > 0 ? tips : ['🎉 您的档案已经非常完善了！']
}
