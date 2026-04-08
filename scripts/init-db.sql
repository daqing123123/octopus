-- 八爪鱼数据库初始化脚本

-- 启用扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- 用于模糊搜索

-- 设置时区
SET timezone = 'Asia/Shanghai';

-- ============================================
-- 用户与个人 Claw
-- ============================================

-- 用户表
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100),
    avatar_url TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    email_verified BOOLEAN DEFAULT FALSE,
    phone_verified BOOLEAN DEFAULT FALSE,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 用户索引
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_status ON users(status);

-- 个人 Claw 实例
CREATE TABLE personal_claws (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    name VARCHAR(100),
    config JSONB DEFAULT '{}',
    storage_quota BIGINT DEFAULT 5368709120,  -- 5GB
    storage_used BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 用户习惯记录
CREATE TABLE user_habits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    habit_type VARCHAR(100) NOT NULL,
    habit_data JSONB DEFAULT '{}',
    frequency INT DEFAULT 1,
    last_occurred TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, habit_type)
);

CREATE INDEX idx_user_habits_user ON user_habits(user_id);
CREATE INDEX idx_user_habits_type ON user_habits(habit_type);

-- 用户记忆元数据
CREATE TABLE user_memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    memory_type VARCHAR(20) DEFAULT 'short_term' CHECK (memory_type IN ('short_term', 'long_term')),
    content TEXT NOT NULL,
    embedding_id VARCHAR(100),  -- Qdrant 向量ID
    importance FLOAT DEFAULT 0.5,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accessed_at TIMESTAMP,
    access_count INT DEFAULT 0
);

CREATE INDEX idx_user_memories_user ON user_memories(user_id);
CREATE INDEX idx_user_memories_type ON user_memories(memory_type);
CREATE INDEX idx_user_memories_importance ON user_memories(importance DESC);

-- 个人 Agent
CREATE TABLE personal_agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    config JSONB DEFAULT '{}',
    model_provider VARCHAR(50),
    model_id VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_personal_agents_user ON personal_agents(user_id);

-- ============================================
-- 企业与资源池
-- ============================================

-- 企业表
CREATE TABLE enterprises (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(100) UNIQUE,
    logo_url TEXT,
    description TEXT,
    plan VARCHAR(20) DEFAULT 'free' CHECK (plan IN ('free', 'team', 'pro', 'enterprise')),
    max_members INT DEFAULT 100,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_enterprises_slug ON enterprises(slug);
CREATE INDEX idx_enterprises_plan ON enterprises(plan);

-- 企业 Claw 实例
CREATE TABLE enterprise_claws (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE UNIQUE,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 企业成员
CREATE TABLE enterprise_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'guest')),
    department VARCHAR(100),
    job_title VARCHAR(100),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('pending', 'active', 'inactive')),
    invited_by UUID REFERENCES users(id),
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(enterprise_id, user_id)
);

CREATE INDEX idx_enterprise_members_enterprise ON enterprise_members(enterprise_id);
CREATE INDEX idx_enterprise_members_user ON enterprise_members(user_id);
CREATE INDEX idx_enterprise_members_role ON enterprise_members(role);

-- 企业大模型池
CREATE TABLE enterprise_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    model_id VARCHAR(100) NOT NULL,
    model_name VARCHAR(100),
    quota_limit BIGINT,
    quota_used BIGINT DEFAULT 0,
    config JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_enterprise_models_enterprise ON enterprise_models(enterprise_id);

-- 企业共享 Agent
CREATE TABLE enterprise_agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    config JSONB DEFAULT '{}',
    allowed_roles JSONB DEFAULT '["admin", "member"]',
    created_by UUID REFERENCES users(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_enterprise_agents_enterprise ON enterprise_agents(enterprise_id);

-- ============================================
-- 连接与权限
-- ============================================

-- 用户-企业连接
CREATE TABLE user_enterprise_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('pending', 'active', 'inactive')),
    personal_claw_id UUID REFERENCES personal_claws(id),
    enterprise_claw_id UUID REFERENCES enterprise_claws(id),
    connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    disconnected_at TIMESTAMP,
    UNIQUE(user_id, enterprise_id)
);

CREATE INDEX idx_connections_user ON user_enterprise_connections(user_id);
CREATE INDEX idx_connections_enterprise ON user_enterprise_connections(enterprise_id);
CREATE INDEX idx_connections_status ON user_enterprise_connections(status);

-- ============================================
-- 【新增】连接申请流程
-- ============================================

-- 企业加入申请（用户主动申请加入）
CREATE TABLE enterprise_join_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    apply_role VARCHAR(20) DEFAULT 'member' CHECK (apply_role IN ('admin', 'member', 'guest')),
    message TEXT,  -- 申请留言
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reject_reason TEXT,  -- 拒绝原因
    processed_by UUID REFERENCES users(id),  -- 处理人
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(enterprise_id, user_id)  -- 同一企业只能有一个申请
);

CREATE INDEX idx_join_requests_enterprise ON enterprise_join_requests(enterprise_id);
CREATE INDEX idx_join_requests_user ON enterprise_join_requests(user_id);
CREATE INDEX idx_join_requests_status ON enterprise_join_requests(status);

-- ============================================
-- 【新增】个人习惯跨企业同步
-- ============================================

-- 企业Claw习惯池（从个人Claw学习）
CREATE TABLE claw_habit_pool (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    enterprise_claw_id UUID REFERENCES enterprise_claws(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    habit_type VARCHAR(100) NOT NULL,
    aggregated_data JSONB DEFAULT '{}',  -- 脱敏后的聚合数据
    frequency INT DEFAULT 1,  -- 累计频率
    synced_from_claw_id UUID REFERENCES personal_claws(id),  -- 来源个人Claw
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_applied_at TIMESTAMP,  -- 最近一次应用到企业Claw的时间
    UNIQUE(enterprise_claw_id, user_id, habit_type)
);

CREATE INDEX idx_claw_habit_pool_enterprise_claw ON claw_habit_pool(enterprise_claw_id);
CREATE INDEX idx_claw_habit_pool_user ON claw_habit_pool(user_id);
CREATE INDEX idx_claw_habit_pool_type ON claw_habit_pool(habit_type);

-- 习惯同步记录
CREATE TABLE habit_sync_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    personal_claw_id UUID REFERENCES personal_claws(id),
    enterprise_claw_id UUID REFERENCES enterprise_claws(id),
    habits_synced INT DEFAULT 0,  -- 本次同步数量
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_habit_sync_records_user ON habit_sync_records(user_id);
CREATE INDEX idx_habit_sync_records_enterprise ON habit_sync_records(enterprise_id);
CREATE INDEX idx_habit_sync_records_time ON habit_sync_records(synced_at DESC);

-- ============================================
-- 即时通讯
-- ============================================

-- 会话（私聊、群聊）
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(20) NOT NULL CHECK (type IN ('private', 'group', 'channel')),
    name VARCHAR(200),  -- 群聊名称
    avatar_url TEXT,
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,  -- 企业群
    owner_id UUID REFERENCES users(id),
    settings JSONB DEFAULT '{}',
    last_message_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_conversations_type ON conversations(type);
CREATE INDEX idx_conversations_enterprise ON conversations(enterprise_id);

-- 会话成员
CREATE TABLE conversation_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    last_read_at TIMESTAMP,
    muted BOOLEAN DEFAULT FALSE,
    pinned BOOLEAN DEFAULT FALSE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(conversation_id, user_id)
);

CREATE INDEX idx_conversation_members_conversation ON conversation_members(conversation_id);
CREATE INDEX idx_conversation_members_user ON conversation_members(user_id);

-- 消息
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id),
    content TEXT,
    content_type VARCHAR(20) DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'file', 'card', 'system')),
    metadata JSONB DEFAULT '{}',
    reply_to UUID REFERENCES messages(id),
    edited_at TIMESTAMP,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);

-- 消息反应（表情）
CREATE TABLE message_reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    emoji VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id, emoji)
);

CREATE INDEX idx_message_reactions_message ON message_reactions(message_id);

-- ============================================
-- 多维表格
-- ============================================

-- 表格
CREATE TABLE tables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    creator_id UUID REFERENCES users(id),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    color VARCHAR(20),
    fields JSONB DEFAULT '[]',
    views JSONB DEFAULT '[]',
    settings JSONB DEFAULT '{}',
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tables_enterprise ON tables(enterprise_id);
CREATE INDEX idx_tables_creator ON tables(creator_id);

-- 表格数据行
CREATE TABLE table_rows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_id UUID REFERENCES tables(id) ON DELETE CASCADE,
    data JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_table_rows_table ON table_rows(table_id);

-- ============================================
-- 云文档
-- ============================================

-- 文档
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    creator_id UUID REFERENCES users(id),
    parent_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) DEFAULT 'doc' CHECK (type IN ('doc', 'sheet', 'slide', 'folder')),
    content JSONB DEFAULT '{}',  -- Y.js CRDT 数据
    icon VARCHAR(50),
    is_public BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_documents_enterprise ON documents(enterprise_id);
CREATE INDEX idx_documents_parent ON documents(parent_id);
CREATE INDEX idx_documents_creator ON documents(creator_id);

-- 文档权限
CREATE TABLE document_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    permission VARCHAR(20) DEFAULT 'view' CHECK (permission IN ('view', 'comment', 'edit', 'admin')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_id, user_id)
);

CREATE INDEX idx_document_permissions_document ON document_permissions(document_id);

-- 文档评论
CREATE TABLE document_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    content TEXT NOT NULL,
    position JSONB DEFAULT '{}',  -- 评论位置（块ID、选择范围等）
    reply_to UUID REFERENCES document_comments(id),
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_document_comments_document ON document_comments(document_id);

-- ============================================
-- 任务管理
-- ============================================

-- 任务
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    creator_id UUID REFERENCES users(id),
    assignee_id UUID REFERENCES users(id),
    parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'completed', 'cancelled')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    due_date TIMESTAMP,
    tags JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tasks_enterprise ON tasks(enterprise_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);

-- 任务评论
CREATE TABLE task_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_task_comments_task ON task_comments(task_id);

-- ============================================
-- 文件管理
-- ============================================

-- 文件
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    uploader_id UUID REFERENCES users(id),
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255),
    storage_key VARCHAR(500) NOT NULL,  -- MinIO key
    size BIGINT NOT NULL,
    mime_type VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_files_enterprise ON files(enterprise_id);
CREATE INDEX idx_files_uploader ON files(uploader_id);

-- ============================================
-- OKR 系统
-- ============================================

-- OKR (企业版保留原结构，个人版使用上面的 okrs 表)
-- CREATE TABLE okrs (
--     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--     enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
--     owner_id UUID REFERENCES users(id),
--     parent_id UUID REFERENCES okrs(id) ON DELETE CASCADE,
--     period VARCHAR(50) NOT NULL,
--     type VARCHAR(20) NOT NULL CHECK (type IN ('objective', 'key_result')),
--     title VARCHAR(500) NOT NULL,
--     description TEXT,
--     progress FLOAT DEFAULT 0,
--     score FLOAT,
--     status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
--     due_date TIMESTAMP,
--     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

CREATE INDEX idx_okrs_enterprise ON okrs(enterprise_id);
CREATE INDEX idx_okrs_owner ON okrs(owner_id);
CREATE INDEX idx_okrs_period ON okrs(period);

-- ============================================
-- 审批流程
-- ============================================

-- 审批流程定义
CREATE TABLE approval_flows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    form_schema JSONB DEFAULT '{}',
    flow_definition JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_approval_flows_enterprise ON approval_flows(enterprise_id);

-- 审批实例
CREATE TABLE approval_instances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flow_id UUID REFERENCES approval_flows(id) ON DELETE CASCADE,
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    applicant_id UUID REFERENCES users(id),
    form_data JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    current_step INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX idx_approval_instances_flow ON approval_instances(flow_id);
CREATE INDEX idx_approval_instances_applicant ON approval_instances(applicant_id);

-- 审批记录
CREATE TABLE approval_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instance_id UUID REFERENCES approval_instances(id) ON DELETE CASCADE,
    approver_id UUID REFERENCES users(id),
    step INT NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('approve', 'reject', 'transfer')),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_approval_records_instance ON approval_records(instance_id);

-- ============================================
-- 日程管理
-- ============================================

-- 日程
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    creator_id UUID REFERENCES users(id),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    location VARCHAR(200),
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    is_all_day BOOLEAN DEFAULT FALSE,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_rule TEXT,
    reminders JSONB DEFAULT '[]',
    color VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_events_enterprise ON events(enterprise_id);
CREATE INDEX idx_events_start_time ON events(start_time);

-- 日程参与者
CREATE TABLE event_attendees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'tentative')),
    UNIQUE(event_id, user_id)
);

CREATE INDEX idx_event_attendees_event ON event_attendees(event_id);
CREATE INDEX idx_event_attendees_user ON event_attendees(user_id);

-- ============================================
-- 知识库
-- ============================================

-- 知识空间
CREATE TABLE knowledge_spaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    is_public BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_knowledge_spaces_enterprise ON knowledge_spaces(enterprise_id);

-- 知识文档
CREATE TABLE knowledge_docs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    space_id UUID REFERENCES knowledge_spaces(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES knowledge_docs(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    content TEXT,
    tags JSONB DEFAULT '[]',
    view_count INT DEFAULT 0,
    is_archived BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_knowledge_docs_space ON knowledge_docs(space_id);
CREATE INDEX idx_knowledge_docs_parent ON knowledge_docs(parent_id);

-- ============================================
-- 触发器：自动更新 updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为需要的表添加触发器
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tables_updated_at BEFORE UPDATE ON tables
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_okrs_updated_at BEFORE UPDATE ON okrs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_knowledge_docs_updated_at BEFORE UPDATE ON knowledge_docs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 初始化数据
-- ============================================

-- 插入默认系统设置
-- INSERT INTO system_settings (key, value) VALUES 
--     ('default_storage_quota', '5368709120'),
--     ('max_file_size', '104857600');

-- 完成
SELECT 'Database initialized successfully!' AS status;
�档
CREATE TABLE knowledge_docs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    space_id UUID REFERENCES knowledge_spaces(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES knowledge_docs(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    content TEXT,
    tags JSONB DEFAULT '[]',
    view_count INT DEFAULT 0,
    is_archived BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_knowledge_docs_space ON knowledge_docs(space_id);
CREATE INDEX idx_knowledge_docs_parent ON knowledge_docs(parent_id);

-- ============================================
-- 触发器：自动更新 updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为需要的表添加触发器
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tables_updated_at BEFORE UPDATE ON tables
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_okrs_updated_at BEFORE UPDATE ON okrs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_knowledge_docs_updated_at BEFORE UPDATE ON knowledge_docs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 初始化数据
-- ============================================

-- 插入默认系统设置
-- INSERT INTO system_settings (key, value) VALUES 
--     ('default_storage_quota', '5368709120'),
--     ('max_file_size', '104857600');

-- 完成
SELECT 'Database initialized successfully!' AS status;
