-- =====================================================
-- 八爪鱼 v1.2.0: 连接即获取企业能力
-- 
-- 核心概念：触手（员工）连接八爪鱼大脑（企业）= 立即获得企业能力
-- 
-- 当员工连接到企业时，他的Claw立即可以：
-- 1. 访问企业知识库
-- 2. 使用企业购买的AI模型
-- 3. 查看团队信息
-- 4. 使用企业工作流
-- =====================================================

-- =====================================================
-- 1. 企业能力清单 - 企业可以提供什么能力
-- =====================================================
CREATE TABLE IF NOT EXISTS enterprise_capabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    
    -- 能力类型
    capability_type VARCHAR(50) NOT NULL,  -- 'knowledge_base', 'ai_model', 'workflow', 'document', 'team_info'
    capability_key VARCHAR(100) NOT NULL,   -- 'chatgpt4', 'notion_sync', 'company_wiki'
    capability_name VARCHAR(200) NOT NULL,  -- 显示名称
    capability_description TEXT,            -- 描述
    
    -- 能力配置（JSON）
    config JSONB DEFAULT '{}',
    
    -- 访问控制
    is_enabled BOOLEAN DEFAULT true,
    access_level VARCHAR(20) DEFAULT 'all',  -- 'all', 'admin', 'specific_roles'
    allowed_roles TEXT[],                    -- 允许访问的角色列表
    
    -- 元数据
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(enterprise_id, capability_type, capability_key)
);

-- 能力类型索引
CREATE INDEX idx_enterprise_capabilities_type ON enterprise_capabilities(enterprise_id, capability_type);

-- =====================================================
-- 2. 个人连接获取的能力 - 触手连接后获得了什么
-- =====================================================
CREATE TABLE IF NOT EXISTS connection_capabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES user_enterprise_connections(id) ON DELETE CASCADE,
    capability_id UUID NOT NULL REFERENCES enterprise_capabilities(id) ON DELETE CASCADE,
    
    -- 获取时间
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- 使用统计
    use_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP WITH TIME ZONE,
    
    -- 状态
    is_active BOOLEAN DEFAULT true,
    revoked_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(connection_id, capability_id)
);

-- =====================================================
-- 3. 企业AI模型配置
-- =====================================================
CREATE TABLE IF NOT EXISTS enterprise_ai_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    
    -- 模型信息
    provider VARCHAR(50) NOT NULL,  -- 'openai', 'anthropic', 'google', 'azure', 'custom'
    model_id VARCHAR(100) NOT NULL,  -- 'gpt-4', 'claude-3-opus'
    model_name VARCHAR(200),          -- 显示名称
    
    -- API配置
    api_endpoint TEXT,               -- API地址
    api_key_encrypted TEXT,          -- 加密的API密钥
    api_version VARCHAR(50),          -- API版本
    
    -- 使用配置
    max_tokens INTEGER DEFAULT 4096,
    temperature DECIMAL(3,2) DEFAULT 0.7,
    system_prompt TEXT,               -- 默认系统提示词
    
    -- 配额
    monthly_limit INTEGER,            -- 月限额
    monthly_used INTEGER DEFAULT 0,
    reset_day INTEGER DEFAULT 1,      -- 每月重置日
    
    -- 状态
    is_enabled BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false, -- 是否为默认模型
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(enterprise_id, provider, model_id)
);

-- 企业默认模型
CREATE INDEX idx_enterprise_ai_models_default ON enterprise_ai_models(enterprise_id, is_default);

-- =====================================================
-- 4. 企业知识库配置
-- =====================================================
CREATE TABLE IF NOT EXISTS enterprise_knowledge_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    
    -- 来源类型
    source_type VARCHAR(50) NOT NULL,  -- 'notion', 'confluence', 'github', 'website', 'upload', 'api'
    source_name VARCHAR(200) NOT NULL,
    
    -- 连接配置
    config JSONB DEFAULT '{}',          -- API密钥、URL等
    
    -- 同步配置
    sync_enabled BOOLEAN DEFAULT true,
    sync_frequency VARCHAR(20) DEFAULT 'daily',  -- 'hourly', 'daily', 'weekly', 'manual'
    last_synced_at TIMESTAMP WITH TIME ZONE,
    
    -- 状态
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 5. 企业工作流模板
-- =====================================================
CREATE TABLE IF NOT EXISTS enterprise_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    
    name VARCHAR(200) NOT NULL,
    description TEXT,
    
    -- 工作流定义
    workflow_def JSONB NOT NULL,  -- 触发器、步骤、条件
    
    -- 分类
    category VARCHAR(50),          -- 'hr', 'finance', 'it', 'general'
    
    -- 权限
    roles_allowed TEXT[],          -- 允许使用该工作流的角色
    
    -- 使用统计
    use_count INTEGER DEFAULT 0,
    
    -- 状态
    is_active BOOLEAN DEFAULT true,
    is_public BOOLEAN DEFAULT true,  -- 是否对所有成员公开
    
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_enterprise_workflows_category ON enterprise_workflows(enterprise_id, category);

-- =====================================================
-- 6. 快捷操作/快捷方式
-- =====================================================
CREATE TABLE IF NOT EXISTS enterprise_shortcuts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    
    name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- 快捷方式定义
    shortcut_key VARCHAR(50) NOT NULL,   -- 如 '/请假', '/报销'
    action_type VARCHAR(50) NOT NULL,    -- 'workflow', 'link', 'ai_command'
    action_config JSONB NOT NULL,        -- 具体的动作配置
    
    -- 图标
    icon VARCHAR(50),
    color VARCHAR(20),
    
    -- 排序
    sort_order INTEGER DEFAULT 0,
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_enterprise_shortcuts_key ON enterprise_shortcuts(enterprise_id, shortcut_key);

-- =====================================================
-- 7. 连接时获取能力的事件记录
-- =====================================================
CREATE TABLE IF NOT EXISTS connection_capability_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES user_enterprise_connections(id) ON DELETE CASCADE,
    capability_id UUID REFERENCES enterprise_capabilities(id),
    
    event_type VARCHAR(50) NOT NULL,  -- 'granted', 'used', 'revoked', 'expired'
    
    -- 事件详情
    event_data JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_connection_capability_events_connection ON connection_capability_events(connection_id, created_at DESC);

-- =====================================================
-- 初始化企业时的默认能力（通过应用层实现）
-- =====================================================

-- =====================================================
-- 触发器：自动更新 updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_enterprise_capabilities_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_enterprise_capabilities_updated
    BEFORE UPDATE ON enterprise_capabilities
    FOR EACH ROW EXECUTE FUNCTION update_enterprise_capabilities_timestamp();

CREATE TRIGGER trigger_enterprise_ai_models_updated
    BEFORE UPDATE ON enterprise_ai_models
    FOR EACH ROW EXECUTE FUNCTION update_enterprise_ai_models_updated_timestamp();

CREATE OR REPLACE FUNCTION update_enterprise_ai_models_updated_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
