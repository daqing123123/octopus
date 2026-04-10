-- ============================================================
-- 008_new_features.sql
-- 新功能数据表：知识库、工作流、消息摘要等
-- ============================================================

-- 1. 知识文档表
CREATE TABLE IF NOT EXISTS knowledge_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(100) DEFAULT 'general',
    tags JSONB DEFAULT '[]',
    source VARCHAR(100),  -- manual, import, auto_sync
    metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_knowledge_enterprise ON knowledge_documents(enterprise_id);
CREATE INDEX idx_knowledge_category ON knowledge_documents(enterprise_id, category);
CREATE INDEX idx_knowledge_created ON knowledge_documents(enterprise_id, created_at DESC);

-- 2. 知识搜索日志表
CREATE TABLE IF NOT EXISTS knowledge_search_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    enterprise_id UUID NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    results_count INTEGER DEFAULT 0,
    response_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_search_user ON knowledge_search_logs(user_id);
CREATE INDEX idx_search_enterprise ON knowledge_search_logs(enterprise_id);
CREATE INDEX idx_search_date ON knowledge_search_logs(enterprise_id, created_at DESC);

-- 3. 工作流执行日志表
CREATE TABLE IF NOT EXISTS workflow_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL,
    connection_id UUID REFERENCES user_enterprise_connections(id),
    user_id UUID NOT NULL REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'running',  -- running, success, failed
    inputs JSONB DEFAULT '{}',
    outputs JSONB DEFAULT '{}',
    error JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

CREATE INDEX idx_workflow_executions_workflow ON workflow_executions(workflow_id);
CREATE INDEX idx_workflow_executions_user ON workflow_executions(user_id);
CREATE INDEX idx_workflow_executions_date ON workflow_executions(created_at DESC);

-- 4. 入职模板表（增强版）
ALTER TABLE onboarding_templates ADD COLUMN IF NOT EXISTS tasks JSONB DEFAULT '[]';
ALTER TABLE onboarding_templates ADD COLUMN IF NOT EXISTS estimated_days INTEGER DEFAULT 7;
ALTER TABLE onboarding_templates ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 5. 员工入职任务表
CREATE TABLE IF NOT EXISTS employee_onboarding (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    enterprise_id UUID NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    tasks JSONB DEFAULT '[]',  -- [{id, title, description, category, status, order, completedAt}]
    started_at TIMESTAMP DEFAULT NOW(),
    estimated_end_date TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, enterprise_id)
);

CREATE INDEX idx_employee_onboarding_user ON employee_onboarding(user_id);
CREATE INDEX idx_employee_onboarding_enterprise ON employee_onboarding(enterprise_id);

-- 6. 消息摘要表
CREATE TABLE IF NOT EXISTS message_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    enterprise_id UUID NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    summary_date DATE NOT NULL,
    summary_data JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, enterprise_id, summary_date)
);

CREATE INDEX idx_message_summaries_user ON message_summaries(user_id);
CREATE INDEX idx_message_summaries_date ON message_summaries(user_id, summary_date DESC);

-- 7. 团队活动日志表
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    enterprise_id UUID NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,  -- onboarding_task, document_created, task_completed, meeting, etc.
    content TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_activity_enterprise ON activity_logs(enterprise_id);
CREATE INDEX idx_activity_user ON activity_logs(user_id);
CREATE INDEX idx_activity_date ON activity_logs(enterprise_id, created_at DESC);
CREATE INDEX idx_activity_type ON activity_logs(enterprise_id, type);

-- 8. 简历优化记录表
CREATE TABLE IF NOT EXISTS resume_optimizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    target_position VARCHAR(200),
    original_resume TEXT,
    optimized_resume TEXT,
    optimize_type VARCHAR(20) DEFAULT 'full',  -- full, summary, skills, achievements
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_resume_optimization_user ON resume_optimizations(user_id);
CREATE INDEX idx_resume_optimization_date ON resume_optimizations(user_id, created_at DESC);

-- 9. 通讯录偏好设置
CREATE TABLE IF NOT EXISTS directory_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    enterprise_id UUID NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    default_view VARCHAR(20) DEFAULT 'grid',  -- grid, list, org_tree
    show_departments TEXT[],  -- 要显示的部门
    hidden_fields TEXT[],  -- 隐藏的字段
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, enterprise_id)
);

-- 10. 消息频道成员表（用于确定谁能看到哪些消息）
CREATE TABLE IF NOT EXISTS channel_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL,  -- 引用 messages 表的 channel 字段
    user_id UUID NOT NULL REFERENCES users(id),
    joined_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(channel_id, user_id)
);

CREATE INDEX idx_channel_members_channel ON channel_members(channel_id);
CREATE INDEX idx_channel_members_user ON channel_members(user_id);

-- ============================================================
-- 插入示例数据
-- ============================================================

-- 示例入职模板（管理员可在后台修改）
INSERT INTO onboarding_templates (id, enterprise_id, name, description, tasks, estimated_days, is_active, created_by)
VALUES (
    gen_random_uuid(),
    NULL,  -- 需要替换为实际企业ID
    '标准新员工入职流程',
    '包含所有基础入职任务的引导流程',
    '[
        {"id": "1", "title": "📋 阅读公司介绍", "description": "了解公司历史、愿景、价值观", "category": "了解公司", "order": 1},
        {"id": "2", "title": "👥 认识团队成员", "description": "和团队成员打个招呼", "category": "融入团队", "order": 2},
        {"id": "3", "title": "🔑 获取工作账号", "description": "开通邮箱、Slack等账号", "category": "账号开通", "order": 3},
        {"id": "4", "title": "💻 配置工作环境", "description": "安装必要的软件和工具", "category": "准备工作", "order": 4},
        {"id": "5", "title": "📖 学习工作流程", "description": "了解日常工作流程和规范", "category": "学习流程", "order": 5},
        {"id": "6", "title": "📝 签署必要文件", "description": "完成入职合同、保密协议等", "category": "行政手续", "order": 6},
        {"id": "7", "title": "🎯 了解岗位职责", "description": "和主管确认工作目标和期望", "category": "明确目标", "order": 7},
        {"id": "8", "title": "💬 参加入职培训", "description": "完成新员工培训课程", "category": "培训学习", "order": 8}
    ]'::jsonb,
    7,
    true,
    NULL
) ON CONFLICT DO NOTHING;

-- 示例知识库文档
INSERT INTO knowledge_documents (id, enterprise_id, title, content, category, tags, source, created_at)
VALUES 
    (gen_random_uuid(), NULL, '公司介绍', '这是一份关于公司历史、愿景和价值观的介绍文档。\n\n【公司历史】\n成立于2010年，专注于企业协作工具研发。\n\n【愿景】\n让团队协作更简单、更高效。\n\n【价值观】\n1. 用户第一\n2. 持续创新\n3. 开放协作', 'general', '["公司介绍", "价值观", "历史"]', 'manual', NOW()),
    (gen_random_uuid(), NULL, '请假制度', '员工请假制度说明：\n\n【年假】\n- 工作满1年：5天年假\n- 工作满3年：10天年假\n- 工作满5年：15天年假\n\n【请假流程】\n1. 在OA系统提交请假申请\n2. 主管审批\n3. HR备案\n\n【注意事项】\n- 提前3天申请\n- 急事可事后补假', 'hr', '["请假", "休假", "制度"]', 'manual', NOW()),
    (gen_random_uuid(), NULL, '报销流程', '费用报销流程说明：\n\n【报销范围】\n- 差旅费\n- 交通费\n- 办公用品\n- 业务招待费\n\n【报销流程】\n1. 收集发票\n2. 填写报销单\n3. 主管审批\n4. 财务审批\n5. 出纳付款\n\n【注意事项】\n- 月底前提交当月报销\n- 发票日期需在90天内', 'finance', '["报销", "费用", "财务"]', 'manual', NOW())
ON CONFLICT DO NOTHING;

COMMENT ON TABLE knowledge_documents IS '企业知识库文档表';
COMMENT ON TABLE workflow_executions IS '工作流执行日志表';
COMMENT ON TABLE employee_onboarding IS '员工入职任务表';
COMMENT ON TABLE message_summaries IS '每日消息摘要表';
COMMENT ON TABLE activity_logs IS '团队活动日志表';
COMMENT ON TABLE resume_optimizations IS '简历优化记录表';
