'use client'

import { useState, useEffect, useCallback } from 'react'
import { DndContext, DragEndEvent, DragOverlay, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import axios from 'axios'
import toast from 'react-hot-toast'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

interface Field {
  id: string
  name: string
  type: 'text' | 'number' | 'select' | 'date' | 'user' | 'checkbox' | 'url' | 'email'
  options?: string[]
  width: number
}

interface Row {
  id: string
  data: Record<string, any>
  createdAt: string
}

interface TableView {
  id: string
  name: string
  type: 'table' | 'kanban' | 'calendar' | 'gallery'
  groupBy?: string
  sortBy?: string
}

export default function TablePage() {
  const [tables, setTables] = useState<any[]>([])
  const [currentTable, setCurrentTable] = useState<any>(null)
  const [fields, setFields] = useState<Field[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [views, setViews] = useState<TableView[]>([])
  const [currentView, setCurrentView] = useState<TableView | null>(null)
  const [loading, setLoading] = useState(false)
  
  // 编辑状态
  const [editingCell, setEditingCell] = useState<{ rowId: string; fieldId: string } | null>(null)
  const [editValue, setEditValue] = useState<any>('')
  
  // 拖拽状态
  const [activeRow, setActiveRow] = useState<Row | null>(null)

  // 加载表格列表
  useEffect(() => {
    loadTables()
  }, [])

  // 加载表格数据
  useEffect(() => {
    if (currentTable) {
      loadTableData(currentTable.id)
    }
  }, [currentTable])

  const loadTables = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await axios.get(`${API_URL}/api/tables`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.data.success) {
        setTables(response.data.data)
        if (response.data.data.length > 0) {
          setCurrentTable(response.data.data[0])
        }
      }
    } catch (error) {
      console.error('加载表格列表失败:', error)
    }
  }

  const loadTableData = async (tableId: string) => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      
      // 加载字段
      const fieldsRes = await axios.get(`${API_URL}/api/tables/${tableId}/fields`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setFields(fieldsRes.data.data || [])
      
      // 加载行数据
      const rowsRes = await axios.get(`${API_URL}/api/tables/${tableId}/rows`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setRows(rowsRes.data.data || [])
      
      // 加载视图
      const viewsRes = await axios.get(`${API_URL}/api/tables/${tableId}/views`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setViews(viewsRes.data.data || [])
      setCurrentView(viewsRes.data.data?.[0] || null)
      
    } catch (error) {
      console.error('加载表格数据失败:', error)
      toast.error('加载失败')
    } finally {
      setLoading(false)
    }
  }

  // 更新单元格
  const updateCell = async (rowId: string, fieldId: string, value: any) => {
    try {
      const token = localStorage.getItem('token')
      await axios.patch(`${API_URL}/api/tables/${currentTable.id}/rows/${rowId}`, {
        fieldId,
        value
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      
      // 更新本地状态
      setRows(prev => prev.map(row => {
        if (row.id === rowId) {
          return { ...row, data: { ...row.data, [fieldId]: value } }
        }
        return row
      }))
      
      toast.success('已保存')
    } catch (error) {
      console.error('更新失败:', error)
      toast.error('保存失败')
    }
  }

  // 添加新行
  const addRow = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await axios.post(`${API_URL}/api/tables/${currentTable.id}/rows`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      })
      
      if (response.data.success) {
        setRows(prev => [...prev, response.data.data])
        toast.success('已添加新行')
      }
    } catch (error) {
      console.error('添加行失败:', error)
      toast.error('添加失败')
    }
  }

  // 添加新字段
  const addField = async () => {
    const fieldName = prompt('输入字段名称:')
    if (!fieldName) return
    
    try {
      const token = localStorage.getItem('token')
      const response = await axios.post(`${API_URL}/api/tables/${currentTable.id}/fields`, {
        name: fieldName,
        type: 'text',
        width: 200
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      
      if (response.data.success) {
        setFields(prev => [...prev, response.data.data])
        toast.success('字段已添加')
      }
    } catch (error) {
      console.error('添加字段失败:', error)
      toast.error('添加失败')
    }
  }

  // 拖拽结束
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveRow(null)
    
    if (over && active.id !== over.id) {
      const oldIndex = rows.findIndex(r => r.id === active.id)
      const newIndex = rows.findIndex(r => r.id === over.id)
      
      const newRows = [...rows]
      const [removed] = newRows.splice(oldIndex, 1)
      newRows.splice(newIndex, 0, removed)
      
      setRows(newRows)
      // TODO: 保存排序到服务器
    }
  }

  // 渲染单元格内容
  const renderCellContent = (row: Row, field: Field) => {
    const value = row.data[field.id]
    
    switch (field.type) {
      case 'checkbox':
        return (
          <input
            type="checkbox"
            checked={value || false}
            onChange={(e) => updateCell(row.id, field.id, e.target.checked)}
            className="w-4 h-4 rounded border-gray-300"
          />
        )
      case 'select':
        return (
          <select
            value={value || ''}
            onChange={(e) => updateCell(row.id, field.id, e.target.value)}
            className="w-full px-2 py-1 border-0 bg-transparent focus:ring-1 focus:ring-indigo-500 rounded"
          >
            <option value="">未选择</option>
            {field.options?.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        )
      case 'user':
        return value ? (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center text-xs">
              {value.name?.[0] || '?'}
            </div>
            <span>{value.name}</span>
          </div>
        ) : null
      case 'date':
        return value ? new Date(value).toLocaleDateString('zh-CN') : null
      case 'url':
        return value ? (
          <a href={value} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
            {value}
          </a>
        ) : null
      default:
        return value
    }
  }

  // 可排序行组件
  const SortableRow = ({ row }: { row: Row }) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: row.id })
    
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    }
    
    return (
      <tr ref={setNodeRef} style={style} className="hover:bg-gray-50 border-b border-gray-200">
        <td className="w-10 px-2 border-r border-gray-200" {...attributes} {...listeners}>
          <div className="cursor-grab text-gray-400 hover:text-gray-600">⋮⋮</div>
        </td>
        {fields.map(field => (
          <td
            key={field.id}
            className="border-r border-gray-200"
            style={{ width: field.width, minWidth: field.width }}
            onDoubleClick={() => {
              setEditingCell({ rowId: row.id, fieldId: field.id })
              setEditValue(row.data[field.id] || '')
            }}
          >
            {editingCell?.rowId === row.id && editingCell?.fieldId === field.id ? (
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => {
                  updateCell(row.id, field.id, editValue)
                  setEditingCell(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    updateCell(row.id, field.id, editValue)
                    setEditingCell(null)
                  } else if (e.key === 'Escape') {
                    setEditingCell(null)
                  }
                }}
                className="w-full px-2 py-1 border border-indigo-500 rounded focus:outline-none"
                autoFocus
              />
            ) : (
              <div className="px-2 py-1 min-h-[28px]">
                {renderCellContent(row, field)}
              </div>
            )}
          </td>
        ))}
      </tr>
    )
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* 工具栏 */}
      <div className="h-14 border-b border-gray-200 flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <select
            value={currentTable?.id || ''}
            onChange={(e) => {
              const table = tables.find(t => t.id === e.target.value)
              setCurrentTable(table)
            }}
            className="px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          >
            {tables.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          
          {views.length > 0 && (
            <div className="flex items-center gap-2">
              {views.map(view => (
                <button
                  key={view.id}
                  onClick={() => setCurrentView(view)}
                  className={`px-3 py-1.5 rounded-lg text-sm ${
                    currentView?.id === view.id
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'hover:bg-gray-100 text-gray-600'
                  }`}
                >
                  {view.type === 'table' && '📊 '}
                  {view.type === 'kanban' && '📋 '}
                  {view.type === 'calendar' && '📅 '}
                  {view.type === 'gallery' && '🖼️ '}
                  {view.name}
                </button>
              ))}
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={addField}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            + 添加字段
          </button>
          <button className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            ⚙️ 筛选
          </button>
          <button className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            🔍 搜索
          </button>
        </div>
      </div>

      {/* 表格区域 */}
      {currentTable ? (
        <div className="flex-1 overflow-auto">
          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr>
                  <th className="w-10 px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase border-b border-r border-gray-200">
                    #
                  </th>
                  {fields.map(field => (
                    <th
                      key={field.id}
                      className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase border-b border-r border-gray-200"
                      style={{ width: field.width, minWidth: field.width }}
                    >
                      <div className="flex items-center gap-2">
                        {field.type === 'text' && '📝'}
                        {field.type === 'number' && '🔢'}
                        {field.type === 'select' && '📋'}
                        {field.type === 'date' && '📅'}
                        {field.type === 'user' && '👤'}
                        {field.type === 'checkbox' && '☑️'}
                        {field.type === 'url' && '🔗'}
                        {field.type === 'email' && '📧'}
                        {field.name}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <SortableContext items={rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
                  {rows.map(row => (
                    <SortableRow key={row.id} row={row} />
                  ))}
                </SortableContext>
              </tbody>
            </table>
            <DragOverlay>
              {activeRow && (
                <div className="bg-white shadow-lg rounded border border-gray-300 p-2">
                  行数据
                </div>
              )}
            </DragOverlay>
          </DndContext>
          
          {/* 添加行按钮 */}
          <button
            onClick={addRow}
            className="w-full py-2 text-center text-gray-500 hover:bg-gray-50 border-b border-gray-200"
          >
            + 添加新行
          </button>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <div className="text-6xl mb-4">📊</div>
            <p className="mb-4">创建你的第一个多维表格</p>
            <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
              创建表格
            </button>
          </div>
        </div>
      )}
    </div>
  )
}