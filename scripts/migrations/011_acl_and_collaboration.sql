-- ============================================================
-- 八爪鱼 Octopus - 迁移 011
-- 统一权限系统 + 实时协作 + 多人协作 + 任务关联
-- ============================================================

-- ============================================================
-- 第一部分：统一权限系统（RBAC）
-- ============================================================

-- 角色定义表
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID,  -- NULL 表示系统内置角色
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL,  -- 唯一标识: admin, editor, viewer, owner
    description TEXT,
    permissions JSONB DEFAULT '[]',  -- 权限列表
    is_system BOOLEAN DEFAULT false,  -- 系统内置不可删除
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(enterprise_id, code)
);

-- 资源表（统一管理所有有权限的资源）
CREATE TABLE IF NOT EXISTS resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type VARCHAR(50) NOT NULL,  -- document, task, folder, table, file, etc.
    resource_id UUID NOT NULL,  -- 实际资源的ID
    enterprise_id UUID NOT NULL,
    owner_id UUID NOT NULL,  -- 资源所有者
    name VARCHAR(500),
    sensitivity_level VARCHAR(20) DEFAULT 'internal',  -- public, internal, confidential, secret
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(resource_type, resource_id)
);

-- 资源权限表（支持继承 + 单独授权）
CREATE TABLE IF NOT EXISTS resource_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL,  -- 引用 resources.id
    principal_type VARCHAR(20) NOT NULL,  -- user, role, department, everyone
    principal_id UUID,  -- 用户ID/角色ID/部门ID，everyone时为NULL
    permission VARCHAR(20) NOT NULL,  -- view, edit, comment, admin, none
    inherited BOOLEAN DEFAULT false,  -- 是否从父级继承
    granted_by UUID,  -- 授权人
    expires_at TIMESTAMP,  -- 权限过期时间
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(resource_id, principal_type, principal_id, permission)
);

-- 权限继承规则表
CREATE TABLE IF NOT EXISTS permission_inheritance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_resource_id UUID NOT NULL,
    child_resource_id UUID NOT NULL,
    inherit_permissions BOOLEAN DEFAULT true,
    inherit_from_level VARCHAR(20) DEFAULT 'all',  -- all, read, write, admin
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(parent_resource_id, child_resource_id)
);

-- ============================================================
-- 第二部分：实时协作
-- ============================================================

-- 协作会话表（记录谁在编辑什么）
CREATE TABLE IF NOT EXISTS collaboration_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL,
    user_id UUID NOT NULL,
    session_type VARCHAR(20) DEFAULT 'viewing',  -- viewing, editing, presenting
    client_info JSONB DEFAULT '{}',  -- 客户端信息
    cursor_position JSONB,  -- 光标位置
    joined_at TIMESTAMP DEFAULT NOW(),
    last_activity_at TIMESTAMP DEFAULT NOW(),
    left_at TIMESTAMP
);

-- 协作事件日志（操作审计）
CREATE TABLE IF NOT EXISTS collaboration_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL,
    user_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,  -- join, leave, edit, comment, share, permission_change
    event_data JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 第三部分：多人协作 - 评论系统
-- ============================================================

-- 评论表
CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type VARCHAR(50) NOT NULL,  -- document, task, file, etc.
    resource_id UUID NOT NULL,
    parent_id UUID,  -- 回复上级评论
    author_id UUID NOT NULL,
    content TEXT NOT NULL,
    content_html TEXT,  -- HTML格式
    mentions JSONB DEFAULT '[]',  -- @提及的用户ID列表
    attachments JSONB DEFAULT '[]',  -- 附件列表
    is_resolved BOOLEAN DEFAULT false,  -- 是否已解决
    is_pinned BOOLEAN DEFAULT false,  -- 是否置顶
    reactions JSONB DEFAULT '{}',  -- 表情反应: {"👍": ["user1", "user2"]}
    resolved_by UUID,  -- 解决者
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP
);

-- 评论通知表
CREATE TABLE IF NOT EXISTS comment_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL,
    user_id UUID NOT NULL,  -- 通知接收人
    notify_type VARCHAR(20) NOT NULL,  -- mentioned, replied, resolved
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 第四部分：任务关联
-- ============================================================

-- 任务关联表（任务可关联到任意资源）
CREATE TABLE IF NOT EXISTS task_associations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL,
    resource_type VARCHAR(50) NOT NULL,  -- document, file, meeting, approval, etc.
    resource_id UUID NOT NULL,
    association_type VARCHAR(30) DEFAULT 'related',  -- parent, child, related, blocks, blocked_by, implements
    associated_by UUID NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(task_id, resource_type, resource_id)
);

-- 任务依赖关系
CREATE TABLE IF NOT EXISTS task_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocking_task_id UUID NOT NULL,  -- 阻塞任务
    blocked_task_id UUID NOT NULL,  -- 被阻塞任务
    dependency_type VARCHAR(20) DEFAULT 'blocks',  -- blocks, depends_on, related
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(blocking_task_id, blocked_task_id)
);

-- ============================================================
-- 第五部分：权限预设数据
-- ============================================================

-- 插入系统内置角色
INSERT INTO roles (name, code, description, permissions, is_system) VALUES
('超级管理员', 'super_admin', '系统超级管理员，拥有所有权限', 
 '["*"]', true),
('企业管理员', 'admin', '企业管理员，管理企业内所有资源', 
 '["document:*", "task:*", "file:*", "table:*", "meeting:*", "approval:*", "user:*"]', true),
('编辑者', 'editor', '可编辑大部分资源', 
 '["document:edit", "document:comment", "task:edit", "task:comment", "file:edit", "file:comment", "meeting:view"]', true),
('查看者', 'viewer', '只能查看资源', 
 '["document:view", "task:view", "file:view", "meeting:view"]', true),
('访客', 'guest', '外部访客，仅限被分享的资源', 
 '["document:view", "task:view"]', true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 第六部分：索引
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_resources_enterprise ON resources(enterprise_id);
CREATE INDEX IF NOT EXISTS idx_resources_owner ON resources(owner_id);
CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(resource_type);

CREATE INDEX IF NOT EXISTS idx_permissions_resource ON resource_permissions(resource_id);
CREATE INDEX IF NOT EXISTS idx_permissions_principal ON resource_permissions(principal_type, principal_id);

CREATE INDEX IF NOT EXISTS idx_collab_session_resource ON collaboration_sessions(resource_id);
CREATE INDEX IF NOT EXISTS idx_collab_session_user ON collaboration_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_collab_events_resource ON collaboration_events(resource_id);

CREATE INDEX IF NOT EXISTS idx_comments_resource ON comments(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_comments_author ON comments(author_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);

CREATE INDEX IF NOT EXISTS idx_task_associations_task ON task_associations(task_id);
CREATE INDEX IF NOT EXISTS idx_task_associations_resource ON task_associations(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_blocking ON task_dependencies(blocking_task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_blocked ON task_dependencies(blocked_task_id);
