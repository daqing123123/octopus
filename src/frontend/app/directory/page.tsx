'use client'

import { useState, useEffect } from 'react'

interface Member {
  id: string
  name: string
  email: string
  avatar?: string
  title?: string
  department?: string
  skills: string[]
  bio?: string
}

interface Department {
  department: string
  memberCount: number
  managers: { id: string; name: string; avatar?: string; title?: string }[]
}

export default function DirectoryPage() {
  const [view, setView] = useState<'grid' | 'list' | 'org'>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState<string>('')
  const [skillFilter, setSkillFilter] = useState<string>('')
  const [members, setMembers] = useState<Member[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)

  useEffect(() => {
    fetchDirectory()
  }, [searchQuery, departmentFilter, skillFilter])

  const fetchDirectory = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set('q', searchQuery)
      if (departmentFilter) params.set('department', departmentFilter)
      if (skillFilter) params.set('skills', skillFilter)

      const res = await fetch(`/api/${window.__ENTERPRISE_ID__}/directory/search?${params}`)
      const data = await res.json()
      
      if (data.success) {
        setMembers(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch directory:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchDepartments = async () => {
    try {
      const res = await fetch(`/api/${window.__ENTERPRISE_ID__}/directory/org-tree`)
      const data = await res.json()
      if (data.success) {
        setDepartments(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch departments:', error)
    }
  }

  useEffect(() => {
    fetchDepartments()
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">👥 企业通讯录</h1>
              <p className="text-gray-500 mt-1">{members.length} 位同事</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setView('grid')}
                className={`p-2 rounded-lg ${view === 'grid' ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:bg-gray-100'}`}
              >
                ▦
              </button>
              <button
                onClick={() => setView('list')}
                className={`p-2 rounded-lg ${view === 'list' ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:bg-gray-100'}`}
              >
                ☰
              </button>
              <button
                onClick={() => setView('org')}
                className={`p-2 rounded-lg ${view === 'org' ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:bg-gray-100'}`}
              >
                🏢
              </button>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="mt-4 flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索姓名、部门、技能..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">所有部门</option>
              {departments.map((d) => (
                <option key={d.department} value={d.department}>
                  {d.department} ({d.memberCount})
                </option>
              ))}
            </select>
            <input
              type="text"
              value={skillFilter}
              onChange={(e) => setSkillFilter(e.target.value)}
              placeholder="筛选技能"
              className="px-4 py-2 border border-gray-300 rounded-lg w-32"
            />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Grid View */}
        {view === 'grid' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl p-6 animate-pulse">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-14 h-14 bg-gray-200 rounded-full" />
                    <div className="flex-1">
                      <div className="h-4 bg-gray-200 rounded w-24 mb-2" />
                      <div className="h-3 bg-gray-100 rounded w-16" />
                    </div>
                  </div>
                  <div className="h-3 bg-gray-100 rounded w-full mb-2" />
                  <div className="flex gap-2">
                    <div className="h-6 bg-gray-100 rounded w-16" />
                    <div className="h-6 bg-gray-100 rounded w-20" />
                  </div>
                </div>
              ))
            ) : (
              members.map((member) => (
                <div
                  key={member.id}
                  onClick={() => setSelectedMember(member)}
                  className="bg-white rounded-xl p-6 hover:shadow-lg transition-shadow cursor-pointer"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div className="relative">
                      {member.avatar ? (
                        <img src={member.avatar} alt={member.name} className="w-14 h-14 rounded-full object-cover" />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xl font-semibold">
                          {member.name[0]}
                        </div>
                      )}
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{member.name}</h3>
                      <p className="text-sm text-gray-500">{member.title || member.department}</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">{member.bio || member.email}</p>
                  <div className="flex flex-wrap gap-2">
                    {member.skills.slice(0, 3).map((skill) => (
                      <span key={skill} className="px-2 py-1 bg-blue-50 text-blue-600 text-xs rounded-full">
                        {skill}
                      </span>
                    ))}
                    {member.skills.length > 3 && (
                      <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded-full">
                        +{member.skills.length - 3}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* List View */}
        {view === 'list' && (
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">成员</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">部门</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">职位</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">技能</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {members.map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold">
                          {member.name[0]}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{member.name}</div>
                          <div className="text-sm text-gray-500">{member.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600">{member.department}</td>
                    <td className="px-6 py-4 text-gray-600">{member.title}</td>
                    <td className="px-6 py-4">
                      <div className="flex gap-1 flex-wrap">
                        {member.skills.slice(0, 2).map((skill) => (
                          <span key={skill} className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => setSelectedMember(member)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        查看 →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Org Tree View */}
        {view === 'org' && (
          <div className="space-y-4">
            {departments.map((dept) => (
              <div key={dept.department} className="bg-white rounded-xl p-6 shadow">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">{dept.department}</h3>
                  <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm">
                    {dept.memberCount} 人
                  </span>
                </div>
                {dept.managers.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm text-gray-500 mb-2">负责人:</p>
                    <div className="flex gap-2">
                      {dept.managers.map((manager) => (
                        <div key={manager.id} className="flex items-center gap-2 bg-blue-50 px-3 py-1 rounded-full">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs">
                            {manager.name[0]}
                          </div>
                          <span className="text-sm text-blue-700">{manager.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {members
                    .filter((m) => m.department === dept.department)
                    .map((member) => (
                      <div
                        key={member.id}
                        onClick={() => setSelectedMember(member)}
                        className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-100"
                      >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm">
                          {member.name[0]}
                        </div>
                        <span className="text-sm text-gray-700">{member.name}</span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Member Detail Modal */}
        {selectedMember && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-semibold">
                    {selectedMember.name[0]}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{selectedMember.name}</h2>
                    <p className="text-gray-500">{selectedMember.title}</p>
                    <p className="text-sm text-blue-600">{selectedMember.department}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedMember(null)} className="text-gray-400 hover:text-gray-600">
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-500">邮箱</label>
                  <p className="text-gray-900">{selectedMember.email}</p>
                </div>
                {selectedMember.bio && (
                  <div>
                    <label className="text-sm text-gray-500">个人简介</label>
                    <p className="text-gray-900">{selectedMember.bio}</p>
                  </div>
                )}
                <div>
                  <label className="text-sm text-gray-500">技能</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {selectedMember.skills.map((skill) => (
                      <span key={skill} className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-sm">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  💬 发消息
                </button>
                <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                  📅 预约会议
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
