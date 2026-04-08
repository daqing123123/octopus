-- ============================================
-- 006_features_full.sql
-- 5个功能完整表结构：
-- 1. 实时通知中心 2. 入职向导 3. 通讯录 4. 档案完善度 5. 视频会议
-- ============================================

BEGIN;

-- ============================================
-- Part 1: 通知中心
-- ============================================

CREATE TABLE IF NOT EXISTS notification_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    channel_type VARCHAR(50) NOT NULL,
    endpoint VARCHAR(500),
    enabled BOOLEAN DEFAULT true,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, channel_type)
);

CREATE TABLE IF NOT EXISTS notification_types (
    id SERIAL PRIMARY KEY,
    type_code VARCHAR(100) UNIQUE NOT NULL,
    type_name VARCHAR(200) NOT NULL,
    description TEXT,
    icon VARCHAR(50) DEFAULT '🔔',
    priority INTEGER DEFAULT 5,
    default_channels TEXT[] DEFAULT ARRAY['in_app'],
    ttl_hours INTEGER DEFAULT 720,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID REFERENCES users(id) ON DELETE CASCADE,
    notification_type VARCHAR(100) NOT NULL,
    title VARCHAR(500) NOT NULL,
    content TEXT,
    content_html TEXT,
    priority INTEGER DEFAULT 5,
    source VARCHAR(100) DEFAULT 'system',
    source_enterprise_id UUID REFERENCES enterprises(id),
    source_user_id UUID REFERENCES users(id),
    metadata JSONB DEFAULT '{}',
    read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    archived BOOLEAN DEFAULT false,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(recipient_id) WHERE read = false;

CREATE TABLE IF NOT EXISTS notification_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS enterprise_push_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE UNIQUE,
    auto_push_announcements BOOLEAN DEFAULT true,
    auto_push_onboarding BOOLEAN DEFAULT true,
    auto_push_offboarding BOOLEAN DEFAULT false,
    auto_push_tasks BOOLEAN DEFAULT true,
    auto_push_reminders BOOLEAN DEFAULT true,
    max_daily_push_per_tentacle INTEGER DEFAULT 20,
    quiet_hours_start TIME DEFAULT '22:00',
    quiet_hours_end TIME DEFAULT '08:00',
    allow_broadcast BOOLEAN DEFAULT true,
    broadcast_require_approval BOOLEAN DEFAULT false,
    webhook_url VARCHAR(500),
    webhook_secret VARCHAR(200),
    stats JSONB DEFAULT '{"today_sent": 0, "total_sent": 0}',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID REFERENCES enterprises(id),
    creator_id UUID REFERENCES users(id),
    title VARCHAR(500) NOT NULL,
    content TEXT,
    content_html TEXT,
    target_type VARCHAR(50) DEFAULT 'all',
    target_filter JSONB DEFAULT '{}',
    target_user_ids UUID[],
    status VARCHAR(50) DEFAULT 'draft',
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    stats JSONB DEFAULT '{"total": 0, "sent": 0, "delivered": 0, "read": 0}',
    approval_status VARCHAR(50) DEFAULT 'pending',
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Part 2: 入职向导
-- ============================================

CREATE TABLE IF NOT EXISTS onboarding_wizards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    icon VARCHAR(50) DEFAULT '🎯',
    is_default BOOLEAN DEFAULT false,
    steps JSONB DEFAULT '[]',
    -- 步骤示例:
    -- [{"order":1,"title":"欢迎","icon":"🎉","template":"welcome","required":false},
    --  {"order":2,"title":"公司介绍","icon":"🏢","template":"company","required":true},
    --  {"order":3,"title":"团队介绍","icon":"👥","template":"team","required":false},
    --  {"order":4,"title":"IT设备领用","icon":"💻","template":"equipment","required":true},
    --  {"order":5,"title":"HR流程","icon":"📋","template":"hr","required":true},
    --  {"order":6,"title":"培训学习","icon":"📚","template":"training","required":false},
    --  {"order":7,"title":"安全合规","icon":"🔒","template":"security","required":true},
    --  {"order":8,"title":"完成入职","icon":"✅","template":"complete","required":false}]
    estimated_minutes INTEGER DEFAULT 45,
    is_active BOOLEAN DEFAULT true,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_wizard_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wizard_id UUID REFERENCES onboarding_wizards(id),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    enterprise_id UUID REFERENCES enterprises(id),
    current_step INTEGER DEFAULT 1,
    completed_steps JSONB DEFAULT '[]',
    step_data JSONB DEFAULT '{}',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    satisfaction_rating INTEGER,
    satisfaction_comment TEXT,
    UNIQUE(wizard_id, user_id)
);

CREATE TABLE IF NOT EXISTS onboarding_equipment_checklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    category VARCHAR(100),
    items JSONB DEFAULT '[]',
    -- [{"name":"MacBook Pro 14寸","type":"laptop","serial_required":true},
    --  {"name":"iPhone 备用机","type":"phone","serial_required":false},
    --  {"name":"工牌","type":"badge","serial_required":false},
    --  {"name":"显示器","type":"monitor","serial_required":true}]
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_equipment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    enterprise_id UUID REFERENCES enterprises(id),
    wizard_progress_id UUID REFERENCES employee_wizard_progress(id),
    checklist_id UUID REFERENCES onboarding_equipment_checklist(id),
    item_name VARCHAR(200) NOT NULL,
    item_type VARCHAR(100),
    serial_number VARCHAR(200),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    returned_at TIMESTAMPTZ,
    condition_on_issue VARCHAR(100) DEFAULT 'new',
    condition_on_return VARCHAR(100),
    notes TEXT
);

CREATE TABLE IF NOT EXISTS onboarding_company_intro (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID REFERENCES enterprises(id) ON NOT EXISTS CASCADE,
    section VARCHAR(100) NOT NULL,
    content TEXT,
    content_html TEXT,
    media_urls TEXT[] DEFAULT '{}',
    display_order INTEGER DEFAULT 0,
    is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(enterprise_id, section)
);

-- ============================================
-- Part 3: 企业通讯录 & 组织架构
-- ============================================

CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES departments(id),
    name VARCHAR(200) NOT NULL,
    code VARCHAR(50),
    description TEXT,
    manager_id UUID REFERENCES users(id),
    color VARCHAR(20),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_titles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    level INTEGER DEFAULT 1,
    department_id UUID REFERENCES departments(id),
    is_active BOOLEAN DEFAULT true,
    UNIQUE(enterprise_id, name)
);

CREATE TABLE IF NOT EXISTS employee_directory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id),
    job_title_id UUID REFERENCES job_titles(id),
    display_name VARCHAR(200),
    phone VARCHAR(50),
    work_phone VARCHAR(50),
    work_email VARCHAR(200),
    location VARCHAR(200),
    bio TEXT,
    skills TEXT[] DEFAULT '{}',
    availability_status VARCHAR(50) DEFAULT 'available',
    show_in_directory BOOLEAN DEFAULT true,
    show_phone BOOLEAN DEFAULT false,
    show_email BOOLEAN DEFAULT true,
    show_skills BOOLEAN DEFAULT true,
    avatar_url VARCHAR(500),
    last_active TIMESTAMPTZ,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(enterprise_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_department_enterprise ON departments(enterprise_id, is_active);
CREATE INDEX IF NOT EXISTS idx_directory_enterprise ON employee_directory(enterprise_id, show_in_directory);
CREATE INDEX IF NOT EXISTS idx_directory_department ON employee_directory(department_id);

-- ============================================
-- Part 4: 档案完善度评分
-- ============================================

CREATE TABLE IF NOT EXISTS profile_completeness_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    field_name VARCHAR(100) NOT NULL,
    field_label VARCHAR(200) NOT NULL,
    field_group VARCHAR(100),
    weight INTEGER DEFAULT 10,
    is_required BOOLEAN DEFAULT false,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    UNIQUE(enterprise_id, field_name)
);

CREATE TABLE IF NOT EXISTS employee_completeness (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    enterprise_id UUID REFERENCES enterprises(id),
    profile_completeness JSONB DEFAULT '{}',
    overall_score INTEGER DEFAULT 0,
    base_score INTEGER DEFAULT 0,
    bonus_score INTEGER DEFAULT 0,
    last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, enterprise_id)
);

-- ============================================
-- Part 5: 视频会议
-- ============================================

CREATE TABLE IF NOT EXISTS video_meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID REFERENCES enterprises(id),
    creator_id UUID REFERENCES users(id),
    department_id UUID REFERENCES departments(id),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    meeting_type VARCHAR(50) DEFAULT 'scheduled',
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    duration_minutes INTEGER DEFAULT 60,
    timezone VARCHAR(50) DEFAULT 'Asia/Shanghai',
    password VARCHAR(100),
    max_participants INTEGER DEFAULT 300,
    auto_record BOOLEAN DEFAULT false,
    record_enabled BOOLEAN DEFAULT true,
    agenda JSONB DEFAULT '[]',
    status VARCHAR(50) DEFAULT 'scheduled',
    actual_start TIMESTAMPTZ,
    actual_end TIMESTAMPTZ,
    recurrence_rule VARCHAR(200),
    recurring_parent_id UUID REFERENCES video_meetings(id),
    stats JSONB DEFAULT '{"participant_count": 0}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID REFERENCES video_meetings(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    email VARCHAR(200),
    name VARCHAR(200),
    role VARCHAR(50) DEFAULT 'attendee',
    status VARCHAR(50) DEFAULT 'invited',
    joined_at TIMESTAMPTZ,
    left_at TIMESTAMPTZ,
    join_url VARCHAR(1000),
    auto_summary TEXT,
    manual_summary TEXT,
    summary_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(meeting_id, user_id)
);

CREATE TABLE IF NOT EXISTS meeting_recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID REFERENCES video_meetings(id) ON DELETE CASCADE,
    file_name VARCHAR(500),
    file_url VARCHAR(1000),
    file_size_bytes BIGINT,
    duration_seconds INTEGER,
    format VARCHAR(20) DEFAULT 'mp4',
    status VARCHAR(50) DEFAULT 'processing',
    download_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_action_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID REFERENCES video_meetings(id) ON DELETE CASCADE,
    assignee_id UUID REFERENCES users(id),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    due_date DATE,
    priority VARCHAR(20) DEFAULT 'normal',
    status VARCHAR(50) DEFAULT 'open',
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meetings_enterprise ON video_meetings(enterprise_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_creator ON video_meetings(creator_id);
CREATE INDEX IF NOT EXISTS idx_participants_meeting ON meeting_participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_participants_user ON meeting_participants(user_id);

-- ============================================
-- 插入默认通知类型
-- ============================================

INSERT INTO notification_types (type_code, type_name, icon, priority, default_channels, ttl_hours) VALUES
('announcement', '📢 企业公告', '📢', 7, ARRAY['in_app', 'email'], 720),
('onboarding_task', '🎯 入职任务', '🎯', 6, ARRAY['in_app'], 336),
('onboarding_reminder', '⏰ 入职提醒', '⏰', 5, ARRAY['in_app'], 168),
('onboarding_approved', '✅ 任务已通过', '✅', 4, ARRAY['in_app'], 168),
('onboarding_rejected', '❌ 任务需补充', '❌', 6, ARRAY['in_app'], 168),
('join_approved', '🎉 加入申请通过', '🎉', 8, ARRAY['in_app', 'email'], 999),
('join_rejected', '😔 加入申请未通过', '😔', 5, ARRAY['in_app'], 168),
('offboarding_started', '📤 离职流程启动', '📤', 8, ARRAY['in_app', 'email'], 999),
('offboarding_reminder', '⏰ 离职物品提醒', '⏰', 7, ARRAY['in_app'], 72),
('claw_health_warning', '⚠️ Claw健康预警', '⚠️', 7, ARRAY['in_app'], 168),
('company_info_update', '🏢 公司信息更新', '🏢', 3, ARRAY['in_app'], 720),
('tentacle_join_request', '🤝 新加入申请', '🤝', 8, ARRAY['in_app'], 72),
('tentacle_offline', '💤 触手离线', '💤', 4, ARRAY['in_app'], 72),
('meeting_reminder', '📹 会议提醒', '📹', 6, ARRAY['in_app', 'email'], 24),
('meeting_started', '🔴 会议已开始', '🔴', 5, ARRAY['in_app'], 2),
('meeting_summary', '📝 会议纪要', '📝', 4, ARRAY['in_app'], 168),
('system_maintenance', '🔧 系统维护', '🔧', 9, ARRAY['in_app', 'email'], 168),
('security_alert', '🔒 安全提醒', '🔒', 9, ARRAY['in_app', 'email'], 168)
ON CONFLICT (type_code) DO NOTHING;

COMMIT;
