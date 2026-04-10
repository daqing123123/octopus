'use client'

import { useState, useEffect, useCallback } from 'react'
import { CommentSection, OnlineCollaborators, PermissionPanel, TaskAssociationPanel } from './CollabPage'

type TabType = 'comments' | 'collaborators' | 'permissions' | 'tasks'

interface CollabSidebarProps {
  resourceType: string
  resourceId: string
  resourceName?: string
  activeTab?: TabType
  onTabChange?: (tab: TabType) => void
}

export default function CollabSidebar({
  resourceType,
  resourceId,
  resourceName,
  activeTab: controlledTab,
  onTabChange
}: CollabSidebarProps) {
  const [tab, setTab] = useState<TabType>(controlledTab || 'comments')
  const [canComment, setCanComment] = useState(true)
  const [canManage, setCanManage] = useState(false)

  // 权限检查
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const res = await fetch(`/api/permissions/check?resourceType=${resourceType}&resourceId=${resourceId}`)
        const data = await res.json()
        if (data.success) {
          setCanComment(data.data.canComment)
          setCanManage(data.data.canAdmin)
        }
      } catch (e) {
        console.error('权限检查失败', e)
      }
    }
    checkPermissions()
  }, [resourceType, resourceId])

  // 加入协作会话
  useEffect(() => {
    const joinSession = async () => {
      try {
        await fetch('/api/sessions/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resourceType, resourceId, sessionType: 'viewing' })
        })
      } catch (e) {
        console.error('加入会话失败', e)
      }
    }
    joinSession()

    // 离开时
    return () => {
      fetch('/api/sessions/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceId })
      }).catch(() => {})
    }
  }, [resourceType, resourceId])

  const handleTabChange = (newTab: TabType) => {
    setTab(newTab)
    onTabChange?.(newTab)
  }

  const TABS = [
    { key: 'comments' as TabType, label: '💬', title: '评论' },
    { key: 'collaborators' as TabType, label: '👥', title: '在线' },
    { key: 'permissions' as TabType, label: '🔐', title: '权限' },
    { key: 'tasks' as TabType, label: '✅', title: '任务' },
  ]

  return (
    <div className="flex h-full">
      {/* 标签栏 */}
      <div className="w-12 bg-gray-100 border-r flex flex-col py-2">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => handleTabChange(t.key)}
            title={t.title}
            className={`w-full h-12 flex flex-col items-center justify-center text-xs gap-1
              ${tab === t.key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <span className="text-lg">{t.label}</span>
            <span>{t.title}</span>
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-hidden">
        {tab === 'comments' && (
          <div className="h-full overflow-y-auto p-4">
            <h3 className="font-medium mb-4">💬 评论</h3>
            <CommentSection
              resourceType={resourceType}
              resourceId={resourceId}
              canComment={canComment}
            />
          </div>
        )}

        {tab === 'collaborators' && (
          <div className="h-full overflow-y-auto p-4">
            <h3 className="font-medium mb-4">👥 在线协作者</h3>
            <OnlineCollaborators resourceId={resourceId} />
          </div>
        )}

        {tab === 'permissions' && (
          <div className="h-full overflow-y-auto p-4">
            <h3 className="font-medium mb-4">🔐 权限管理</h3>
            {canManage ? (
              <PermissionPanel resourceId={resourceId} resourceName={resourceName || ''} />
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-400">你没有管理权限</p>
              </div>
            )}
          </div>
        )}

        {tab === 'tasks' && (
          <div className="h-full overflow-y-auto p-4">
            <h3 className="font-medium mb-4">✅ 关联任务</h3>
            <TaskAssociationPanel taskId={resourceId} />
          </div>
        )}
      </div>
    </div>
  )
}
