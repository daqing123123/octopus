-- ============================================
-- 八爪鱼 Phase 2: 触手与八爪鱼员工生命周期
-- Migration 005: 员工档案 & 入离职管理
-- ============================================

-- ============================================
-- 【触手档案】个人员工档案
-- ============================================

-- 员工档案（触手侧的个人工作档案）
CREATE TABLE employee_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    personal_claw_id UUID REFERENCES personal_claws(id),
    
    -- 基本信息
    real_name VARCHAR(100),                    -- 真实姓名（可与平台昵称不同）
    gender VARCHAR(10),
    birthday DATE,
    id_card_number VARCHAR(20),                 -- 身份证号（加密存储）
    id_card_front_url TEXT,                    -- 身份证正面
    id_card_back_url TEXT,                     -- 身份证背面
    
    -- 证件照
    avatar_url TEXT,                            -- 工牌照（触手保存，公司可读）
    
    -- 联系信息
    personal_phone VARCHAR(20),
    emergency_contact_name VARCHAR(100),
    emergency_contact_phone VARCHAR(20),
    
    -- 工作信息（可公开给公司）
    work_email VARCHAR(255),
    employee_number VARCHAR(50),                 -- 工号
    
    -- 学历信息
    education JSONB DEFAULT '[]',              -- [{school, major, degree, startYear, endYear}]
    
    -- 工作经历
    work_experience JSONB DEFAULT '[]',        -- [{company, title, startDate, endDate, description}]
    
    -- 技能标签
    skills JSONB DEFAULT '[]',                  -- ["JavaScript", "React", "Python"]
    
    -- 简历文件
    resume_url TEXT,                           -- 个人简历 PDF
    resume_parsed JSONB DEFAULT '{}',            -- 解析后的简历结构化数据
    
    -- 入职信息
    onboarded_at TIMESTAMP,                     -- 正式入职日期
    probation_end_date DATE,                   -- 试用期结束日期
    
    -- 状态
    profile_status VARCHAR(20) DEFAULT 'incomplete' 
        CHECK (profile_status IN ('incomplete', 'complete', 'verified')),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_employee_profiles_user ON employee_profiles(user_id);
CREATE INDEX idx_employee_profiles_claw ON employee_profiles(personal_claw_id);

-- ============================================
-- 【触手附件】员工证件/文件库
-- ============================================

CREATE TABLE employee_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- 所属企业（null=仅触手持有，UUID=公司持有）
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    
    -- 文档类型
    doc_type VARCHAR(50) NOT NULL,              -- avatar/id_card/resume/contract/certificate/other
    doc_name VARCHAR(255) NOT NULL,             -- 文件名
    file_url TEXT NOT NULL,                    -- 文件URL
    file_size BIGINT,                           -- 文件大小
    mime_type VARCHAR(100),                     -- MIME类型
    
    -- 可见性
    visibility VARCHAR(20) DEFAULT 'private'    -- private/company_only/public
        CHECK (visibility IN ('private', 'company_only', 'public')),
    
    -- 元数据
    metadata JSONB DEFAULT '{}',                -- {ocr_result, verified, expires_at}
    
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP,
    verified_by UUID REFERENCES users(id),
    expires_at TIMESTAMP                       -- 证件过期时间
);

CREATE INDEX idx_employee_docs_user ON employee_documents(user_id);
CREATE INDEX idx_employee_docs_enterprise ON employee_documents(enterprise_id);
CREATE INDEX idx_employee_docs_type ON employee_documents(doc_type);

-- ============================================
-- 【入职模板】公司入职清单模板
-- ============================================

CREATE TABLE onboarding_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id),
    
    name VARCHAR(200) NOT NULL,                 -- 模板名称：常规入职 / 技术岗入职 / 销售入职
    description TEXT,
    icon VARCHAR(50) DEFAULT '📋',
    
    -- 清单项
    items JSONB DEFAULT '[]',                  -- [{id, title, description, category, required, days}]
    -- categories: setup/paperwork/training/team/introduction
    
    -- 适用条件（JSON Schema）
    conditions JSONB DEFAULT '{}',              -- {departments: [], roles: []}
    
    is_default BOOLEAN DEFAULT FALSE,            -- 是否为默认模板
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_onboarding_templates_enterprise ON onboarding_templates(enterprise_id);

-- ============================================
-- 【触手入职】员工入职任务（实例）
-- ============================================

CREATE TABLE employee_onboarding_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES users(id) ON DELETE CASCADE,
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    template_id UUID REFERENCES onboarding_templates(id),
    personal_claw_id UUID REFERENCES personal_claws(id),
    enterprise_claw_id UUID REFERENCES enterprise_claws(id),
    
    -- 任务信息
    item_id VARCHAR(50) NOT NULL,               -- 模板中的item ID
    title VARCHAR(200) NOT NULL,
    description TEXT,
    category VARCHAR(50),                        -- setup/paperwork/training/team/introduction
    
    -- 状态
    status VARCHAR(20) DEFAULT 'pending' 
        CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
    
    required BOOLEAN DEFAULT TRUE,
    
    -- 截止时间
    due_days INT,                               -- 入职后第N天截止
    due_date DATE,
    completed_at TIMESTAMP,
    
    -- 提交材料
    submitted_docs JSONB DEFAULT '[]',         -- [{doc_type, file_url, uploaded_at}]
    
    -- 审批信息
    need_approval BOOLEAN DEFAULT FALSE,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP,
    approval_note TEXT,
    
    -- Claw 建议
    claw_suggestion TEXT,                       -- Claw 基于员工档案给出的个性化建议
    
    created_at TIMAWESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(employee_id, enterprise_id, item_id)
);

CREATE INDEX idx_onboarding_tasks_employee ON employee_onboarding_tasks(employee_id);
CREATE INDEX idx_onboarding_tasks_enterprise ON employee_onboarding_tasks(enterprise_id);
CREATE INDEX idx_onboarding_tasks_status ON employee_onboarding_tasks(status);

-- ============================================
-- 【离职物品】离职清点清单
-- ============================================

CREATE TABLE offboarding_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES users(id) ON DELETE CASCADE,
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    personal_claw_id UUID REFERENCES personal_claws(id),
    
    -- 物品类型
    item_type VARCHAR(50) NOT NULL,             -- equipment/access/badge/key/software/account/document
    item_name VARCHAR(200) NOT NULL,            -- MacBook Pro 16寸 / 门禁卡 / 企业微信
    
    -- 物品详情
    description TEXT,
    serial_number VARCHAR(100),                  -- 设备序列号
    assigned_at DATE,                           -- 分配日期
    estimated_value DECIMAL(10,2),              -- 预估价值
    
    -- 归还状态
    return_status VARCHAR(20) DEFAULT 'not_returned'
        CHECK (return_status IN ('not_returned', 'pending', 'returned', 'lost', 'compensation')),
    returned_at TIMESTAMP,
    returned_to UUID REFERENCES users(id),      -- 接收人
    return_note TEXT,
    return_photos JSONB DEFAULT '[]',           -- 归还照片
    
    -- 赔偿信息
    compensation_amount DECIMAL(10,2),
    compensation_status VARCHAR(20) DEFAULT 'none'
        CHECK (compensation_status IN ('none', 'pending', 'paid', 'waived')),
    
    -- 账号类物品特殊字段
    account_username VARCHAR(255),              -- 账号名（如企业邮箱前缀）
    revoke_status VARCHAR(20) DEFAULT 'active'
        CHECK (revoke_status IN ('active', 'pending', 'revoked', 'transferred')),
    revoke_at TIMESTAMP,                        -- 计划停用时间
    revoked_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_offboarding_items_employee ON offboarding_items(employee_id);
CREATE INDEX idx_offboarding_items_enterprise ON offboarding_items(enterprise_id);
CREATE INDEX idx_offboarding_items_type ON offboarding_items(item_type);
CREATE INDEX idx_offboarding_items_status ON offboarding_items(return_status);

-- ============================================
-- 【员工生命周期记录】
-- ============================================

CREATE TABLE employee_lifecycle_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES users(id) ON DELETE CASCADE,
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    personal_claw_id UUID REFERENCES personal_claws(id),
    enterprise_claw_id UUID REFERENCES enterprise_claws(id),
    
    -- 事件类型
    event_type VARCHAR(50) NOT NULL,
    -- pre_hire/offer_sent/onboarding_day/week_1/month_1/quarter_1/annual/
    -- role_change/promotion/demotion/transfer/
    -- offboarding_initiated/offboarding_processing/offboarded/
    -- re_onboard/contract_renewal
    
    event_name VARCHAR(200) NOT NULL,            -- 事件名称
    event_date DATE NOT NULL,                   -- 事件日期
    description TEXT,
    
    -- 关联的触手/大脑操作
    action_taken VARCHAR(100),                   -- connected/disconnected/synced/updated
    action_details JSONB DEFAULT '{}',
    
    -- 审批/流程关联
    related_task_id UUID,                        -- 可能关联某个任务
    related_document_id UUID,                    -- 可能关联某个文档
    
    -- Claw 记录
    claw_insight TEXT,                          -- Claw 对该事件的智能解读
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_lifecycle_employee ON employee_lifecycle_records(employee_id);
CREATE INDEX idx_lifecycle_enterprise ON employee_lifecycle_records(enterprise_id);
CREATE INDEX idx_lifecycle_type ON employee_lifecycle_records(event_type);
CREATE INDEX idx_lifecycle_date ON employee_lifecycle_records(event_date DESC);

-- ============================================
-- 【公司公共信息】触手可读取的公开信息
-- ============================================

CREATE TABLE company_public_info (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    
    -- 信息类别
    category VARCHAR(50) NOT NULL,               -- about/values/mission/vision/culture/rules/org_chart/benefits
    
    -- 内容
    title VARCHAR(200) NOT NULL,
    content TEXT,                                -- 富文本/Markdown
    content_html TEXT,                           -- HTML 版本
    
    -- 附件
    attachments JSONB DEFAULT '[]',             -- [{name, url, size}]
    
    -- 可见范围
    visibility VARCHAR(20) DEFAULT 'all_members'
        CHECK (visibility IN ('admins_only', 'all_members', 'public')),
    
    -- 版本控制
    version INT DEFAULT 1,
    change_summary TEXT,
    
    -- 触手同步标记
    synced_to_claws BOOLEAN DEFAULT FALSE,       -- 是否已同步到所有触手
    
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(enterprise_id, category)
);

CREATE INDEX idx_company_public_info_enterprise ON company_public_info(enterprise_id);
CREATE INDEX idx_company_public_info_category ON company_public_info(category);

-- ============================================
-- 【公告板】
-- ============================================

CREATE TABLE announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id),
    
    title VARCHAR(300) NOT NULL,
    content TEXT NOT NULL,
    content_html TEXT,
    
    -- 分类
    category VARCHAR(50) DEFAULT 'general',      -- general/hr/it/admin/system/event/warning
    
    -- 优先级
    priority VARCHAR(20) DEFAULT 'normal'         -- low/normal/important/urgent
        CHECK (priority IN ('low', 'normal', 'important', 'urgent')),
    
    -- 可见范围
    visibility VARCHAR(20) DEFAULT 'all',        -- all/departments/roles/individuals
    visible_to JSONB DEFAULT '[]',               -- [userId/departmentId/roleId]
    
    -- 推送设置
    push_to_claws BOOLEAN DEFAULT TRUE,         -- 是否推送到个人 Claw
    push_channels JSONB DEFAULT '["in_app", "claw"]', -- 推送渠道
    
    -- 附件
    attachments JSONB DEFAULT '[]',
    
    -- 状态
    status VARCHAR(20) DEFAULT 'published'
        CHECK (status IN ('draft', 'published', 'archived')),
    
    -- 阅读追踪
    read_count INT DEFAULT 0,
    read_by JSONB DEFAULT '[]',                 -- [userId]
    
    pinned BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_announcements_enterprise ON announcements(enterprise_id);
CREATE INDEX idx_announcements_status ON announcements(status);
CREATE INDEX idx_announcements_priority ON announcements(priority);
CREATE INDEX idx_announcements_pinned ON announcements(pinned);
CREATE INDEX idx_announcements_created ON announcements(created_at DESC);

-- ============================================
-- 【触手知识库】员工个人知识库
-- ============================================

CREATE TABLE personal_knowledge_base (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    enterprise_id UUID REFERENCES enterprises(id),  -- 关联企业（可为空=纯个人）
    
    title VARCHAR(255) NOT NULL,
    content TEXT,
    content_html TEXT,
    
    -- 分类
    category VARCHAR(100),                        -- 工作日志/项目笔记/会议纪要/学习笔记
    
    -- 标签
    tags JSONB DEFAULT '[]',
    
    -- 可见性
    visibility VARCHAR(20) DEFAULT 'private'     -- private/team/enterprise/public
        CHECK (visibility IN ('private', 'team', 'enterprise', 'public')),
    
    -- 关联
    related_enterprise_ids JSONB DEFAULT '[]',   -- 关联的企业ID列表
    related_project_id UUID,                     -- 关联项目
    
    -- Claw 分析
    ai_summary TEXT,                            -- AI 自动摘要
    ai_tags JSONB DEFAULT '[]',                  -- AI 提取的标签
    
    -- 版本
    version INT DEFAULT 1,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_personal_kb_user ON personal_knowledge_base(user_id);
CREATE INDEX idx_personal_kb_enterprise ON personal_knowledge_base(enterprise_id);
CREATE INDEX idx_personal_kb_category ON personal_knowledge_base(category);
CREATE INDEX idx_personal_kb_visibility ON personal_knowledge_base(visibility);

-- ============================================
-- 【信息同步日志】触手↔大脑 同步记录
-- ============================================

CREATE TABLE info_sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    personal_claw_id UUID REFERENCES personal_claws(id),
    enterprise_claw_id UUID REFERENCES enterprise_claws(id),
    
    -- 同步方向
    direction VARCHAR(20) NOT NULL,              -- personal_to_company / company_to_personal
    -- personal_to_company: 触手同步到大脑（简历/证件照/技能）
    -- company_to_personal: 大脑同步到触手（入职清单/公司介绍/培训资料）
    
    -- 同步内容
    data_type VARCHAR(50) NOT NULL,             -- profile/resume/avatar/skill/onboarding/offboarding/knowledge
    
    -- 数据摘要
    data_summary JSONB DEFAULT '{}',             -- {count: 10, fields: ['resume', 'avatar']}
    
    -- 脱敏处理
    sanitized BOOLEAN DEFAULT TRUE,              -- 是否经过脱敏
    sanitization_rules JSONB DEFAULT '{}',       -- 应用了哪些脱敏规则
    
    -- 状态
    status VARCHAR(20) DEFAULT 'success'
        CHECK (status IN ('pending', 'success', 'partial', 'failed')),
    
    error_message TEXT,
    retry_count INT DEFAULT 0,
    
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sync_logs_user ON info_sync_logs(user_id);
CREATE INDEX idx_sync_logs_enterprise ON info_sync_logs(enterprise_id);
CREATE INDEX idx_sync_logs_direction ON info_sync_logs(direction);
CREATE INDEX idx_sync_logs_type ON info_sync_logs(data_type);
CREATE INDEX idx_sync_logs_time ON info_sync_logs(synced_at DESC);

-- ============================================
-- 【企业知识库】公司级知识（触手可读）
-- ============================================

CREATE TABLE enterprise_knowledge_base (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id),
    
    space VARCHAR(100) DEFAULT 'general',        -- general/hr/it/sales/product/engineering
    
    title VARCHAR(255) NOT NULL,
    content TEXT,
    content_html TEXT,
    
    tags JSONB DEFAULT '[]',
    
    -- 可见性
    visibility VARCHAR(20) DEFAULT 'all_members'
        CHECK (visibility IN ('admins_only', 'all_members', 'departments', 'individuals')),
    visible_to JSONB DEFAULT '[]',
    
    -- Claw 推荐
    recommended_for JSONB DEFAULT '[]',          -- 基于技能标签推荐给哪些员工
    
    -- 统计
    view_count INT DEFAULT 0,
    liked_count INT DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_enterprise_kb_enterprise ON enterprise_knowledge_base(enterprise_id);
CREATE INDEX idx_enterprise_kb_space ON enterprise_knowledge_base(space);
CREATE INDEX idx_enterprise_kb_visibility ON enterprise_knowledge_base(visibility);

-- ============================================
-- 【入职进度快照】企业 Claw 追踪所有触手入职状态
-- ============================================

CREATE TABLE onboarding_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    enterprise_claw_id UUID REFERENCES enterprise_claws(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES users(id) ON DELETE CASCADE,
    personal_claw_id UUID REFERENCES personal_claws(id),
    
    -- 快照数据
    snapshot_data JSONB NOT NULL,                 -- {completed: 3, total: 10, tasks: [...]}
    
    -- 进度
    completion_rate DECIMAL(5,2) DEFAULT 0,      -- 0-100
    overdue_tasks INT DEFAULT 0,                 -- 逾期任务数
    
    -- Claw 洞察
    claw_insights JSONB DEFAULT '[]',            -- [{type, content, created_at}]
    
    snapshot_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_onboarding_snapshots_claw ON onboarding_snapshots(enterprise_claw_id);
CREATE INDEX idx_onboarding_snapshots_employee ON onboarding_snapshots(employee_id);
CREATE INDEX idx_onboarding_snapshots_date ON onboarding_snapshots(snapshot_date DESC);

-- ============================================
-- 【触手状态总览】企业 Claw 实时追踪所有触手
-- ============================================

CREATE TABLE claw_connection_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    enterprise_claw_id UUID REFERENCES enterprise_claws(id) ON DELETE CASCADE,
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    personal_claw_id UUID REFERENCES personal_claws(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- 连接状态
    connection_status VARCHAR(20) DEFAULT 'connected'
        CHECK (connection_status IN ('connected', 'idle', 'disconnected')),
    last_active_at TIMESTAMP,
    last_synced_at TIMESTAMP,
    
    -- 触手健康
    claw_health VARCHAR(20) DEFAULT 'healthy'
        CHECK (claw_health IN ('healthy', 'warning', 'error')),
    claw_health_details JSONB DEFAULT '{}',
    
    -- 入职状态
    onboarding_status VARCHAR(20)
        CHECK (onboarding_status IN ('not_started', 'in_progress', 'completed')),
    onboarding_completion_rate DECIMAL(5,2) DEFAULT 0,
    
    -- 数据同步状态
    sync_status JSONB DEFAULT '{}',              -- {profile: 'synced', resume: 'synced', ...}
    pending_sync_items JSONB DEFAULT '[]',      -- 待同步项列表
    
    -- Claw 同步给员工的信息未读数
    unread_claw_notifications INT DEFAULT 0,
    
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(enterprise_claw_id, personal_claw_id)
);

CREATE INDEX idx_claw_connection_enterprise ON claw_connection_status(enterprise_id);
CREATE INDEX idx_claw_connection_claw ON claw_connection_status(enterprise_claw_id);
CREATE INDEX idx_claw_connection_status ON claw_connection_status(connection_status);
