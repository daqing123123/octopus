-- ============================================================
-- 009_collab_meeting.sql
-- 实时协作与视频会议数据表
-- ============================================================

-- 1. 协作文档表
CREATE TABLE IF NOT EXISTS collab_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL DEFAULT '新文档',
    type VARCHAR(50) DEFAULT 'document',  -- document, spreadsheet, whiteboard
    content TEXT,
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id),
    is_archived BOOLEAN DEFAULT false,
    active_users JSONB DEFAULT '{}',  -- {userId: {userName, color, joinedAt}}
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_collab_enterprise ON collab_documents(enterprise_id);
CREATE INDEX idx_collab_created_by ON collab_documents(created_by);

-- 2. 协作文档版本表
CREATE TABLE IF NOT EXISTS collab_document_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES collab_documents(id) ON DELETE CASCADE,
    version_name VARCHAR(200),
    snapshot JSONB,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_doc_version_doc ON collab_document_versions(document_id);

-- 3. 协作评论表
CREATE TABLE IF NOT EXISTS collab_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES collab_documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    user_name VARCHAR(100),
    content TEXT NOT NULL,
    position JSONB,  -- {paragraph: number, offset: number}
    resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_comment_doc ON collab_comments(document_id);

-- 4. 视频会议表
CREATE TABLE IF NOT EXISTS video_meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL DEFAULT '视频会议',
    host_id UUID NOT NULL REFERENCES users(id),
    enterprise_id UUID REFERENCES enterprises(id) ON DELETE SET NULL,
    scheduled_start TIMESTAMP,
    scheduled_end TIMESTAMP,
    settings JSONB DEFAULT '{}',  -- {isPublic, requirePassword, password, maxParticipants, ...}
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_meeting_host ON video_meetings(host_id);
CREATE INDEX idx_meeting_enterprise ON video_meetings(enterprise_id);
CREATE INDEX idx_meeting_status ON video_meetings(started_at, ended_at);

-- 5. 会议录制表
CREATE TABLE IF NOT EXISTS meeting_recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES video_meetings(id) ON DELETE CASCADE,
    filename VARCHAR(500),
    duration_seconds INTEGER,
    size_bytes BIGINT,
    storage_path VARCHAR(500),
    status VARCHAR(20) DEFAULT 'processing',  -- processing, ready, failed
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_recording_meeting ON meeting_recordings(meeting_id);

-- 6. 会议参与者历史表
CREATE TABLE IF NOT EXISTS meeting_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES video_meetings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    joined_at TIMESTAMP DEFAULT NOW(),
    left_at TIMESTAMP,
    duration_seconds INTEGER,
    UNIQUE(meeting_id, user_id)
);

CREATE INDEX idx_participant_meeting ON meeting_participants(meeting_id);
CREATE INDEX idx_participant_user ON meeting_participants(user_id);

-- 7. 会议聊天消息表
CREATE TABLE IF NOT EXISTS meeting_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES video_meetings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_meeting_chat_meeting ON meeting_chat_messages(meeting_id);

-- ============================================================
-- 更新入职向导表（确保字段存在）
-- ============================================================

ALTER TABLE onboarding_templates 
ADD COLUMN IF NOT EXISTS tasks JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS estimated_days INTEGER DEFAULT 7,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- ============================================================
-- 插入示例数据
-- ============================================================

-- 示例协作文档
INSERT INTO collab_documents (id, title, type, enterprise_id, created_by, created_at)
VALUES 
    (gen_random_uuid(), '会议纪要模板', 'document', NULL, NULL, NOW()),
    (gen_random_uuid(), '项目计划表', 'spreadsheet', NULL, NULL, NOW()),
    (gen_random_uuid(), '头脑风暴白板', 'whiteboard', NULL, NULL, NOW())
ON CONFLICT DO NOTHING;

COMMENT ON TABLE collab_documents IS '协作文档表';
COMMENT ON TABLE video_meetings IS '视频会议表';
COMMENT ON TABLE meeting_recordings IS '会议录制表';
