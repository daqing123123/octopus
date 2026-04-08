'use client'

import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

interface FileItem {
  id: string
  name: string
  type: 'file' | 'folder'
  size: number
  mimeType?: string
  parentId: string | null
  createdAt: string
  updatedAt: string
  createdBy: { id: string; name: string }
  isStarred: boolean
  isShared: boolean
}

interface Breadcrumb {
  id: string | null
  name: string
}

export default function FilesPage() {
  const [files, setFiles] = useState<FileItem[]>([])
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ id: null, name: '我的文件' }])
  const [loading, setLoading] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('name')
  const [searchQuery, setSearchQuery] = useState('')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showNewFolderModal, setShowNewFolderModal] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)

  useEffect(() => {
    loadFiles()
  }, [currentFolderId])

  const loadFiles = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const response = await axios.get(`${API_URL}/api/files`, {
        params: { parentId: currentFolderId },
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.data.success) {
        setFiles(response.data.data)
      }
    } catch (error) {
      console.error('加载文件失败:', error)
      toast.error('加载文件失败')
    } finally {
      setLoading(false)
    }
  }

  const navigateToFolder = (folderId: string | null, folderName: string) => {
    setCurrentFolderId(folderId)
    
    // 更新面包屑
    if (folderId === null) {
      setBreadcrumbs([{ id: null, name: '我的文件' }])
    } else {
      const existingIndex = breadcrumbs.findIndex(b => b.id === folderId)
      if (existingIndex >= 0) {
        setBreadcrumbs(breadcrumbs.slice(0, existingIndex + 1))
      } else {
        setBreadcrumbs([...breadcrumbs, { id: folderId, name: folderName }])
      }
    }
  }

  const createFolder = async () => {
    if (!newFolderName.trim()) {
      toast.error('请输入文件夹名称')
      return
    }

    try {
      const token = localStorage.getItem('token')
      const response = await axios.post(`${API_URL}/api/files/folder`, {
        name: newFolderName,
        parentId: currentFolderId
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (response.data.success) {
        setFiles(prev => [...prev, response.data.data])
        setShowNewFolderModal(false)
        setNewFolderName('')
        toast.success('文件夹已创建')
      }
    } catch (error) {
      console.error('创建文件夹失败:', error)
      toast.error('创建失败')
    }
  }

  const uploadFile = async (file: globalThis.File) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('parentId', currentFolderId || '')

    try {
      const token = localStorage.getItem('token')
      await axios.post(`${API_URL}/api/files/upload`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            setUploadProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total))
          }
        }
      })

      loadFiles()
      toast.success(`${file.name} 上传成功`)
    } catch (error) {
      console.error('上传失败:', error)
      toast.error(`${file.name} 上传失败`)
    }
  }

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    for (const file of files) {
      await uploadFile(file)
    }
    setUploadProgress(0)
  }

  const downloadFile = async (file: FileItem) => {
    try {
      const token = localStorage.getItem('token')
      const response = await axios.get(`${API_URL}/api/files/${file.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      })

      const url = window.URL.createObjectURL(response.data)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('下载失败:', error)
      toast.error('下载失败')
    }
  }

  const deleteFile = async (file: FileItem) => {
    if (!confirm(`确定要删除 ${file.name} 吗？`)) return

    try {
      const token = localStorage.getItem('token')
      await axios.delete(`${API_URL}/api/files/${file.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      setFiles(prev => prev.filter(f => f.id !== file.id))
      toast.success('已删除')
    } catch (error) {
      console.error('删除失败:', error)
      toast.error('删除失败')
    }
  }

  const toggleStar = async (file: FileItem) => {
    try {
      const token = localStorage.getItem('token')
      await axios.patch(`${API_URL}/api/files/${file.id}/star`, {
        isStarred: !file.isStarred
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })

      setFiles(prev => prev.map(f =>
        f.id === file.id ? { ...f, isStarred: !f.isStarred } : f
      ))
    } catch (error) {
      console.error('操作失败:', error)
    }
  }

  const renameFile = async (file: FileItem) => {
    const newName = prompt('输入新名称:', file.name)
    if (!newName || newName === file.name) return

    try {
      const token = localStorage.getItem('token')
      await axios.patch(`${API_URL}/api/files/${file.id}`, {
        name: newName
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })

      setFiles(prev => prev.map(f =>
        f.id === file.id ? { ...f, name: newName } : f
      ))
      toast.success('已重命名')
    } catch (error) {
      console.error('重命名失败:', error)
      toast.error('重命名失败')
    }
  }

  const getFileIcon = (file: FileItem) => {
    if (file.type === 'folder') return '📁'
    
    const ext = file.name.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'pdf': return '📄'
      case 'doc':
      case 'docx': return '📝'
      case 'xls':
      case 'xlsx': return '📊'
      case 'ppt':
      case 'pptx': return '📽️'
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif': return '🖼️'
      case 'mp4':
      case 'mov':
      case 'avi': return '🎬'
      case 'mp3':
      case 'wav': return '🎵'
      case 'zip':
      case 'rar': return '📦'
      default: return '📄'
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '-'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const filteredFiles = files
    .filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      // 文件夹始终在前
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'date':
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        case 'size':
          return b.size - a.size
        default:
          return 0
      }
    })

  return (
    <div className="h-full flex flex-col bg-white">
      {/* 工具栏 */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          {/* 面包屑 */}
          <div className="flex items-center gap-2">
            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.id || 'root'} className="flex items-center">
                {index > 0 && <span className="text-gray-400 mx-2">/</span>}
                <button
                  onClick={() => navigateToFolder(crumb.id, crumb.name)}
                  className={clsx(
                    'hover:text-indigo-600',
                    index === breadcrumbs.length - 1 ? 'font-semibold text-gray-900' : 'text-gray-600'
                  )}
                >
                  {crumb.name}
                </button>
              </div>
            ))}
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNewFolderModal(true)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              📁 新建文件夹
            </button>
            <label className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer">
              ⬆️ 上传文件
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || [])
                  files.forEach(uploadFile)
                }}
              />
            </label>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* 搜索 */}
          <div className="flex-1 max-w-md">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索文件..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* 排序 */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="name">按名称</option>
            <option value="date">按日期</option>
            <option value="size">按大小</option>
          </select>

          {/* 视图切换 */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('list')}
              className={clsx(
                'px-3 py-1 rounded text-sm',
                viewMode === 'list' ? 'bg-white shadow' : ''
              )}
            >
              列表
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={clsx(
                'px-3 py-1 rounded text-sm',
                viewMode === 'grid' ? 'bg-white shadow' : ''
              )}
            >
              图标
            </button>
          </div>
        </div>
      </div>

      {/* 文件列表 */}
      <div
        className="flex-1 overflow-auto p-4"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleFileDrop}
      >
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">加载中...</div>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <div className="text-6xl mb-4">📂</div>
            <p>拖放文件到此处上传</p>
            <p className="text-sm mt-2">或点击上方"上传文件"按钮</p>
          </div>
        ) : viewMode === 'list' ? (
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-500 border-b">
                <th className="pb-3 w-8">
                  <input
                    type="checkbox"
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedFiles(new Set(filteredFiles.map(f => f.id)))
                      } else {
                        setSelectedFiles(new Set())
                      }
                    }}
                  />
                </th>
                <th className="pb-3">名称</th>
                <th className="pb-3 w-32">大小</th>
                <th className="pb-3 w-48">修改时间</th>
                <th className="pb-3 w-32">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredFiles.map(file => (
                <tr
                  key={file.id}
                  className={clsx(
                    'border-b hover:bg-gray-50',
                    selectedFiles.has(file.id) && 'bg-indigo-50'
                  )}
                  onDoubleClick={() => {
                    if (file.type === 'folder') {
                      navigateToFolder(file.id, file.name)
                    }
                  }}
                >
                  <td className="py-3">
                    <input
                      type="checkbox"
                      checked={selectedFiles.has(file.id)}
                      onChange={(e) => {
                        const newSelected = new Set(selectedFiles)
                        if (e.target.checked) {
                          newSelected.add(file.id)
                        } else {
                          newSelected.delete(file.id)
                        }
                        setSelectedFiles(newSelected)
                      }}
                    />
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{getFileIcon(file)}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{file.name}</span>
                          {file.isStarred && <span className="text-yellow-500">⭐</span>}
                          {file.isShared && <span className="text-indigo-500">🔗</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 text-gray-500">{formatSize(file.size)}</td>
                  <td className="py-3 text-gray-500">{formatDate(file.updatedAt)}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleStar(file)}
                        className={clsx(
                          'p-1 rounded hover:bg-gray-100',
                          file.isStarred ? 'text-yellow-500' : 'text-gray-400'
                        )}
                      >
                        ⭐
                      </button>
                      {file.type === 'file' && (
                        <button
                          onClick={() => downloadFile(file)}
                          className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                        >
                          ⬇️
                        </button>
                      )}
                      <button
                        onClick={() => renameFile(file)}
                        className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => deleteFile(file)}
                        className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-gray-100"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {filteredFiles.map(file => (
              <div
                key={file.id}
                className="p-4 border border-gray-200 rounded-lg hover:shadow-md cursor-pointer group"
                onDoubleClick={() => {
                  if (file.type === 'folder') {
                    navigateToFolder(file.id, file.name)
                  }
                }}
              >
                <div className="text-4xl text-center mb-2">{getFileIcon(file)}</div>
                <div className="text-sm text-center truncate">{file.name}</div>
                <div className="text-xs text-gray-400 text-center mt-1">
                  {file.type === 'folder' ? '文件夹' : formatSize(file.size)}
                </div>
                
                {/* 悬停操作 */}
                <div className="hidden group-hover:flex justify-center gap-1 mt-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleStar(file) }}
                    className="p-1 hover:bg-gray-100 rounded text-xs"
                  >
                    {file.isStarred ? '⭐' : '☆'}
                  </button>
                  {file.type === 'file' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); downloadFile(file) }}
                      className="p-1 hover:bg-gray-100 rounded text-xs"
                    >
                      ⬇️
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteFile(file) }}
                    className="p-1 hover:bg-gray-100 rounded text-xs"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 上传进度 */}
      {uploadProgress > 0 && uploadProgress < 100 && (
        <div className="fixed bottom-4 right-4 bg-white border border-gray-200 rounded-lg shadow-lg p-4 w-64">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">上传中...</span>
            <span className="text-sm text-gray-500">{uploadProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* 新建文件夹弹窗 */}
      {showNewFolderModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold mb-4">新建文件夹</h3>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="文件夹名称"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') createFolder()
              }}
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowNewFolderModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                取消
              </button>
              <button
                onClick={createFolder}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}