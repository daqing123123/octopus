'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// 评论组件
export function CommentSection({
  resourceType,
  resourceId,
  canComment = true
}: {
  resourceType: string
  resourceId: string
  canComment?: boolean
}) {
  const [comments, setComments] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [newComment, setNewComment] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const commentsEndRef = useRef<HTMLDivElement>(null)

  const loadComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/comments?resourceType=${resourceType}&resourceId=${resourceId}`)
      const data = await res.json()
      if (data.success) {
        setComments(data.data.comments)
        setStats(data.data.stats)
      }
    } catch (e) {
      console.error('加载评论失败', e)
    } finally {
      setLoading(false)
    }
  }, [resourceType, resourceId])

  useEffect(() => {
    loadComments()
  }, [loadComments])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim()) return

    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceType,
          resourceId,
          parentId: replyingTo,
          content: newComment,
        })
      })
      const data = await res.json()
      if (data.success) {
        setNewComment('')
        setReplyingTo(null)
        loadComments()
      }
    } catch (e) {
      console.error('发送评论失败', e)
    }
  }

  const handleReact = async (commentId: string, emoji: string) => {
    try {
      await fetch(`/api/comments/${commentId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji, action: 'add' })
      })
      loadComments()
    } catch (e) {
      console.error('反应失败', e)
    }
  }

  const handleResolve = async (commentId: string) => {
    try {
      await fetch(`/api/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isResolved: true })
      })
      loadComments()
    } catch (e) {
      console.error('标记解决失败', e)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 统计栏 */}
      {stats && (
        <div className="flex gap-4 text-sm text-gray-500 border-b pb-3">
          <span>💬 {stats.total} 条评论</span>
          <span>✅ {stats.resolved} 已解决</span>
          <span>👥 {stats.participants} 人参与</span>
        </div>
      )}

      {/* 评论列表 */}
      <div className="space-y-4 max-h-[500px] overflow-y-auto">
        {comments.length === 0 ? (
          <p className="text-gray-400 text-center py-8">暂无评论，开始讨论吧~</p>
        ) : (
          comments.map(comment => (
            <CommentItem
              key={comment.id}
              comment={comment}
              onReply={() => setReplyingTo(comment.id)}
              onReact={handleReact}
              onResolve={handleResolve}
              replyingTo={replyingTo}
            />
          ))
        )}
        <div ref={commentsEndRef} />
      </div>

      {/* 输入框 */}
      {canComment && (
        <form onSubmit={handleSubmit} className="mt-4">
          {replyingTo && (
            <div className="flex items-center gap-2 mb-2 text-sm text-gray-500 bg-gray-50 p-2 rounded">
              <span>回复评论</span>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                className="ml-auto text-gray-400 hover:text-gray-600"
              >
                ✕ 取消
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="输入评论... (支持 @提及)"
              className="flex-1 p-3 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={3}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                  handleSubmit(e as any)
                }
              }}
            />
          </div>
          <div className="flex justify-between items-center mt-2">
            <div className="flex gap-1">
              {['👍', '❤️', '😊', '🚀', '👀'].map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {}}
                  className="text-lg hover:bg-gray-100 rounded p-1"
                >
                  {emoji}
                </button>
              ))}
            </div>
            <button
              type="submit"
              disabled={!newComment.trim()}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              发送
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

// 单条评论
function CommentItem({
  comment,
  onReply,
  onReact,
  onResolve,
  replyingTo
}: {
  comment: any
  onReply: () => void
  onReact: (commentId: string, emoji: string) => void
  onResolve: (commentId: string) => void
  replyingTo: string | null
}) {
  return (
    <div className={`flex gap-3 ${comment.is_pinned ? 'bg-yellow-50 p-3 rounded-lg border border-yellow-200' : ''}`}>
      {/* 头像 */}
      <div className="flex-shrink-0">
        {comment.author_avatar ? (
          <img src={comment.author_avatar} className="w-8 h-8 rounded-full" alt="" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-medium">
            {comment.author_name?.[0] || '?'}
          </div>
        )}
      </div>

      {/* 内容 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{comment.author_name}</span>
          {comment.is_pinned && <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">置顶</span>}
          {comment.is_resolved && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">已解决</span>}
          <span className="text-xs text-gray-400">{formatTime(comment.created_at)}</span>
        </div>

        <div className="mt-1 text-gray-700 whitespace-pre-wrap">{comment.content}</div>

        {/* 反应 */}
        {comment.reactions && Object.keys(comment.reactions).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {Object.entries(comment.reactions).map(([emoji, users]: [string, any]) => (
              users.length > 0 && (
                <span key={emoji} className="inline-flex items-center gap-1 bg-gray-100 rounded-full px-2 py-0.5 text-sm">
                  <span>{emoji}</span>
                  <span className="text-xs text-gray-500">{users.length}</span>
                </span>
              )
            ))}
          </div>
        )}

        {/* 操作 */}
        <div className="flex gap-3 mt-2 text-sm">
          <button onClick={onReply} className="text-gray-500 hover:text-blue-500">回复</button>
          <button onClick={() => onReact(comment.id, '👍')} className="text-gray-500 hover:text-blue-500">👍 赞</button>
          {!comment.is_resolved && (
            <button onClick={() => onResolve(comment.id)} className="text-gray-500 hover:text-green-500">✅ 解决</button>
          )}
        </div>

        {/* 子评论 */}
        {comment.children && comment.children.length > 0 && (
          <div className="mt-3 pl-4 border-l-2 border-gray-200 space-y-3">
            {comment.children.map((child: any) => (
              <CommentItem
                key={child.id}
                comment={child}
                onReply={onReply}
                onReact={onReact}
                onResolve={onResolve}
                replyingTo={replyingTo}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// 在线协作者组件
export function OnlineCollaborators({
  resourceId
}: {
  resourceId: string
}) {
  const [collaborators, setCollaborators] = useState<any[]>([])

  useEffect(() => {
    const loadCollaborators = async () => {
      try {
        const res = await fetch(`/api/sessions/online?resourceId=${resourceId}`)
        const data = await res.json()
        if (data.success) {
          setCollaborators(data.data)
        }
      } catch (e) {
        console.error('加载协作者失败', e)
      }
    }

    loadCollaborators()
    const interval = setInterval(loadCollaborators, 10000) // 每10秒刷新
    return () => clearInterval(interval)
  }, [resourceId])

  if (collaborators.length === 0) return null

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-500">在线:</span>
      <div className="flex -space-x-2">
        {collaborators.slice(0, 5).map((collab, idx) => (
          <div
            key={collab.id}
            className="relative"
            title={`${collab.name}${collab.session_type === 'editing' ? ' (编辑中)' : ''}`}
          >
            {collab.avatar_url ? (
              <img src={collab.avatar_url} className="w-8 h-8 rounded-full border-2 border-white" alt="" />
            ) : (
              <div className="w-8 h-8 rounded-full border-2 border-white bg-blue-500 text-white flex items-center justify-center text-xs font-medium">
                {collab.name?.[0]}
              </div>
            )}
            {collab.session_type === 'editing' && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white animate-pulse" />
            )}
            {idx === 4 && collaborators.length > 5 && (
              <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-200 text-gray-600 flex items-center justify-center text-xs">
                +{collaborators.length - 5}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// 权限设置面板
export function PermissionPanel({
  resourceId,
  resourceName
}: {
  resourceId: string
  resourceName: string
}) {
  const [permissions, setPermissions] = useState<any[]>([])
  const [resource, setResource] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showGrantModal, setShowGrantModal] = useState(false)

  const loadPermissions = useCallback(async () => {
    try {
      const res = await fetch(`/api/permissions/resources/${resourceId}`)
      const data = await res.json()
      if (data.success) {
        setPermissions(data.data.permissions)
        setResource(data.data.resource)
      }
    } catch (e) {
      console.error('加载权限失败', e)
    } finally {
      setLoading(false)
    }
  }, [resourceId])

  useEffect(() => {
    loadPermissions()
  }, [loadPermissions])

  const handleRevoke = async (permissionId: string) => {
    if (!confirm('确定要撤销此权限吗？')) return
    try {
      await fetch(`/api/permissions/resources/${resourceId}/permissions/${permissionId}`, {
        method: 'DELETE'
      })
      loadPermissions()
    } catch (e) {
      console.error('撤销权限失败', e)
    }
  }

  const handleGrant = async (principalType: string, principalId: string, permission: string) => {
    try {
      await fetch(`/api/permissions/resources/${resourceId}/grant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ principalType, principalId, permission })
      })
      setShowGrantModal(false)
      loadPermissions()
    } catch (e) {
      console.error('授予权限失败', e)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }

  const PERM_LABELS: Record<string, { label: string; color: string }> = {
    admin: { label: '管理员', color: 'bg-purple-100 text-purple-700' },
    edit: { label: '可编辑', color: 'bg-blue-100 text-blue-700' },
    comment: { label: '可评论', color: 'bg-yellow-100 text-yellow-700' },
    view: { label: '可查看', color: 'bg-gray-100 text-gray-700' },
  }

  return (
    <div className="space-y-4">
      {/* 资源信息 */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-medium">{resourceName}</h3>
        <p className="text-sm text-gray-500 mt-1">
          所有者: {resource?.owner_name} | 敏感度: {resource?.sensitivity_level || 'internal'}
        </p>
      </div>

      {/* 权限列表 */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <h4 className="font-medium">已授权</h4>
          <button
            onClick={() => setShowGrantModal(true)}
            className="text-sm text-blue-500 hover:text-blue-600"
          >
            + 添加授权
          </button>
        </div>

        {permissions.length === 0 ? (
          <p className="text-gray-400 text-sm py-4 text-center">暂无自定义权限</p>
        ) : (
          <div className="divide-y">
            {permissions.map(perm => (
              <div key={perm.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm">
                    {perm.user_name?.[0] || perm.role_name?.[0] || perm.dept_name?.[0] || '👤'}
                  </div>
                  <div>
                    <p className="font-medium text-sm">
                      {perm.user_name || perm.role_name || perm.dept_name || (
                        perm.principal_type === 'everyone' ? '🌐 所有人' : perm.principal_type
                      )}
                    </p>
                    <p className="text-xs text-gray-400">
                      {perm.principal_type === 'user' ? '用户' : perm.principal_type === 'role' ? '角色' : '部门'}
                      {perm.expires_at && ` | 有效期至 ${new Date(perm.expires_at).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded ${PERM_LABELS[perm.permission]?.color || 'bg-gray-100'}`}>
                    {PERM_LABELS[perm.permission]?.label || perm.permission}
                  </span>
                  <button
                    onClick={() => handleRevoke(perm.id)}
                    className="text-gray-400 hover:text-red-500 text-sm"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 授权弹窗 */}
      {showGrantModal && (
        <GrantModal
          resourceId={resourceId}
          onClose={() => setShowGrantModal(false)}
          onGrant={handleGrant}
        />
      )}
    </div>
  )
}

// 授权弹窗
function GrantModal({
  resourceId,
  onClose,
  onGrant
}: {
  resourceId: string
  onClose: () => void
  onGrant: (type: string, id: string, perm: string) => void
}) {
  const [principalType, setPrincipalType] = useState('user')
  const [principalId, setPrincipalId] = useState('')
  const [permission, setPermission] = useState('view')

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-medium mb-4">添加授权</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">授权对象</label>
            <div className="flex gap-2">
              {[
                { value: 'user', label: '👤 用户' },
                { value: 'role', label: '🎭 角色' },
                { value: 'department', label: '🏢 部门' },
                { value: 'everyone', label: '🌐 所有人' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setPrincipalType(opt.value)}
                  className={`flex-1 py-2 text-sm rounded border ${principalType === opt.value ? 'bg-blue-50 border-blue-500 text-blue-700' : 'border-gray-200'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {principalType !== 'everyone' && (
            <div>
              <label className="block text-sm font-medium mb-1">ID</label>
              <input
                type="text"
                value={principalId}
                onChange={(e) => setPrincipalId(e.target.value)}
                placeholder="输入用户/角色/部门 ID"
                className="w-full p-2 border rounded"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">权限级别</label>
            <select
              value={permission}
              onChange={(e) => setPermission(e.target.value)}
              className="w-full p-2 border rounded"
            >
              <option value="view">👁 可查看</option>
              <option value="comment">💬 可评论</option>
              <option value="edit">✏ 可编辑</option>
              <option value="admin">🔐 管理员</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="flex-1 py-2 border rounded hover:bg-gray-50">
            取消
          </button>
          <button
            onClick={() => onGrant(principalType, principalId, permission)}
            disabled={principalType !== 'everyone' && !principalId}
            className="flex-1 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            确认授权
          </button>
        </div>
      </div>
    </div>
  )
}

// 任务关联面板
export function TaskAssociationPanel({
  taskId
}: {
  taskId: string
}) {
  const [associations, setAssociations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)

  const loadAssociations = useCallback(async () => {
    try {
      const res = await fetch(`/api/task-associations/task/${taskId}`)
      const data = await res.json()
      if (data.success) {
        setAssociations(data.data)
      }
    } catch (e) {
      console.error('加载关联失败', e)
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    loadAssociations()
  }, [loadAssociations])

  const handleDelete = async (assocId: string) => {
    if (!confirm('确定删除此关联？')) return
    try {
      await fetch(`/api/task-associations/${assocId}`, { method: 'DELETE' })
      loadAssociations()
    } catch (e) {
      console.error('删除关联失败', e)
    }
  }

  const TYPE_LABELS: Record<string, string> = {
    document: '📄 文档', task: '✅ 任务', meeting: '📅 会议',
    file: '📎 文件', approval: '📋 审批'
  }

  const ASSOC_LABELS: Record<string, string> = {
    parent: '🔝 父任务', child: '🔽 子任务', related: '🔗 相关', blocks: '🚫 阻塞', blocked_by: '⏳ 等待', implements: '🛠 实现'
  }

  if (loading) {
    return <div className="animate-pulse h-32 bg-gray-100 rounded" />
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium">关联资源 ({associations.length})</span>
        <button
          onClick={() => setShowAddModal(true)}
          className="text-sm text-blue-500 hover:text-blue-600"
        >
          + 添加关联
        </button>
      </div>

      {associations.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-4">暂无关联</p>
      ) : (
        <div className="space-y-2">
          {associations.map(assoc => (
            <div key={assoc.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
              <div className="flex items-center gap-2">
                <span className="text-xs bg-gray-200 px-1.5 py-0.5 rounded">
                  {ASSOC_LABELS[assoc.association_type] || assoc.association_type}
                </span>
                <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                  {TYPE_LABELS[assoc.resource_type] || assoc.resource_type}
                </span>
                <span className="text-sm">{assoc.resource_name || assoc.resource_id.slice(0, 8)}</span>
              </div>
              <button
                onClick={() => handleDelete(assoc.id)}
                className="text-gray-400 hover:text-red-500"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <AddAssociationModal
          taskId={taskId}
          onClose={() => setShowAddModal(false)}
          onAdded={loadAssociations}
        />
      )}
    </div>
  )
}

// 添加关联弹窗
function AddAssociationModal({
  taskId,
  onClose,
  onAdded
}: {
  taskId: string
  onClose: () => void
  onAdded: () => void
}) {
  const [resourceType, setResourceType] = useState('document')
  const [resourceId, setResourceId] = useState('')
  const [associationType, setAssociationType] = useState('related')

  const handleSubmit = async () => {
    if (!resourceId) return
    try {
      await fetch('/api/task-associations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, resourceType, resourceId, associationType })
      })
      onAdded()
      onClose()
    } catch (e) {
      console.error('添加关联失败', e)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="font-medium mb-4">添加关联</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-1">关联类型</label>
            <select value={associationType} onChange={(e) => setAssociationType(e.target.value)} className="w-full p-2 border rounded">
              <option value="related">🔗 相关</option>
              <option value="parent">🔝 父任务</option>
              <option value="child">🔽 子任务</option>
              <option value="blocks">🚫 阻塞</option>
              <option value="blocked_by">⏳ 等待</option>
              <option value="implements">🛠 实现</option>
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">资源类型</label>
            <select value={resourceType} onChange={(e) => setResourceType(e.target.value)} className="w-full p-2 border rounded">
              <option value="document">📄 文档</option>
              <option value="task">✅ 任务</option>
              <option value="meeting">📅 会议</option>
              <option value="file">📎 文件</option>
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">资源 ID</label>
            <input value={resourceId} onChange={(e) => setResourceId(e.target.value)} className="w-full p-2 border rounded" placeholder="输入资源 ID" />
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="flex-1 py-2 border rounded">取消</button>
          <button onClick={handleSubmit} disabled={!resourceId} className="flex-1 py-2 bg-blue-500 text-white rounded disabled:opacity-50">确认</button>
        </div>
      </div>
    </div>
  )
}

// 工具函数
function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`
  return date.toLocaleDateString()
}

export default {
  CommentSection,
  OnlineCollaborators,
  PermissionPanel,
  TaskAssociationPanel
}
