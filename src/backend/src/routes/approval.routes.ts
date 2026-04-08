import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'

// 审批流程创建 Schema
const createFlowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  icon: z.string().optional(),
  formSchema: z.array(z.object({
    fieldId: z.string(),
    label: z.string(),
    type: z.enum(['text', 'textarea', 'number', 'select', 'multiSelect', 'date', 'file', 'user', 'department']),
    required: z.boolean().default(false),
    options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
    placeholder: z.string().optional()
  })),
  flowDefinition: z.object({
    nodes: z.array(z.object({
      nodeId: z.string(),
      type: z.enum(['start', 'approval', 'condition', 'notify', 'end']),
      name: z.string(),
      approvers: z.array(z.object({
        type: z.enum(['user', 'role', 'department', 'supervisor']),
        userId: z.string().optional(),
        roleId: z.string().optional(),
        departmentId: z.string().optional(),
        level: z.number().optional() // 直属上级层级
      })).optional(),
      conditions: z.array(z.object({
        fieldId: z.string(),
        operator: z.enum(['eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'contains', 'in']),
        value: z.any()
      })).optional(),
      nextNodes: z.array(z.string())
    })),
    edges: z.array(z.object({
      source: z.string(),
      target: z.string(),
      condition: z.string().optional()
    }))
  }),
  settings: z.object({
    allowWithdraw: z.boolean().default(true),
    allowTransfer: z.boolean().default(true),
    allowAddApprover: z.boolean().default(false),
    notifyApplicant: z.boolean().default(true),
    autoApprove: z.boolean().default(false)
  }).optional()
})

// 提交审批 Schema
const submitApprovalSchema = z.object({
  flowId: z.string(),
  formData: z.record(z.any())
})

// 审批操作 Schema
const approvalActionSchema = z.object({
  action: z.enum(['approve', 'reject', 'transfer', 'withdraw', 'addApprover']),
  comment: z.string().optional(),
  transferToUserId: z.string().optional(), // 转审目标用户
  additionalApproverId: z.string().optional() // 加签用户
})

export default async function approvalRoutes(fastify: FastifyInstance) {
  
  // ========================================
  // 流程定义管理
  // ========================================
  
  // 获取流程列表
  fastify.get('/flows', async (request: FastifyRequest<{ Querystring: { isActive?: boolean } }>, reply: FastifyReply) => {
    try {
      // @ts-ignore
      const enterpriseId = request.user?.enterpriseId
      const { isActive } = request.query

      let query = `
        SELECT f.*, u.name as "creatorName"
        FROM approval_flows f
        LEFT JOIN users u ON f.created_by = u.id
        WHERE f.enterprise_id = $1 AND f.deleted_at IS NULL
      `
      const params: any[] = [enterpriseId]
      
      if (isActive !== undefined) {
        query += ` AND f.is_active = $2`
        params.push(isActive)
      }
      
      query += ` ORDER BY f.created_at DESC`

      const result = await fastify.db.query(query, params)

      return {
        success: true,
        data: result.rows.map(row => ({
          id: row.id,
          name: row.name,
          description: row.description,
          icon: row.icon,
          formSchema: row.form_schema,
          flowDefinition: row.flow_definition,
          settings: row.settings,
          isActive: row.is_active,
          usageCount: row.usage_count,
          creator: { id: row.created_by, name: row.creatorName },
          createdAt: row.created_at
        }))
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '获取流程列表失败' })
    }
  })

  // 创建流程
  fastify.post('/flows', async (request: FastifyRequest<{ Body: z.infer<typeof createFlowSchema> }>, reply: FastifyReply) => {
    try {
      const flowData = createFlowSchema.parse(request.body)
      
      // @ts-ignore
      const userId = request.user?.id
      // @ts-ignore
      const enterpriseId = request.user?.enterpriseId
      const flowId = uuidv4()

      const result = await fastify.db.query(`
        INSERT INTO approval_flows (id, enterprise_id, name, description, icon, form_schema, flow_definition, settings, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [
        flowId,
        enterpriseId,
        flowData.name,
        flowData.description,
        flowData.icon || 'file-text',
        JSON.stringify(flowData.formSchema),
        JSON.stringify(flowData.flowDefinition),
        JSON.stringify(flowData.settings || {}),
        userId
      ])

      return {
        success: true,
        data: {
          id: result.rows[0].id,
          name: result.rows[0].name,
          description: result.rows[0].description,
          formSchema: result.rows[0].form_schema,
          flowDefinition: result.rows[0].flow_definition
        }
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '创建流程失败' })
    }
  })

  // 更新流程
  fastify.put('/flows/:id', async (request: FastifyRequest<{ Params: { id: string }, Body: Partial<z.infer<typeof createFlowSchema>> }>, reply: FastifyReply) => {
    try {
      const { id } = request.params
      const updates = request.body

      const result = await fastify.db.query(`
        UPDATE approval_flows 
        SET name = COALESCE($1, name),
            description = COALESCE($2, description),
            icon = COALESCE($3, icon),
            form_schema = COALESCE($4, form_schema),
            flow_definition = COALESCE($5, flow_definition),
            settings = COALESCE($6, settings),
            updated_at = NOW()
        WHERE id = $7
        RETURNING *
      `, [
        updates.name,
        updates.description,
        updates.icon,
        updates.formSchema ? JSON.stringify(updates.formSchema) : null,
        updates.flowDefinition ? JSON.stringify(updates.flowDefinition) : null,
        updates.settings ? JSON.stringify(updates.settings) : null,
        id
      ])

      if (result.rows.length === 0) {
        return reply.code(404).send({ success: false, error: '流程不存在' })
      }

      return { success: true, data: result.rows[0] }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '更新流程失败' })
    }
  })

  // 启用/停用流程
  fastify.patch('/flows/:id/status', async (request: FastifyRequest<{ Params: { id: string }, Body: { isActive: boolean } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params
      const { isActive } = request.body

      await fastify.db.query(`
        UPDATE approval_flows SET is_active = $1, updated_at = NOW() WHERE id = $2
      `, [isActive, id])

      return { success: true }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '操作失败' })
    }
  })

  // 删除流程
  fastify.delete('/flows/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params

      // 检查是否有进行中的审批
      const activeCount = await fastify.db.query(`
        SELECT COUNT(*) FROM approval_instances 
        WHERE flow_id = $1 AND status IN ('pending', 'in_progress')
      `, [id])

      if (parseInt(activeCount.rows[0].count) > 0) {
        return reply.code(400).send({ 
          success: false, 
          error: '该流程有进行中的审批，无法删除' 
        })
      }

      await fastify.db.query(`
        UPDATE approval_flows SET deleted_at = NOW() WHERE id = $1
      `, [id])

      return { success: true }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '删除失败' })
    }
  })

  // ========================================
  // 审批实例管理
  // ========================================
  
  // 获取待审批列表（我需要处理的）
  fastify.get('/pending', async (request: FastifyRequest<{ Querystring: { page?: number, limit?: number } }>, reply: FastifyReply) => {
    try {
      // @ts-ignore
      const userId = request.user?.id
      const { page = 1, limit = 20 } = request.query
      const offset = (page - 1) * limit

      const result = await fastify.db.query(`
        SELECT i.*, f.name as "flowName", f.icon as "flowIcon",
               u.name as "applicantName", u.avatar_url as "applicantAvatar"
        FROM approval_instances i
        JOIN approval_flows f ON i.flow_id = f.id
        JOIN users u ON i.applicant_id = u.id
        WHERE i.current_approver_ids @> $1
        AND i.status IN ('pending', 'in_progress')
        ORDER BY i.created_at DESC
        LIMIT $2 OFFSET $3
      `, [JSON.stringify([userId]), limit, offset])

      // 获取总数
      const countResult = await fastify.db.query(`
        SELECT COUNT(*) FROM approval_instances
        WHERE current_approver_ids @> $1
        AND status IN ('pending', 'in_progress')
      `, [JSON.stringify([userId])])

      return {
        success: true,
        data: {
          items: result.rows.map(row => ({
            id: row.id,
            flowId: row.flow_id,
            flowName: row.flowName,
            flowIcon: row.flowIcon,
            applicant: {
              id: row.applicant_id,
              name: row.applicantName,
              avatar: row.applicantAvatar
            },
            currentStep: row.current_step,
            status: row.status,
            createdAt: row.created_at
          })),
          total: parseInt(countResult.rows[0].count),
          page,
          limit
        }
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '获取待审批列表失败' })
    }
  })

  // 获取我发起的审批
  fastify.get('/my-applications', async (request: FastifyRequest<{ Querystring: { status?: string, page?: number, limit?: number } }>, reply: FastifyReply) => {
    try {
      // @ts-ignore
      const userId = request.user?.id
      const { status, page = 1, limit = 20 } = request.query
      const offset = (page - 1) * limit

      let query = `
        SELECT i.*, f.name as "flowName", f.icon as "flowIcon"
        FROM approval_instances i
        JOIN approval_flows f ON i.flow_id = f.id
        WHERE i.applicant_id = $1
      `
      const params: any[] = [userId]
      
      if (status) {
        query += ` AND i.status = $2`
        params.push(status)
      }
      
      query += ` ORDER BY i.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
      params.push(limit, offset)

      const result = await fastify.db.query(query, params)

      return {
        success: true,
        data: result.rows.map(row => ({
          id: row.id,
          flowId: row.flow_id,
          flowName: row.flowName,
          flowIcon: row.flowIcon,
          currentStep: row.current_step,
          status: row.status,
          formData: row.form_data,
          createdAt: row.created_at,
          completedAt: row.completed_at
        }))
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '获取审批列表失败' })
    }
  })

  // 提交审批
  fastify.post('/submit', async (request: FastifyRequest<{ Body: z.infer<typeof submitApprovalSchema> }>, reply: FastifyReply) => {
    try {
      const { flowId, formData } = submitApprovalSchema.parse(request.body)
      
      // @ts-ignore
      const userId = request.user?.id
      const instanceId = uuidv4()

      // 获取流程定义
      const flowResult = await fastify.db.query(`
        SELECT * FROM approval_flows WHERE id = $1 AND is_active = true
      `, [flowId])

      if (flowResult.rows.length === 0) {
        return reply.code(404).send({ success: false, error: '流程不存在或已停用' })
      }

      const flow = flowResult.rows[0]
      const flowDef = flow.flow_definition
      
      // 找到第一个审批节点
      const startNode = flowDef.nodes.find((n: any) => n.type === 'start')
      const firstApprovalNode = flowDef.nodes.find((n: any) => 
        n.type === 'approval' && startNode.nextNodes.includes(n.nodeId)
      )

      if (!firstApprovalNode) {
        return reply.code(400).send({ success: false, error: '流程配置错误' })
      }

      // 获取审批人列表
      const approverIds = await resolveApprovers(firstApprovalNode.approvers || [], userId, fastify)

      await fastify.db.query('BEGIN')

      // 创建审批实例
      await fastify.db.query(`
        INSERT INTO approval_instances 
        (id, flow_id, enterprise_id, applicant_id, form_data, current_step, current_approver_ids, status)
        VALUES ($1, $2, $3, $4, $5, 1, $6, 'pending')
      `, [
        instanceId,
        flowId,
        flow.enterprise_id,
        userId,
        JSON.stringify(formData),
        JSON.stringify(approverIds)
      ])

      // 更新流程使用次数
      await fastify.db.query(`
        UPDATE approval_flows SET usage_count = usage_count + 1 WHERE id = $1
      `, [flowId])

      // 发送通知给审批人
      for (const approverId of approverIds) {
        await fastify.db.query(`
          INSERT INTO notifications (id, user_id, type, title, content, data)
          VALUES (uuid_generate_v4(), $1, 'approval', $2, $3, $4)
        `, [
          approverId,
          `待审批：${flow.name}`,
          '您有一条新的审批待处理',
          JSON.stringify({ instanceId, flowId })
        ])
      }

      await fastify.db.query('COMMIT')

      return {
        success: true,
        data: { instanceId }
      }
    } catch (error) {
      await fastify.db.query('ROLLBACK')
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '提交审批失败' })
    }
  })

  // 审批操作（通过/拒绝/转审等）
  fastify.post('/instances/:id/action', async (
    request: FastifyRequest<{ Params: { id: string }, Body: z.infer<typeof approvalActionSchema> }>,
    reply: FastifyReply
  ) => {
    try {
      const { id } = request.params
      const actionData = approvalActionSchema.parse(request.body)
      
      // @ts-ignore
      const userId = request.user?.id

      // 获取审批实例
      const instanceResult = await fastify.db.query(`
        SELECT i.*, f.flow_definition, f.settings, f.name as "flowName"
        FROM approval_instances i
        JOIN approval_flows f ON i.flow_id = f.id
        WHERE i.id = $1
      `, [id])

      if (instanceResult.rows.length === 0) {
        return reply.code(404).send({ success: false, error: '审批不存在' })
      }

      const instance = instanceResult.rows[0]
      const currentApprovers = instance.current_approver_ids || []

      // 验证是否有权限操作
      if (!currentApprovers.includes(userId)) {
        return reply.code(403).send({ success: false, error: '您不是当前审批人' })
      }

      await fastify.db.query('BEGIN')

      // 记录操作
      await fastify.db.query(`
        INSERT INTO approval_records (id, instance_id, approver_id, step, action, comment)
        VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5)
      `, [id, userId, instance.current_step, actionData.action, actionData.comment])

      let newStatus = instance.status
      let nextStep = instance.current_step
      let nextApprovers = currentApprovers

      switch (actionData.action) {
        case 'approve':
          // 通过 - 查找下一节点
          const nextNode = findNextNode(instance.flow_definition, instance.current_step)
          if (nextNode) {
            if (nextNode.type === 'end') {
              newStatus = 'approved'
              nextStep = 0
              nextApprovers = []
            } else {
              nextStep = instance.current_step + 1
              nextApprovers = await resolveApprovers(nextNode.approvers || [], userId, fastify)
            }
          } else {
            newStatus = 'approved'
          }
          break

        case 'reject':
          newStatus = 'rejected'
          nextStep = 0
          nextApprovers = []
          break

        case 'transfer':
          if (!actionData.transferToUserId) {
            return reply.code(400).send({ success: false, error: '请指定转审目标' })
          }
          // 移除当前审批人，添加转审目标
          nextApprovers = currentApprovers.filter((id: string) => id !== userId)
          nextApprovers.push(actionData.transferToUserId)
          break

        case 'withdraw':
          if (instance.applicant_id !== userId) {
            return reply.code(403).send({ success: false, error: '只有申请人可以撤回' })
          }
          newStatus = 'withdrawn'
          nextStep = 0
          nextApprovers = []
          break
      }

      // 更新审批实例
      await fastify.db.query(`
        UPDATE approval_instances 
        SET status = $1, current_step = $2, current_approver_ids = $3,
            completed_at = CASE WHEN $1 IN ('approved', 'rejected', 'withdrawn') THEN NOW() ELSE completed_at END,
            updated_at = NOW()
        WHERE id = $4
      `, [newStatus, nextStep, JSON.stringify(nextApprovers), id])

      // 发送通知
      if (newStatus === 'approved' || newStatus === 'rejected') {
        await fastify.db.query(`
          INSERT INTO notifications (id, user_id, type, title, content)
          VALUES (uuid_generate_v4(), $1, 'approval', $2, $3)
        `, [
          instance.applicant_id,
          `审批${newStatus === 'approved' ? '通过' : '被拒绝'}：${instance.flowName}`,
          actionData.comment || ''
        ])
      } else if (actionData.action === 'approve' && nextApprovers.length > 0) {
        for (const approverId of nextApprovers) {
          await fastify.db.query(`
            INSERT INTO notifications (id, user_id, type, title, content)
            VALUES (uuid_generate_v4(), $1, 'approval', $2, $3)
          `, [
            approverId,
            `待审批：${instance.flowName}`,
            '您有一条新的审批待处理'
          ])
        }
      }

      await fastify.db.query('COMMIT')

      return { success: true }
    } catch (error) {
      await fastify.db.query('ROLLBACK')
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '操作失败' })
    }
  })

  // 获取审批详情
  fastify.get('/instances/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params

      const result = await fastify.db.query(`
        SELECT i.*, f.name as "flowName", f.icon as "flowIcon", f.form_schema as "formSchema",
               u.name as "applicantName", u.avatar_url as "applicantAvatar"
        FROM approval_instances i
        JOIN approval_flows f ON i.flow_id = f.id
        JOIN users u ON i.applicant_id = u.id
        WHERE i.id = $1
      `, [id])

      if (result.rows.length === 0) {
        return reply.code(404).send({ success: false, error: '审批不存在' })
      }

      // 获取审批记录
      const recordsResult = await fastify.db.query(`
        SELECT r.*, u.name as "approverName", u.avatar_url as "approverAvatar"
        FROM approval_records r
        JOIN users u ON r.approver_id = u.id
        WHERE r.instance_id = $1
        ORDER BY r.created_at
      `, [id])

      const instance = result.rows[0]

      return {
        success: true,
        data: {
          id: instance.id,
          flowId: instance.flow_id,
          flowName: instance.flowName,
          flowIcon: instance.flowIcon,
          applicant: {
            id: instance.applicant_id,
            name: instance.applicantName,
            avatar: instance.applicantAvatar
          },
          formData: instance.form_data,
          formSchema: instance.formSchema,
          currentStep: instance.current_step,
          currentApproverIds: instance.current_approver_ids,
          status: instance.status,
          records: recordsResult.rows.map(r => ({
            id: r.id,
            step: r.step,
            action: r.action,
            comment: r.comment,
            approver: {
              id: r.approver_id,
              name: r.approverName,
              avatar: r.approverAvatar
            },
            createdAt: r.created_at
          })),
          createdAt: instance.created_at,
          completedAt: instance.completed_at
        }
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: '获取审批详情失败' })
    }
  })
}

// 辅助函数：解析审批人
async function resolveApprovers(
  approvers: Array<{ type: string; userId?: string; roleId?: string; departmentId?: string; level?: number }>,
  applicantId: string,
  fastify: FastifyInstance
): Promise<string[]> {
  const result: string[] = []

  for (const approver of approvers) {
    switch (approver.type) {
      case 'user':
        if (approver.userId) result.push(approver.userId)
        break
      
      case 'role':
        // 查询角色对应的用户
        if (approver.roleId) {
          const roleUsers = await fastify.db.query(`
            SELECT user_id FROM user_roles WHERE role_id = $1
          `, [approver.roleId])
          roleUsers.rows.forEach(r => result.push(r.user_id))
        }
        break
      
      case 'department':
        // 查询部门负责人
        if (approver.departmentId) {
          const deptHead = await fastify.db.query(`
            SELECT head_id FROM departments WHERE id = $1
          `, [approver.departmentId])
          if (deptHead.rows[0]?.head_id) {
            result.push(deptHead.rows[0].head_id)
          }
        }
        break
      
      case 'supervisor':
        // 查询直属上级
        if (approver.level) {
          const supervisor = await fastify.db.query(`
            WITH RECURSIVE supervisor_chain AS (
              SELECT id, supervisor_id, 1 as level
              FROM users WHERE id = $1
              UNION ALL
              SELECT u.id, u.supervisor_id, sc.level + 1
              FROM users u
              JOIN supervisor_chain sc ON u.id = sc.supervisor_id
              WHERE sc.level < $2
            )
            SELECT id FROM supervisor_chain WHERE level = $2
          `, [applicantId, approver.level])
          
          if (supervisor.rows[0]?.id) {
            result.push(supervisor.rows[0].id)
          }
        }
        break
    }
  }

  return [...new Set(result)] // 去重
}

// 辅助函数：查找下一节点
function findNextNode(flowDefinition: any, currentStep: number): any {
  const nodes = flowDefinition.nodes
  const edges = flowDefinition.edges
  
  // 找到当前步骤对应的节点
  const currentNode = nodes.find((n: any, index: number) => 
    n.type === 'approval' && index === currentStep
  )
  
  if (!currentNode) return null
  
  // 查找下一步节点
  const nextEdges = edges.filter((e: any) => e.source === currentNode.nodeId)
  if (nextEdges.length === 0) return null
  
  // 简化处理：取第一个下一个节点
  const nextNodeId = nextEdges[0].target
  return nodes.find((n: any) => n.nodeId === nextNodeId)
}
