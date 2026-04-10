'use client'

import { useState, useEffect } from 'react'
import CollabSidebar from '@/components/Collaboration'

type ViewMode = 'doc' | 'sidebar' | 'fullscreen'

interface Document {
  id: string
  name: string
  content: string
  lastEditedBy?: string
  updatedAt: string
}

interface Resource {
  type: string
  id: string
  name: string
}

export default function CollaborationPage() {
  const [resources, setResources] = useState<Resource[]>([])
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('doc')
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)

  // 加载文档列表
  useEffect(() => {
    const loadDocuments = async () => {
      try {
        const res = await fetch('/api/documents')
        const data = await res.json()
        if (data.success) {
          setDocuments(data.data || [])
          setResources(data.data?.map((d: any) => ({
            type: 'document',
            id: d.id,
            name: d.name
          })) || [])
          if (data.data?.length > 0 && !selectedResource) {
            setSelectedResource({ type: 'document', id: data.data[0].id, name: data.data[0].name })
          }
        }
      } catch (e) {
        console.error('加载文档失败', e)
      } finally {
        setLoading(false)
      }
    }
    loadDocuments()
  }, [])

  // 模拟文档内容编辑
  const [content, setContent] = useState('')

  useEffect(() => {
    if (selectedResource) {
      setContent(`# ${selectedResource.name}\n\n在这里编辑文档内容...\n\n## 协作功能\n\n- 💬 评论：右侧面板可添加评论\n- 👥 在线状态：实时查看谁在编辑\n- 🔐 权限：细粒度控制访问权限\n- ✅ 任务关联：文档与任务双向关联\n\n开始协作吧！`)
    }
  }, [selectedResource])

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value)
    // 标记正在编辑
    if (selectedResource) {
      fetch('/api/sessions/editing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceId: selectedResource.id })
      }).catch(() => {})
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* 左侧资源列表 */}
      <div className="w-64 bg-white border-r flex flex-col">
        <div className="p-4 border-b">
          <h2 className="font-bold text-lg">协作空间</h2>
          <p className="text-xs text-gray-400 mt-1">实时协作 · 权限管理 · 任务关联</p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          <div className="mb-2">
            <h3 className="text-xs font-medium text-gray-400 uppercase px-2 mb-2">📄 文档</h3>
            {resources.filter(r => r.type === 'document').map(doc => (
              <button
                key={doc.id}
                onClick={() => setSelectedResource(doc)}
                className={`w-full text-left px-3 py-2 rounded-lg mb-1 transition-colors
                  ${selectedResource?.id === doc.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-100'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">📄</span>
                  <span className="text-sm truncate">{doc.name}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="p-3 border-t bg-gray-50">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{connected ? '🟢 已连接' : '⚪ 未连接'}</span>
            <button
              onClick={() => setConnected(!connected)}
              className="text-blue-500 hover:underline"
            >
              {connected ? '断开' : '连接'}
            </button>
          </div>
        </div>
      </div>

      {/* 中间文档区 */}
      <div className={`flex-1 flex flex-col transition-all duration-300
        ${viewMode === 'sidebar' ? 'max-w-[60%]' : viewMode === 'fullscreen' ? 'max-w-full' : 'max-w-[calc(100%-400px)]'}`}>
        
        {/* 工具栏 */}
        <div className="bg-white border-b px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="font-medium">{selectedResource?.name || '选择文档'}</h1>
            {selectedResource && (
              <span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-500">
                {selectedResource.type}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode(viewMode === 'doc' ? 'sidebar' : 'doc')}
              className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50"
              title={viewMode === 'doc' ? '显示协作面板' : '隐藏协作面板'}
            >
              {viewMode === 'doc' ? '📋 协作' : '📝 文档'}
            </button>
            <button
              onClick={() => setViewMode(viewMode === 'fullscreen' ? 'doc' : 'fullscreen')}
              className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50"
            >
              {viewMode === 'fullscreen' ? '⛶ 退出全屏' : '⛶ 全屏'}
            </button>
            <button className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">
              💾 保存
            </button>
          </div>
        </div>

        {/* 文档编辑器 */}
        <div className="flex-1 overflow-hidden bg-white">
          {selectedResource ? (
            <div className="h-full flex">
              {/* Markdown 编辑器 */}
              <div className="flex-1 p-6 overflow-y-auto">
                <textarea
                  value={content}
                  onChange={handleContentChange}
                  className="w-full h-full min-h-[600px] border-0 resize-none focus:ring-0 text-base leading-relaxed"
                  placeholder="开始编辑..."
                />
              </div>

              {/* 实时预览（可选） */}
              <div className="w-1/2 border-l p-6 overflow-y-auto bg-gray-50 hidden">
                <div className="prose max-w-none">
                  <h1 className="text-2xl font-bold">{selectedResource.name}</h1>
                  <div className="whitespace-pre-wrap">{content}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">
              <div className="text-center">
                <p className="text-4xl mb-4">📄</p>
                <p>选择或创建一个文档开始协作</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 右侧协作面板 */}
      {viewMode !== 'fullscreen' && selectedResource && (
        <div className={`w-96 bg-white border-l flex flex-col transition-all duration-300
          ${viewMode === 'sidebar' ? 'hidden' : ''}`}>
          <CollabSidebar
            resourceType={selectedResource.type}
            resourceId={selectedResource.id}
            resourceName={selectedResource.name}
          />
        </div>
      )}
    </div>
  )
}
