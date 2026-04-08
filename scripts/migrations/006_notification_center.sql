-- ============================================
-- 006_notification_center.sql
-- 实时通知中心 + 触手↔大脑双向通知通道
-- ============================================

-- 通知渠道定义表
CREATE TABLE IF NOT EXISTS notification_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    channel_type VARCHAR(50) NOT NULL,         -- in_app / email / wechat / webhook
    endpoint VARCHAR(500),                       -- 邮箱/企微openid/webhook地址
    enabled BOOLEAN DEFAULT true,
    settings JSONB DEFAULT '{}',                -- 免打扰时段/关键词过滤等
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, channel_type)
);

-- 通知分类模板表（定义有哪些通知类型）
CREATE TABLE IF NOT EXISTS notification_types (
    id SERIAL PRIMARY KEY,
    type_code VARCHAR(100) UNIQUE NOT NULL,
    type_name VARCHAR(200) NOT NULL,
    description TEXT,
    icon VARCHAR(50) DEFAULT '🔔',
    priority INTEGER DEFAULT 5,                 -- 1-9, 越高越重要
    default_channels TEXT[] DEFAULT ARRAY['in_app'],
    ttl_hours INTEGER DEFAULT 720,              -- 72小时后自动归档
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 通知记录表
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID REFERENCES users(id) ON DELETE CASCADE,
    notification_type VARCHAR(100) NOT NULL,
    title VARCHAR(500) NOT NULL,
    content TEXT,
    content_html TEXT,
    priority INTEGER DEFAULT 5,
    source VARCHAR(100),                        -- 'brain' / 'tentacle' / 'system'
    source_enterprise_id UUID REFERENCES enterprises(id),
    source_user_id UUID REFERENCES users(id),   -- 谁发的（触手发大脑时）
    metadata JSONB DEFAULT '{}',                -- 扩展字段（action_url/category等）
    read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    archived BOOLEAN DEFAULT false,
    expires_at TIMESTAMPTZ,                    -- 过期时间
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(recipient_id) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_notifications_source ON notifications(source, source_enterprise_id);

-- 通知操作日志（追踪已读/点击/归档等）
CREATE TABLE IF NOT EXISTS notification_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,                -- read / click / archive / dismiss
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 推送通道配置表
CREATE TABLE IF NOT EXISTS enterprise_push_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE UNIQUE,
    -- 推送规则
    auto_push_announcements BOOLEAN DEFAULT true,
    auto_push_onboarding BOOLEAN DEFAULT true,
    auto_push_offboarding BOOLEAN DEFAULT false,
    auto_push_tasks BOOLEAN DEFAULT true,
    auto_push_reminders BOOLEAN DEFAULT true,
    -- 推送频率限制
    max_daily_push_per_tentacle INTEGER DEFAULT 20,
    quiet_hours_start TIME DEFAULT '22:00',
    quiet_hours_end TIME DEFAULT '08:00',
    -- 群发配置
    allow_broadcast BOOLEAN DEFAULT true,
    broadcast_require_approval BOOLEAN DEFAULT false,
    -- webhook
    webhook_url VARCHAR(500),
    webhook_secret VARCHAR(200),
    -- 统计
    stats JSONB DEFAULT '{"today_sent": 0, "today_delivered": 0, "total_sent": 0}',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 批量推送任务表
CREATE TABLE IF NOT EXISTS push_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID REFERENCES enterprises(id),
    creator_id UUID REFERENCES users(id),
    title VARCHAR(500) NOT NULL,
    content TEXT,
    content_html TEXT,
    target_type VARCHAR(50) DEFAULT 'all',      -- all / role / department / selected
    target_filter JSONB DEFAULT '{}',           -- {"roles": ["admin"], "departments": ["技术部"]}
    target_user_ids UUID[],
    status VARCHAR(50) DEFAULT 'draft',         -- draft / approved / sending / sent / failed
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    stats JSONB DEFAULT '{"total": 0, "sent": 0, "delivered": 0, "read": 0, "clicked": 0}',
    approval_status VARCHAR(50) DEFAULT 'pending', -- pending / approved / rejected
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 视频会议表
-- ============================================
CREATE TABLE IF NOT EXISTS video_meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID REFERENCES enterprises(id),
    creator_id UUID REFERENCES users(id),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    meeting_type VARCHAR(50) DEFAULT 'scheduled',  -- instant / scheduled / recurring
    -- 腾讯会议集成
    tencent_meeting_id VARCHAR(100),
    tencent_meeting_code VARCHAR(100),
    tencent_join_url VARCHAR(1000),
    tencent_host_url VARCHAR(1000),
    -- 会议设置
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    duration_minutes INTEGER DEFAULT 60,
    password VARCHAR(100),
    max_participants INTEGER DEFAULT 300,
    -- 录制
    auto_record BOOLEAN DEFAULT false,
    record_enabled BOOLEAN DEFAULT true,
    -- 议程
    agenda JSONB DEFAULT '[]',
    -- 状态
    status VARCHAR(50) DEFAULT 'scheduled',     -- scheduled / in_progress / ended / cancelled
    actual_start TIMESTAMPTZ,
    actual_end TIMESTAMPTZ,
    -- 统计
    stats JSONB DEFAULT '{"participant_count": 0, "duration_actual": 0}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 会议参与者
CREATE TABLE IF NOT EXISTS meeting_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID REFERENCES video_meetings(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    email VARCHAR(200),
    name VARCHAR(200),
    role VARCHAR(50) DEFAULT 'attendee',       -- host / co_host / attendee
    status VARCHAR(50) DEFAULT 'invited',       -- invited / joined / left / absent / declined
    joined_at TIMESTAMPTZ,
    left_at TIMESTAMPTZ,
    -- 腾讯会议字段
    tencent_userid VARCHAR(100),
    join_url VARCHAR(1000),
    -- 会议纪要
    auto_summary TEXT,
    manual_summary TEXT,
    summary_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(meeting_id, user_id)
);

-- 会议录制
CREATE TABLE IF NOT EXISTS meeting_recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID REFERENCES video_meetings(id) ON DELETE CASCADE,
    file_name VARCHAR(500),
    file_url VARCHAR(1000),
    file_size_bytes BIGINT,
    duration_seconds INTEGER,
    format VARCHAR(20) DEFAULT 'mp4',
    status VARCHAR(50) DEFAULT 'processing',     -- processing / ready / failed
    storage_path VARCHAR(1000),
    download_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 会议议程项
CREATE TABLE IF NOT EXISTS meeting_agenda_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID REFERENCES video_meetings(id) ON DELETE CASCADE,
    item_order INTEGER NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    duration_minutes INTEGER DEFAULT 5,
    presenter_id UUID REFERENCES users(id),
    notes TEXT,
    status VARCHAR(50) DEFAULT 'pending',       -- pending / discussed / skipped
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 会议行动项
CREATE TABLE IF NOT EXISTS meeting_action_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID REFERENCES video_meetings(id) ON DELETE CASCADE,
    assignee_id UUID REFERENCES users(id),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    due_date DATE,
    priority VARCHAR(20) DEFAULT 'normal',     -- low / normal / high / urgent
    status VARCHAR(50) DEFAULT 'open',          -- open / in_progress / completed / cancelled
    completed_at TIMESTAMPTZ,
    meeting_participant_id UUID REFERENCES meeting_participants(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_meetings_enterprise ON video_meetings(enterprise_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_creator ON video_meetings(creator_id);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON video_meetings(status);
CREATE INDEX IF NOT EXISTS idx_participants_meeting ON meeting_participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_participants_user ON meeting_participants(user_id);

-- ============================================
-- 插入默认通知类型
-- ============================================
INSERT INTO notification_types (type_code, type_name, description, icon, priority, default_channels, ttl_hours) VALUES
-- 企业->触手
('announcement', '📢 企业公告', '企业发布的公告通知', '📢', 7, ARRAY['in_app', 'email'], 720),
('onboarding_task', '🎯 入职任务', '新入职任务提醒', '🎯', 6, ARRAY['in_app'], 336),
('onboarding_reminder', '⏰ 入职提醒', '入职任务即将到期提醒', '⏰', 5, ARRAY['in_app'], 168),
('onboarding_approved', '✅ 任务已通过', '入职任务审批通过', '✅', 4, ARRAY['in_app'], 168),
('onboarding_rejected', '❌ 任务需补充', '入职任务需要补充材料', '❌', 6, ARRAY['in_app'], 168),
('join_approved', '🎉 加入申请通过', '您的加入申请已通过', '🎉', 8, ARRAY['in_app', 'email'], 999),
('join_rejected', '😔 加入申请未通过', '您的加入申请未通过', '😔', 5, ARRAY['in_app'], 168),
('offboarding_started', '📤 离职流程启动', '您的离职流程已启动', '📤', 8, ARRAY['in_app', 'email'], 999),
('offboarding_reminder', '⏰ 离职物品提醒', '请在最后工作日前归还物品', '⏰', 7, ARRAY['in_app'], 72),
('claw_health_warning', '⚠️ Claw健康预警', '触手Claw状态异常', '⚠️', 7, ARRAY['in_app'], 168),
('company_info_update', '🏢 公司信息更新', '公司公开信息已更新', '🏢', 3, ARRAY['in_app'], 720),
-- 触手->企业
('tentacle_join_request', '🤝 新加入申请', '有新员工申请加入企业', '🤝', 8, ARRAY['in_app'], 72),
('tentacle_offline', '💤 触手离线', '员工触手已离线', '💤', 4, ARRAY['in_app'], 72),
-- 系统通知
('system_maintenance', '🔧 系统维护', '系统维护通知', '🔧', 9, ARRAY['in_app', 'email'], 168),
('security_alert', '🔒 安全提醒', '账号安全相关提醒', '🔒', 9, ARRAY['in_app', 'email'], 168)
ON CONFLICT (type_code) DO NOTHING;

-- ============================================
-- 插入默认企业推送配置
-- ============================================
INSERT INTO enterprise_push_configs (enterprise_id)
SELECT id FROM enterprises
ON CONFLICT (enterprise_id) DO NOTHING;
