-- ================================================
-- 012_offboarding.sql - 离职阶段功能
-- ================================================
-- 功能：
-- 1. 智能交接清单（岗位自动生成）
-- 2. 一键权限回收
-- 3. 数据导出工具
-- 4. 离职满意度调查
-- 5. 经验带走（项目经验→个人记忆）
-- ================================================

-- 交接清单模板
CREATE TABLE IF NOT EXISTS offboarding_checklist_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL, -- 模板名称，如"产品经理交接清单"
    description TEXT,
    category VARCHAR(50) DEFAULT 'general', -- general通用/tech技术/mgmt管理
    is_system BOOLEAN DEFAULT FALSE, -- 是否系统内置模板
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 交接清单模板项
CREATE TABLE IF NOT EXISTS offboarding_checklist_template_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES offboarding_checklist_templates(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL, -- 交接项标题
    description TEXT, -- 交接说明
    item_type VARCHAR(50) DEFAULT 'task', -- task任务/document文档/file文件/system系统/person人员
    priority INTEGER DEFAULT 3, -- 1紧急 2重要 3普通
    assignee_type VARCHAR(50) DEFAULT 'manager', -- manager直属上级 HR hr admin行政 it技术
    estimated_minutes INTEGER DEFAULT 30, -- 预计耗时（分钟）
    requires_approval BOOLEAN DEFAULT FALSE, -- 是否需要审批确认
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 员工离职交接清单实例
CREATE TABLE IF NOT EXISTS employee_offboarding_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES users(id),
    enterprise_id UUID NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    template_id UUID REFERENCES offboarding_checklist_templates(id),
    connection_id UUID REFERENCES user_enterprise_connections(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending进行中 completed已完成 cancelled已取消
    start_date DATE, -- 交接开始日期
    complete_date DATE, -- 实际完成日期
    created_by UUID REFERENCES users(id), -- 创建人（HR或管理员）
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(employee_id, enterprise_id, connection_id)
);

-- 交接清单项实例
CREATE TABLE IF NOT EXISTS offboarding_checklist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checklist_id UUID NOT NULL REFERENCES employee_offboarding_checklists(id) ON DELETE CASCADE,
    template_item_id UUID REFERENCES offboarding_checklist_template_items(id),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    item_type VARCHAR(50) DEFAULT 'task',
    priority INTEGER DEFAULT 3,
    assignee_id UUID REFERENCES users(id), -- 实际接手人
    status VARCHAR(50) DEFAULT 'pending', -- pending待完成 in_progress进行中 completed已完成 verified已确认
    due_date DATE,
    completed_at TIMESTAMP,
    completed_by UUID REFERENCES users(id),
    verification_notes TEXT, -- 验收备注
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 权限回收记录
CREATE TABLE IF NOT EXISTS offboarding_permission_revocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checklist_id UUID REFERENCES employee_offboarding_checklists(id) ON DELETE SET NULL,
    employee_id UUID NOT NULL REFERENCES users(id),
    enterprise_id UUID NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    permission_type VARCHAR(100) NOT NULL, -- system_access/file_access/doc_access/calendar/task/approval
    resource_id VARCHAR(200), -- 具体资源ID（如文件ID、文件夹ID）
    resource_name VARCHAR(200), -- 资源名称（冗余存储，方便展示）
    previous_holder UUID REFERENCES users(id), -- 权限转移给谁（如无则回收）
    revoked_at TIMESTAMP DEFAULT NOW(),
    revoked_by UUID REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'completed', -- pending待执行 completed已完成 failed失败
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 权限回收配置（记录哪些权限需要回收）
CREATE TABLE IF NOT EXISTS offboarding_permission_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    permission_type VARCHAR(100) NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    auto_transfer_to UUID REFERENCES users(id), -- 自动转移给谁（直属上级/指定人）
    require_approval BOOLEAN DEFAULT FALSE,
    UNIQUE(enterprise_id, permission_type)
);

-- 数据导出记录
CREATE TABLE IF NOT EXISTS data_export_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES users(id),
    enterprise_id UUID NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    checklist_id UUID REFERENCES employee_offboarding_checklists(id),
    export_type VARCHAR(50) NOT NULL, -- documents聊天/files文件/calendar日程/tasks任务/all全部
    file_format VARCHAR(20) DEFAULT 'zip', -- zip/pdf/csv/json
    status VARCHAR(50) DEFAULT 'pending', -- pending待处理 processing处理中 completed已完成 failed失败
    file_url TEXT, -- 下载地址
    file_size_bytes BIGINT,
    download_count INTEGER DEFAULT 0,
    download_expires_at TIMESTAMP, -- 下载链接过期时间
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '30 days')
);

-- 导出内容记录（每条导出的具体内容）
CREATE TABLE IF NOT EXISTS data_export_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    export_id UUID NOT NULL REFERENCES data_export_records(id) ON DELETE CASCADE,
    resource_type VARCHAR(50) NOT NULL, -- document/message/file/task/calendar/okr/approval
    resource_id VARCHAR(200) NOT NULL,
    resource_name VARCHAR(200),
    exported BOOLEAN DEFAULT FALSE,
    export_error TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 离职满意度调查
CREATE TABLE IF NOT EXISTS offboarding_surveys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES users(id),
    checklist_id UUID REFERENCES employee_offboarding_checklists(id),
    survey_type VARCHAR(50) DEFAULT 'exit', -- exit离职调查 probation试用期 improve改善建议
    status VARCHAR(50) DEFAULT 'pending', -- pending待填写 submitted已提交 acknowledged已确认
    anonymous BOOLEAN DEFAULT TRUE, -- 是否匿名
    submitted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 离职满意度调查答案
CREATE TABLE IF NOT EXISTS offboarding_survey_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id UUID NOT NULL REFERENCES offboarding_surveys(id) ON DELETE CASCADE,
    question_id UUID NOT NULL, -- 问题ID（关联问卷模板）
    answer_type VARCHAR(50) NOT NULL, -- rating评分 text文本 multiple_choice多选
    rating_value INTEGER, -- 1-5评分
    text_value TEXT, -- 文本回答
    multiple_choice_values TEXT[], -- 多选答案
    created_at TIMESTAMP DEFAULT NOW()
);

-- 经验带走记录
CREATE TABLE IF NOT EXISTS experience_transfer_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES users(id),
    enterprise_id UUID NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    checklist_id UUID REFERENCES employee_offboarding_checklists(id),
    -- 项目经验
    project_id UUID,
    project_name VARCHAR(200),
    project_description TEXT,
    role VARCHAR(100),
    key_achievements TEXT, -- 关键成就
    skills_used TEXT[], -- 用到的技能
    lessons_learned TEXT, -- 学到的经验教训
    -- 知识沉淀
    knowledge_docs JSONB DEFAULT '[]', -- 知识文档列表 [{title, content, tags}]
    contacts JSONB DEFAULT '[]', -- 重要联系人 [{name, role, contact}]
    process_docs JSONB DEFAULT '[]', -- 流程文档 [{name, description}]
    -- 状态
    status VARCHAR(50) DEFAULT 'draft', -- draft草稿 submitted已提交 synced已同步到记忆
    synced_to_memory_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 离职流程模板（可选，用现有offboarding_templates也可）
-- 注意：已经在005中创建，这里不再重复

-- ================================================
-- 索引
-- ================================================
CREATE INDEX IF NOT EXISTS idx_offboarding_checklist_employee ON employee_offboarding_checklists(employee_id);
CREATE INDEX IF NOT EXISTS idx_offboarding_checklist_status ON employee_offboarding_checklists(status);
CREATE INDEX IF NOT EXISTS idx_offboarding_items_checklist ON offboarding_checklist_items(checklist_id);
CREATE INDEX IF NOT EXISTS idx_offboarding_items_status ON offboarding_checklist_items(status);
CREATE INDEX IF NOT EXISTS idx_permission_revocations_employee ON offboarding_permission_revocations(employee_id);
CREATE INDEX IF NOT EXISTS idx_data_export_employee ON data_export_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_data_export_status ON data_export_records(status);
CREATE INDEX IF NOT EXISTS idx_surveys_employee ON offboarding_surveys(employee_id);
CREATE INDEX IF NOT EXISTS idx_experience_employee ON experience_transfer_records(employee_id);

-- ================================================
-- 初始数据：系统内置交接清单模板
-- ================================================

-- 通用交接清单
INSERT INTO offboarding_checklist_templates (id, name, description, category, is_system) VALUES
('00000000-0000-0000-0000-000000000001', '通用员工交接清单', '适用于所有员工的通用交接清单', 'general', TRUE),
('00000000-0000-0000-0000-000000000002', '技术岗位交接清单', '适用于开发、运维等技术岗位', 'tech', TRUE),
('00000000-0000-0000-0000-000000000003', '管理岗位交接清单', '适用于经理、主管等管理岗位', 'tech', TRUE);

-- 通用模板项
INSERT INTO offboarding_checklist_template_items (template_id, title, description, item_type, priority, assignee_type, estimated_minutes, order_index) VALUES
-- 00000001 通用模板
('00000000-0000-0000-0000-000000000001', '工作文档交接', '将所有工作相关文档整理并移交给接替者', 'document', 1, 'manager', 120, 1),
('00000000-0000-0000-0000-000000000001', '账号权限交接', '整理所有系统账号、权限列表', 'system', 1, 'admin', 60, 2),
('00000000-0000-0000-0000-000000000001', '工作进度汇报', '整理当前工作进度、未完成事项清单', 'task', 1, 'manager', 90, 3),
('00000000-0000-0000-0000-000000000001', '资产归还', '归还笔记本、工牌、门禁卡等公司资产', 'file', 2, 'admin', 30, 4),
('00000000-0000-0000-0000-000000000001', '重要联系人交接', '整理重要客户、合作伙伴联系方式', 'person', 2, 'manager', 60, 5),
('00000000-0000-0000-0000-000000000001', '密码和密钥交接', '交接所有系统密码、API密钥', 'system', 1, 'it', 30, 6),
('00000000-0000-0000-0000-000000000001', '邮件转发设置', '设置邮件自动回复和转发', 'system', 2, 'it', 15, 7),
('00000000-0000-0000-0000-000000000001', '离职面谈', '与直属上级进行离职面谈', 'task', 2, 'hr', 60, 8),

-- 00000002 技术岗位模板
('00000000-0000-0000-0000-000000000002', '代码仓库权限', '移除Git仓库管理员权限', 'system', 1, 'it', 15, 1),
('00000000-0000-0000-0000-000000000002', '服务器权限', '移除服务器、云服务访问权限', 'system', 1, 'it', 30, 2),
('00000000-0000-0000-0000-000000000002', '数据库权限', '移除数据库访问权限', 'system', 1, 'it', 30, 3),
('00000000-0000-0000-0000-000000000002', '项目文档交接', '交接项目需求文档、设计文档', 'document', 1, 'manager', 120, 4),
('00000000-0000-0000-0000-000000000002', '代码注释完善', '确保关键代码有完整注释', 'task', 2, 'manager', 180, 5),
('00000000-0000-0000-0000-000000000002', '环境账号交接', '交接开发环境、测试环境账号', 'system', 1, 'it', 60, 6),
('00000000-0000-0000-0000-000000000002', '技术债务说明', '整理技术债务清单和解决方案', 'document', 2, 'manager', 90, 7),

-- 00000003 管理岗位模板
('00000000-0000-0000-0000-000000000003', '团队管理交接', '团队成员名单、职责分工交接', 'person', 1, 'hr', 90, 1),
('00000000-0000-0000-0000-000000000003', 'OKR进度汇报', '汇报当前OKR完成情况', 'task', 1, 'manager', 60, 2),
('00000000-0000-0000-0000-000000000003', '审批权限移交', '将审批权限移交给接替者', 'system', 1, 'admin', 30, 3),
('00000000-0000-0000-0000-000000000003', '客户关系交接', '重要客户关系、合同状态交接', 'person', 1, 'manager', 120, 4),
('00000000-0000-0000-0000-000000000003', '预算使用报告', '整理部门预算使用情况', 'document', 2, 'hr', 60, 5),
('00000000-0000-0000-0000-000000000003', '会议安排交接', '交接定期会议、关键会议日程', 'calendar', 2, 'manager', 45, 6);

-- ================================================
-- 默认权限回收配置
-- ================================================
INSERT INTO offboarding_permission_config (enterprise_id, permission_type, enabled) VALUES
-- placeholder会被实际enterprise_id替换
('00000000-0000-0000-0000-000000000000', 'system_access', TRUE),
('00000000-0000-0000-0000-000000000000', 'file_access', TRUE),
('00000000-0000-0000-0000-000000000000', 'doc_access', TRUE),
('00000000-0000-0000-0000-000000000000', 'calendar_access', TRUE),
('00000000-0000-0000-0000-000000000000', 'task_management', TRUE),
('00000000-0000-0000-0000-000000000000', 'approval_authority', TRUE),
('00000000-0000-0000-0000-000000000000', 'team_management', TRUE);
