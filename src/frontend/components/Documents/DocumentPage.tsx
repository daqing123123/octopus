'use client'

import { useState, useEffect, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import axios from 'axios'
import toast from 'react-hot-toast'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

interface Document {
  id: string
  title: string
  content: string
  version: number
  createdAt: string
  updatedAt: string
}

export default function DocumentPage() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [currentDoc, setCurrentDoc] = useState<Document | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showAI, setShowAI] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: '开始输入...'
      })
    ],
    content: currentDoc?.content || '',
    onUpdate: ({ editor }) => {
      // 自动保存（防抖）
      debouncedSave(editor.getHTML())
    }
  })

  // 防抖保存
  const debouncedSave = useCallback(
    debounce(async (content: string) => {
      if (!currentDoc) return
      setSaving(true)
      try {
        const token = localStorage.getItem('token')
        await axios.patch(`${API_URL}/api/documents/${currentDoc.id}`, {
          content
        }, {
          headers: { Authorization: `Bearer ${token}` }
        })
      } catch (error) {
        console.error('保存失败:', error)
      } finally {
        setSaving(false)
      }
    }, 1000),
    [currentDoc]
  )

  // 加载文档列表
  useEffect(() => {
    loadDocuments()
  }, [])

  // 切换文档时更新编辑器内容
  useEffect(() => {
    if (editor && currentDoc) {
      editor.commands.setContent(currentDoc.content || '')
    }
  }, [currentDoc, editor])

  const loadDocuments = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const response = await axios.get(`${API_URL}/api/documents`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.data.success) {
        setDocuments(response.data.data)
        if (response.data.data.length > 0) {
          setCurrentDoc(response.data.data[0])
        }
      }
    } catch (error) {
      console.error('加载文档失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const createDocument = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await axios.post(`${API_URL}/api/documents`, {
        title: '新建文档',
        content: ''
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      
      if (response.data.success) {
        setDocuments(prev => [response.data.data, ...prev])
        setCurrentDoc(response.data.data)
        toast.success('文档已创建')
      }
    } catch (error) {
      console.error('创建文档失败:', error)
      toast.error('创建失败')
    }
  }

  const deleteDocument = async (docId: string) => {
    if (!confirm('确定要删除这个文档吗？')) return
    
    try {
      const token = localStorage.getItem('token')
      await axios.delete(`${API_URL}/api/documents/${docId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      
      setDocuments(prev => prev.filter(d => d.id !== docId))
      if (currentDoc?.id === docId) {
        setCurrentDoc(documents[0] || null)
      }
      toast.success('文档已删除')
    } catch (error) {
      console.error('删除文档失败:', error)
      toast.error('删除失败')
    }
  }

  // AI 助手
  const handleAIAssist = async (action: string) => {
    if (!editor) return
    
    const selectedText = editor.state.selection.empty 
      ? editor.getText() 
      : editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)
    
    if (!selectedText) {
      toast.error('请先选择一些文本')
      return
    }
    
    try {
      const token = localStorage.getItem('token')
      const response = await axios.post(`${API_URL}/api/ai/document/assist`, {
        documentId: currentDoc?.id,
        action,
        selectedText
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      
      if (response.data.success) {
        // 插入 AI 生成的内容
        editor.chain().focus().insertContent(response.data.data.content).run()
        toast.success('AI 已生成内容')
      }
    } catch (error) {
      console.error('AI 助手失败:', error)
      toast.error('AI 助手暂时不可用')
    }
  }

  // AI 自定义指令
  const handleAIPrompt = async () => {
    if (!aiPrompt.trim()) return
    
    try {
      const token = localStorage.getItem('token')
      const content = editor?.getHTML() || ''
      
      const response = await axios.post(`${API_URL}/api/ai/chat`, {
        message: `${aiPrompt}\n\n当前文档内容：\n${content}`,
        context: { documentId: currentDoc?.id }
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      
      if (response.data.success) {
        editor?.chain().focus().insertContent(response.data.data.content).run()
        setAiPrompt('')
        setShowAI(false)
        toast.success('AI 已生成内容')
      }
    } catch (error) {
      console.error('AI 生成失败:', error)
      toast.error('AI 生成失败')
    }
  }

  // 工具栏按钮
  const ToolbarButton = ({ onClick, active, children, title }: any) => (
    <button
      onClick={onClick}
      className={`p-2 rounded hover:bg-gray-100 ${active ? 'bg-gray-200' : ''}`}
      title={title}
    >
      {children}
    </button>
  )

  return (
    <div className="h-full flex">
      {/* 文档列表 */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">文档</h2>
          <button
            onClick={createDocument}
            className="p-1 hover:bg-gray-100 rounded text-xl"
            title="新建文档"
          >
            +
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {documents.map(doc => (
            <div
              key={doc.id}
              onClick={() => setCurrentDoc(doc)}
              className={`p-3 cursor-pointer border-b border-gray-100 hover:bg-gray-50 ${
                currentDoc?.id === doc.id ? 'bg-indigo-50' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{doc.title}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(doc.updatedAt).toLocaleDateString('zh-CN')}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteDocument(doc.id)
                  }}
                  className="p-1 hover:bg-red-100 rounded text-red-500 opacity-0 group-hover:opacity-100"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 编辑器区域 */}
      <div className="flex-1 flex flex-col bg-white">
        {currentDoc ? (
          <>
            {/* 工具栏 */}
            <div className="border-b border-gray-200 p-2 flex items-center gap-1 flex-wrap">
              {/* 文本格式 */}
              <ToolbarButton
                onClick={() => editor?.chain().focus().toggleBold().run()}
                active={editor?.isActive('bold')}
                title="粗体"
              >
                <strong>B</strong>
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor?.chain().focus().toggleItalic().run()}
                active={editor?.isActive('italic')}
                title="斜体"
              >
                <em>I</em>
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor?.chain().focus().toggleStrike().run()}
                active={editor?.isActive('strike')}
                title="删除线"
              >
                <s>S</s>
              </ToolbarButton>
              
              <div className="w-px h-6 bg-gray-300 mx-1" />
              
              {/* 标题 */}
              <ToolbarButton
                onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
                active={editor?.isActive('heading', { level: 1 })}
                title="标题 1"
              >
                H1
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
                active={editor?.isActive('heading', { level: 2 })}
                title="标题 2"
              >
                H2
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
                active={editor?.isActive('heading', { level: 3 })}
                title="标题 3"
              >
                H3
              </ToolbarButton>
              
              <div className="w-px h-6 bg-gray-300 mx-1" />
              
              {/* 列表 */}
              <ToolbarButton
                onClick={() => editor?.chain().focus().toggleBulletList().run()}
                active={editor?.isActive('bulletList')}
                title="无序列表"
              >
                •
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                active={editor?.isActive('orderedList')}
                title="有序列表"
              >
                1.
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor?.chain().focus().toggleBlockquote().run()}
                active={editor?.isActive('blockquote')}
                title="引用"
              >
                "
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
                active={editor?.isActive('codeBlock')}
                title="代码块"
              >
                {'</>'}
              </ToolbarButton>
              
              <div className="w-px h-6 bg-gray-300 mx-1" />
              
              {/* AI 助手 */}
              <div className="relative">
                <button
                  onClick={() => setShowAI(!showAI)}
                  className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 flex items-center gap-1"
                >
                  🤖 AI
                </button>
                
                {showAI && (
                  <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 p-3 z-50">
                    <div className="space-y-2 mb-3">
                      <button
                        onClick={() => handleAIAssist('rewrite')}
                        className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm"
                      >
                        ✨ 改写选中内容
                      </button>
                      <button
                        onClick={() => handleAIAssist('expand')}
                        className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm"
                      >
                        📝 扩写内容
                      </button>
                      <button
                        onClick={() => handleAIAssist('summarize')}
                        className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm"
                      >
                        📋 总结内容
                      </button>
                      <button
                        onClick={() => handleAIAssist('translate')}
                        className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm"
                      >
                        🌐 翻译成英文
                      </button>
                    </div>
                    
                    <div className="border-t border-gray-200 pt-3">
                      <input
                        type="text"
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder="输入自定义指令..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                      <button
                        onClick={handleAIPrompt}
                        className="w-full mt-2 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
                      >
                        生成
                      </button>
                    </div>
                  </div>
                )}
              </div>
              
              {/* 保存状态 */}
              <div className="ml-auto text-sm text-gray-500">
                {saving ? '保存中...' : '已保存'}
              </div>
            </div>

            {/* 标题 */}
            <div className="px-8 pt-6">
              <input
                type="text"
                value={currentDoc.title}
                onChange={(e) => {
                  setCurrentDoc({ ...currentDoc, title: e.target.value })
                  // TODO: 保存标题
                }}
                className="w-full text-3xl font-bold border-0 focus:ring-0 focus:outline-none"
                placeholder="文档标题"
              />
            </div>

            {/* 编辑器 */}
            <div className="flex-1 overflow-y-auto px-8 py-4">
              <EditorContent
                editor={editor}
                className="prose prose-lg max-w-none focus:outline-none"
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <div className="text-6xl mb-4">📝</div>
              <p className="mb-4">选择或创建一个文档</p>
              <button
                onClick={createDocument}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                创建文档
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// 防抖函数
function debounce(func: Function, wait: number) {
  let timeout: NodeJS.Timeout | null = null
  return function executedFunction(...args: any[]) {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}