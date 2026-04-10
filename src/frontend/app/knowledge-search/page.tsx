'use client'

import { useState } from 'react'

interface SearchResult {
  id: string
  title: string
  content: string
  category: string
  source: string
}

interface SearchResponse {
  query: string
  answer: string | null
  sources: { id: string; title: string; category: string }[]
  documents: SearchResult[]
  stats: {
    searchTime: number
    docsFound: number
  }
}

export default function KnowledgeSearchPage() {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'search' | 'chat' | 'both'>('both')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SearchResponse | null>(null)
  const [chatHistory, setChatHistory] = useState<{ q: string; a: string }[]>([])

  const handleSearch = async () => {
    if (!query.trim()) return

    setLoading(true)
    try {
      const res = await fetch(`/api/${window.__ENTERPRISE_ID__}/knowledge/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, mode })
      })
      const data = await res.json()

      if (data.success) {
        setResult(data.data)
        if (data.data.answer) {
          setChatHistory(prev => [...prev, { q: query, a: data.data.answer }])
        }
        setQuery('')
      }
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">🔍 企业知识搜索</h1>
              <p className="text-gray-500 mt-1">AI驱动的企业知识库搜索助手</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setMode('search')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  mode === 'search' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                📄 文档搜索
              </button>
              <button
                onClick={() => setMode('chat')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  mode === 'chat' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                💬 AI对话
              </button>
              <button
                onClick={() => setMode('both')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  mode === 'both' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                🎯 完整模式
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Search Input */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <div className="flex gap-4">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="输入问题，例如：年假有多少天？请假流程是什么？"
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
              disabled={loading}
            />
            <button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {loading ? (
                <>
                  <span className="animate-spin">⏳</span>
                  搜索中...
                </>
              ) : (
                <>
                  🔍 搜索
                </>
              )}
            </button>
          </div>
        </div>

        {/* Chat History */}
        {chatHistory.length > 0 && (
          <div className="space-y-6 mb-8">
            {chatHistory.map((item, idx) => (
              <div key={idx} className="space-y-4">
                <div className="flex justify-end">
                  <div className="bg-blue-600 text-white px-4 py-3 rounded-2xl rounded-br-sm max-w-xl">
                    {item.q}
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="bg-white px-4 py-3 rounded-2xl rounded-bl-sm max-w-2xl shadow">
                    {item.a}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* AI Answer */}
            {result.answer && (
              <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl p-6 text-white">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-2xl">🤖</span>
                  <h2 className="text-xl font-semibold">AI 回答</h2>
                </div>
                <div className="prose prose-invert max-w-none">
                  <p className="text-lg leading-relaxed whitespace-pre-wrap">{result.answer}</p>
                </div>
              </div>
            )}

            {/* Sources */}
            {result.sources.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  📚 参考文档 ({result.sources.length})
                </h2>
                <div className="grid gap-3">
                  {result.sources.map((source) => (
                    <div
                      key={source.id}
                      className="border border-gray-200 rounded-lg p-4 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-medium text-gray-900">{source.title}</h3>
                          <span className="inline-block mt-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-sm rounded">
                            {source.category}
                          </span>
                        </div>
                        <span className="text-gray-400">→</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Documents (Search Mode) */}
            {(mode === 'search' || mode === 'both') && result.documents.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  📄 相关文档 ({result.documents.length})
                </h2>
                <div className="space-y-4">
                  {result.documents.map((doc) => (
                    <div key={doc.id} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                      <h3 className="font-medium text-gray-900 mb-2">{doc.title}</h3>
                      <p className="text-gray-600 text-sm line-clamp-3">{doc.content}</p>
                      <div className="flex gap-2 mt-2">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded">
                          {doc.category}
                        </span>
                        <span className="px-2 py-0.5 bg-gray-50 text-gray-500 text-xs rounded">
                          {doc.source}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="text-center text-gray-400 text-sm">
              搜索耗时: {result.stats.searchTime}ms | 找到文档: {result.stats.docsFound}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!result && chatHistory.length === 0 && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🔍</div>
            <h2 className="text-2xl font-semibold text-gray-700 mb-2">开始搜索企业知识</h2>
            <p className="text-gray-500 max-w-md mx-auto">
              输入问题，AI将从企业知识库中查找答案，并列出相关文档来源
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {['请假制度', '报销流程', '公司介绍', '入职流程'].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setQuery(suggestion)}
                  className="px-4 py-2 bg-white border border-gray-200 rounded-full text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
