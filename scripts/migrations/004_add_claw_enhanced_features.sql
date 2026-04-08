-- ============================================
-- 迁移脚本 004: 个人Claw扩展功能
-- 日期: 2026-04-08
-- 功能: 智能分析层 + 主动服务层 + 记忆增强层 + 隐私控制层 + Agent进化层 + 跨平台同步层
-- ============================================

BEGIN;

-- ============================================
-- 【NEW】智能分析层：个人知识图谱
-- ============================================

CREATE TABLE IF NOT EXISTS personal_knowledge_nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL,
    entity_name VARCHAR(200) NOT NULL,
    entity_description TEXT,
    entity_data JSONB DEFAULT '{}',
    importance_score FLOAT DEFAULT 0.5,
    mention_count INT DEFAULT 1,
    last_mentioned TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_kn_user ON personal_knowledge_nodes(user_id);
CREATE INDEX IF NOT EXISTS idx_kn_type ON personal_knowledge_nodes(entity_type);
CREATE INDEX IF NOT EXISTS idx_kn_importance ON personal_knowledge_nodes(importance_score DESC);

CREATE TABLE IF NOT EXISTS personal_knowledge_edges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    source_node_id UUID REFERENCES personal_knowledge_nodes(id) ON DELETE CASCADE,
    target_node_id UUID REFERENCES personal_knowledge_nodes(id) ON DELETE CASCADE,
    relation_type VARCHAR(100) NOT NULL,
    relation_strength FLOAT DEFAULT 0.5,
    mention_count INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_node_id, target_node_id, relation_type)
);
CREATE INDEX IF NOT EXISTS idx_ke_user ON personal_knowledge_edges(user_id);

CREATE TABLE IF NOT EXISTS personal_productivity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    log_date DATE NOT NULL,
    hour_of_day INT,
    day_of_week INT,
    messages_sent INT DEFAULT 0,
    tasks_completed INT DEFAULT 0,
    docs_created INT DEFAULT 0,
    ai_queries INT DEFAULT 0,
    files_uploaded INT DEFAULT 0,
    meeting_hours FLOAT DEFAULT 0,
    focus_score INT,
    collaboration_score INT,
    enterprise_id UUID REFERENCES enterprises(id),
    work_location VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, log_date, enterprise_id)
);
CREATE INDEX IF NOT EXISTS idx_ppl_user_date ON personal_productivity_logs(user_id, log_date DESC);

CREATE TABLE IF NOT EXISTS user_skill_assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    skill_category VARCHAR(50) NOT NULL,
    skill_name VARCHAR(100) NOT NULL,
    proficiency_level INT DEFAULT 1 CHECK (proficiency_level BETWEEN 1 AND 5),
    assessment_source VARCHAR(50) DEFAULT 'usage',
    evidence_count INT DEFAULT 0,
    last_assessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, skill_name)
);
CREATE INDEX IF NOT EXISTS idx_usa_user ON user_skill_assessments(user_id);

CREATE TABLE IF NOT EXISTS daily_usage_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    usage_by_module JSONB DEFAULT '{}',
    focus_minutes INT DEFAULT 0,
    meeting_minutes INT DEFAULT 0,
    deep_work_minutes INT DEFAULT 0,
    productivity_score INT,
    engagement_level VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS idx_dus_user ON daily_usage_snapshots(user_id);

-- ============================================
-- 【NEW】主动服务层：提醒、周报、会议准备、入职引导
-- ============================================

CREATE TABLE IF NOT EXISTS personal_reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    reminder_type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    due_at TIMESTAMP,
    trigger_at TIMESTAMP,
    trigger_conditions JSONB DEFAULT '{}',
    is_completed BOOLEAN DEFAULT FALSE,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurring_pattern VARCHAR(100),
    source VARCHAR(50) DEFAULT 'manual',
    source_context JSONB DEFAULT '{}',
    completed_at TIMESTAMP,
    snoozed_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pr_user ON personal_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_pr_trigger ON personal_reminders(trigger_at) WHERE is_completed = FALSE;

CREATE TABLE IF NOT EXISTS claw_suggestions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    suggestion_type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    content TEXT,
    action_url VARCHAR(500),
    priority INT DEFAULT 0,
    is_read BOOLEAN DEFAULT FALSE,
    is_dismissed BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cs_user ON claw_suggestions(user_id);
CREATE INDEX IF NOT EXISTS idx_cs_active ON claw_suggestions(priority DESC) WHERE is_read = FALSE AND is_dismissed = FALSE;

CREATE TABLE IF NOT EXISTS weekly_report_drafts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    auto_generated_content TEXT,
    human_edited_content TEXT,
    stats JSONB DEFAULT '{}',
    highlights JSONB DEFAULT '[]',
    blockers JSONB DEFAULT '[]',
    next_week_plans JSONB DEFAULT '[]',
    status VARCHAR(20) DEFAULT 'draft',
    published_at TIMESTAMP,
    submitted_to JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, week_start)
);
CREATE INDEX IF NOT EXISTS idx_wrd_user ON weekly_report_drafts(user_id);

CREATE TABLE IF NOT EXISTS meeting_prep_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    event_id UUID REFERENCES events(id),
    meeting_title VARCHAR(200),
    scheduled_at TIMESTAMP,
    participants_info JSONB DEFAULT '[]',
    relevant_docs JSONB DEFAULT '[]',
    past_discussions TEXT,
    suggested_talking_points JSONB DEFAULT '[]',
    questions_to_ask JSONB DEFAULT '[]',
    action_items JSONB DEFAULT '[]',
    preparation_notes TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mpp_user ON meeting_prep_packages(user_id);

CREATE TABLE IF NOT EXISTS onboarding_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    enterprise_id UUID REFERENCES enterprises(id),
    step_id VARCHAR(50) NOT NULL,
    step_type VARCHAR(50) NOT NULL,
    step_title VARCHAR(200),
    step_status VARCHAR(20) DEFAULT 'pending',
    completed_at TIMESTAMP,
    step_data JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, enterprise_id, step_id)
);

-- ============================================
-- 【NEW】记忆增强层：人物、重要时刻、对话记忆、遗忘曲线
-- ============================================

CREATE TABLE IF NOT EXISTS personal_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    contact_user_id UUID REFERENCES users(id),
    contact_name VARCHAR(100),
    contact_email VARCHAR(200),
    contact_avatar VARCHAR(500),
    relation_type VARCHAR(50),
    first_met_at TIMESTAMP,
    last_interaction_at TIMESTAMP,
    interaction_count INT DEFAULT 0,
    shared_projects JSONB DEFAULT '[]',
    shared_enterprises JSONB DEFAULT '[]',
    personal_notes TEXT,
    tags JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, contact_user_id)
);
CREATE INDEX IF NOT EXISTS idx_pc_user ON personal_contacts(user_id);

CREATE TABLE IF NOT EXISTS personal_milestones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    milestone_type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    occurred_at TIMESTAMP NOT NULL,
    context_data JSONB DEFAULT '{}',
    importance INT DEFAULT 5,
    reminder_enabled BOOLEAN DEFAULT FALSE,
    reminded_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pm_user ON personal_milestones(user_id);
CREATE INDEX IF NOT EXISTS idx_pm_importance ON personal_milestones(importance DESC);

CREATE TABLE IF NOT EXISTS conversation_memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID,
    summary TEXT NOT NULL,
    key_points JSONB DEFAULT '[]',
    entities JSONB DEFAULT '[]',
    sentiment VARCHAR(20),
    importance INT DEFAULT 5,
    referenced_in JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cm_user ON conversation_memories(user_id);

CREATE TABLE IF NOT EXISTS memory_review_schedule (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    memory_type VARCHAR(30) NOT NULL,
    memory_id VARCHAR(100) NOT NULL,
    ease_factor FLOAT DEFAULT 2.5,
    interval_days INT DEFAULT 1,
    repetitions INT DEFAULT 0,
    next_review_at TIMESTAMP,
    last_reviewed_at TIMESTAMP,
    retention_score FLOAT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, memory_type, memory_id)
);
CREATE INDEX IF NOT EXISTS idx_mrs_user ON memory_review_schedule(user_id);

-- ============================================
-- 【NEW】隐私控制层：隐私设置、访问日志、一键导出
-- ============================================

CREATE TABLE IF NOT EXISTS personal_privacy_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    collect_usage_data BOOLEAN DEFAULT TRUE,
    collect_habit_data BOOLEAN DEFAULT TRUE,
    collect_ai_conversations BOOLEAN DEFAULT FALSE,
    collect_productivity_data BOOLEAN DEFAULT TRUE,
    share_with_enterprise VARCHAR(20) DEFAULT 'minimal',
    share_working_style BOOLEAN DEFAULT TRUE,
    share_ai_preferences BOOLEAN DEFAULT TRUE,
    share_productivity_stats BOOLEAN DEFAULT FALSE,
    memory_retention_days INT DEFAULT 90,
    auto_forget_days INT DEFAULT 365,
    allow_cross_enterprise_sync BOOLEAN DEFAULT FALSE,
    enterprise_data_isolation VARCHAR(20) DEFAULT 'strict',
    last_data_export_at TIMESTAMP,
    data_export_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS privacy_access_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    access_type VARCHAR(50) NOT NULL,
    accessor_id UUID,
    accessor_type VARCHAR(50),
    data_categories JSONB DEFAULT '[]',
    access_reason TEXT,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pal_user ON privacy_access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_pal_time ON privacy_access_logs(created_at DESC);

-- ============================================
-- 【NEW】Agent进化层：克隆、多Agent协作、商店、语音人格
-- ============================================

CREATE TABLE IF NOT EXISTS agent_clones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    clone_name VARCHAR(100) NOT NULL,
    clone_description TEXT,
    learned_from VARCHAR(50) DEFAULT 'personal',
    training_data_sources JSONB DEFAULT '[]',
    clone_config JSONB DEFAULT '{}',
    autonomy_level INT DEFAULT 3 CHECK (autonomy_level BETWEEN 1 AND 5),
    max_actions_per_day INT DEFAULT 50,
    is_active BOOLEAN DEFAULT FALSE,
    total_runs INT DEFAULT 0,
    success_rate FLOAT DEFAULT 0,
    last_run_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ac_user ON agent_clones(user_id);

CREATE TABLE IF NOT EXISTS agent_action_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clone_id UUID REFERENCES agent_clones(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL,
    action_data JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'success',
    review_feedback VARCHAR(20),
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_aal_clone ON agent_action_logs(clone_id);

CREATE TABLE IF NOT EXISTS agent_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID REFERENCES users(id),
    creator_type VARCHAR(20) DEFAULT 'user',
    template_name VARCHAR(100) NOT NULL,
    template_description TEXT,
    template_category VARCHAR(50),
    template_config JSONB NOT NULL,
    is_public BOOLEAN DEFAULT FALSE,
    usage_count INT DEFAULT 0,
    rating FLOAT DEFAULT 0,
    tags JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_at_category ON agent_templates(template_category);

CREATE TABLE IF NOT EXISTS ai_conversation_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    response_length VARCHAR(20) DEFAULT 'medium',
    tone VARCHAR(30) DEFAULT 'professional',
    humor_level INT DEFAULT 3,
    emoji_usage BOOLEAN DEFAULT TRUE,
    preferred_language VARCHAR(10) DEFAULT 'zh-CN',
    explanation_depth VARCHAR(20) DEFAULT 'medium',
    include_sources BOOLEAN DEFAULT FALSE,
    ask_clarifying_questions BOOLEAN DEFAULT TRUE,
    proactive_suggestions BOOLEAN DEFAULT TRUE,
    summary_frequency VARCHAR(20) DEFAULT 'weekly',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS claw_personality (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    voice_id VARCHAR(100),
    voice_speed FLOAT DEFAULT 1.0,
    voice_pitch FLOAT DEFAULT 1.0,
    speaking_style VARCHAR(50) DEFAULT 'warm',
    greeting_style VARCHAR(50) DEFAULT 'casual',
    use_nickname BOOLEAN DEFAULT FALSE,
    nickname VARCHAR(50),
    pronoun VARCHAR(20),
    avatar_url VARCHAR(500),
    avatar_style VARCHAR(50) DEFAULT 'default',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 【NEW】跨平台同步层：设备同步、冲突、个人工具集成
-- ============================================

CREATE TABLE IF NOT EXISTS device_sync_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(100) NOT NULL,
    device_name VARCHAR(100),
    device_type VARCHAR(50),
    last_sync_at TIMESTAMP,
    sync_token VARCHAR(200),
    data_versions JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, device_id)
);

CREATE TABLE IF NOT EXISTS sync_conflicts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(100),
    data_type VARCHAR(50) NOT NULL,
    conflict_data JSONB NOT NULL,
    resolution VARCHAR(20) DEFAULT 'pending',
    resolved_with JSONB,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS personal_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    integration_type VARCHAR(50) NOT NULL,
    provider_name VARCHAR(50),
    config JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_sync_at TIMESTAMP,
    sync_status VARCHAR(20) DEFAULT 'idle',
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, integration_type, provider_name)
);

COMMIT;

-- 完成
SELECT 'Migration 004 completed: Claw enhanced features' AS status;
