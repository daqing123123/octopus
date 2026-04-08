'use client'
import { useState, useEffect, useRef } from 'react'

export default function KnowledgeGraph() {
  const [graphData, setGraphData] = useState<any>(null)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [selectedNode, setSelectedNode] = useState<any>(null)
  const [relatedNodes, setRelatedNodes] = useState<any[]>([])
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph')
  const [filterType, setFilterType] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)

  const fetchGraph = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterType) params.set('type', filterType)
      params.set('limit', '50')
      const res = await fetch(`/api/claw/knowledge/graph?${params}`)
      const data = await res.json()
      setGraphData(data.data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const search = async (q: string) => {
    if (!q) { setSearchResults([]); return }
    try {
      const res = await fetch(`/api/claw/knowledge/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setSearchResults(data.data || [])
    } catch (e) { console.error(e) }
  }

  const selectNode = async (nodeId: string) => {
    try {
      const res = await fetch(`/api/claw/knowledge/nodes/${nodeId}/related`)
      const data = await res.json()
      setRelatedNodes(data.data || [])
      const node = graphData?.nodes?.find((n: any) => n.id === nodeId)
      setSelectedNode(node)
    } catch (e) { console.error(e) }
  }

  useEffect(() => { fetchGraph() }, [filterType])

  // Draw graph visualization
  useEffect(() => {
    if (!canvasRef.current || viewMode !== 'graph' || !graphData) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = canvas.offsetWidth
    canvas.height = 400

    const nodes = graphData.nodes || []
    const edges = graphData.edges || []

    // Position nodes in a circle
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    const radius = Math.min(cx, cy) - 50

    const nodePositions: Record<string, { x: number; y: number }> = {}
    nodes.forEach((node: any, i: number) => {
      const angle = (Math.PI * 2 * i) / nodes.length - Math.PI / 2
      nodePositions[node.id] = {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius
      }
    })

    // Draw edges
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 1
    edges.forEach((edge: any) => {
      const src = nodePositions[edge.source]
      const tgt = nodePositions[edge.target]
      if (src && tgt) {
        ctx.beginPath()
        ctx.moveTo(src.x, src.y)
        ctx.lineTo(tgt.x, tgt.y)
        ctx.stroke()
      }
    })

    // Draw nodes
    nodes.forEach((node: any) => {
      const pos = nodePositions[node.id]
      if (!pos) return

      const colors: Record<string, string> = {
        person: '#3b82f6', project: '#10b981', concept: '#8b5cf6',
        tool: '#f59e0b', topic: '#ec4899', meeting: '#06b6d4', task: '#6366f1'
      }
      const color = colors[node.type] || '#6366f1'
      const size = 8 + node.importance * 20

      ctx.beginPath()
      ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2)
      ctx.fillStyle = color + '30'
      ctx.fill()
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.fillStyle = '#374151'
      ctx.font = '10px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(node.name.slice(0, 10), pos.x, pos.y + size + 12)
    })
  }, [graphData, viewMode])

  const typeConfig: Record<string, { label: string; emoji: string; color: string }> = {
    person: { label: '人物', emoji: '👤', color: 'blue' },
    project: { label: '项目', emoji: '📁', color: 'green' },
    concept: { label: '概念', emoji: '💡', color: 'purple' },
    tool: { label: '工具', emoji: '🔧', color: 'amber' },
    topic: { label: '话题', emoji: '📌', color: 'pink' },
    meeting: { label: '会议', emoji: '📅', color: 'cyan' },
    task: { label: '任务', emoji: '✅', color: 'indigo' },
    document: { label: '文档', emoji: '📄', color: 'gray' },
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">🕸️ 知识图谱</h2>
        <div className="flex gap-2">
          <button onClick={() => setViewMode('graph')}
            className={`px-4 py-2 rounded-lg text-sm ${viewMode === 'graph' ? 'bg-indigo-600 text-white' : 'border border-gray-300'}`}>
            图谱视图
          </button>
          <button onClick={() => setViewMode('list')}
            className={`px-4 py-2 rounded-lg text-sm ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'border border-gray-300'}`}>
            列表视图
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <input
            placeholder="搜索知识..."
            onChange={e => search(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm"
          />
          <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
          <option value="">全部类型</option>
          {Object.entries(typeConfig).map(([k, v]) => (
            <option key={k} value={k}>{v.emoji} {v.label}</option>
          ))}
        </select>
        <button onClick={fetchGraph} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
          刷新
        </button>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h4 className="text-sm font-medium text-gray-700 mb-2">搜索结果</h4>
          <div className="space-y-2">
            {searchResults.map((r: any) => (
              <button key={r.id} onClick={() => selectNode(r.id)}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 text-left">
                <span>{typeConfig[r.type]?.emoji || '📌'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{r.name}</p>
                  <p className="text-xs text-gray-500 truncate">{r.description}</p>
                </div>
                <span className="text-xs text-gray-400">重要性 {Math.round(r.importance * 10)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      {graphData?.stats && (
        <div className="flex gap-2 flex-wrap">
          {Object.entries(graphData.stats).map(([type, count]: [string, any]) => (
            <span key={type} className={`px-3 py-1 bg-${typeConfig[type]?.color || 'gray'}-50 border border-${typeConfig[type]?.color || 'gray'}-200 rounded-full text-xs`}>
              {typeConfig[type]?.emoji || '📌'} {typeConfig[type]?.label || type}: {count}
            </span>
          ))}
        </div>
      )}

      {/* Graph View */}
      {viewMode === 'graph' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <canvas ref={canvasRef} className="w-full cursor-pointer" onClick={() => {}} />
          <div className="p-3 border-t flex items-center gap-3">
            <p className="text-xs text-gray-500">👆 点击节点查看详情</p>
            <div className="flex items-center gap-3 ml-auto">
              {Object.entries(typeConfig).slice(0, 5).map(([k, v]) => (
                <span key={k} className="flex items-center gap-1 text-xs">
                  <span className={`w-3 h-3 rounded-full bg-${v.color}-500`} /> {v.emoji}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && graphData?.nodes && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {graphData.nodes.map((node: any) => (
            <button key={node.id} onClick={() => selectNode(node.id)}
              className={`bg-white rounded-xl p-4 shadow-sm text-left border-2 transition-colors ${
                selectedNode?.id === node.id ? 'border-indigo-500' : 'border-transparent hover:border-gray-200'
              }`}>
              <div className="flex items-start gap-3">
                <span className="text-2xl">{typeConfig[node.type]?.emoji || '📌'}</span>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-gray-900 truncate">{node.name}</h4>
                  {node.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{node.description}</p>}
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-1.5 py-0.5 bg-${typeConfig[node.type]?.color || 'gray'}-100 text-${typeConfig[node.type]?.color || 'gray'}-700 rounded`}>
                      {typeConfig[node.type]?.label || node.type}
                    </span>
                    <span className="text-xs text-gray-400">提及 {node.mentions}次</span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Node Detail */}
      {selectedNode && (
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg text-gray-900">{selectedNode.name}</h3>
            <button onClick={() => setSelectedNode(null)} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div><p className="text-xs text-gray-500">类型</p><p className="text-sm font-medium">{typeConfig[selectedNode.type]?.emoji} {typeConfig[selectedNode.type]?.label}</p></div>
            <div><p className="text-xs text-gray-500">重要性</p><p className="text-sm font-medium">{Math.round(selectedNode.importance * 100)}%</p></div>
            <div><p className="text-xs text-gray-500">提及次数</p><p className="text-sm font-medium">{selectedNode.mentions}</p></div>
            <div><p className="text-xs text-gray-500">最后提及</p><p className="text-sm font-medium">{new Date(selectedNode.lastMentioned).toLocaleDateString('zh')}</p></div>
          </div>
          {selectedNode.description && <p className="text-sm text-gray-600 mb-4">{selectedNode.description}</p>}
          {relatedNodes.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">相关节点</h4>
              <div className="space-y-2">
                {relatedNodes.map((n: any) => (
                  <button key={n.id} onClick={() => selectNode(n.id)}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 text-left">
                    <span>{typeConfig[n.type]?.emoji}</span>
                    <span className="text-sm text-gray-700 flex-1">{n.name}</span>
                    <span className="text-xs text-gray-400">{n.relation} {Math.round((n.relationStrength || 0) * 100)}%</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
