'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  PageHeader, SearchBar, Card, Badge, ListItem,
  EmptyState, Button, Drawer, TabSwitch,
  MobileTabBar, Divider, Toast, useBreakpoint
} from '../Shared/ResponsiveComponents'

// ============================================
// 企业通讯录 & 组织架构页面
// PC端：左侧树+右侧列表 | 手机端：Tab切换通讯录/组织架构
// ============================================

export default function DirectoryOrgChartPage({ enterpriseId }: { enterpriseId?: string }) {
  const bp = useBreakpoint()
  const isMobile = bp === 'mobile'

  const [tab, setTab] = useState('directory')
  const [employees, setEmployees] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [orgTree, setOrgTree] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedDept, setSelectedDept] = useState<string | null>(null)
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null)
  const [mobileTab, setMobileTab] = useState('directory')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)

  const fetchDirectory = useCallback(async () => {
    if (!enterpriseId) return
    try {
      const params = new URLSearchParams({ pageSize: '50', page: '1' })
      if (search) params.set('search', search)
      if (selectedDept) params.set('departmentId', selectedDept)
      if (statusFilter) params.set('status', statusFilter)

      const res = await fetch(`/api/enterprises/${enterpriseId}/directory?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      const data = await res.json()
      if (data.success) {
        setEmployees(data.data.employees)
        setTotalCount(data.data.pagination?.total || data.data.employees.length)
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [enterpriseId, search, selectedDept, statusFilter])

  const fetchOrgChart = useCallback(async () => {
    if (!enterpriseId) return
    try {
      const res = await fetch(`/api/enterprises/${enterpriseId}/org-chart?flat=false`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      const data = await res.json()
      if (data.success) setOrgTree(data.data)

      const deptRes = await fetch(`/api/enterprises/${enterpriseId}/departments`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      const deptData = await deptRes.json()
      if (deptData.success) setDepartments(deptData.data || [])
    } catch (e) { console.error(e) }
  }, [enterpriseId])

  useEffect(() => {
    if (tab === 'directory') fetchDirectory()
    if (tab === 'orgchart') fetchOrgChart()
  }, [tab, fetchDirectory, fetchOrgChart])

  const statusOptions = [
    { value: null, label: '全部', color: 'gray' },
    { value: 'available', label: '在线', color: 'green' },
    { value: 'busy', label: '忙碌', color: 'red' },
    { value: 'away', label: '离开', color: 'yellow' },
    { value: 'offline', label: '离线', color: 'gray' },
  ]

  if (!enterpriseId) {
    return <div className="p-6 text-center text-gray-500">请先选择一个企业</div>
  }

  // ===== PC端布局 =====
  if (!isMobile) {
    return (
      <div className="flex h-full">
        {/* 左侧边栏 */}
        <div className="w-64 border-r bg-white p-4 overflow-y-auto">
          <div className="text-xs font-semibold text-gray-400 uppercase px-2 mb-3">通讯录</div>

          {/* 部门筛选 */}
          <div className="mb-4">
            <div className="text-xs font-semibold text-gray-400 px-2 mb-2">按部门</div>
            <div className="space-y-1">
              <button
                onClick={() => { setSelectedDept(null); fetchDirectory() }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                  !selectedDept ? 'bg-purple-50 text-purple-600 font-medium' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span>全部部门</span>
                <span className="text-xs bg-gray-100 px-1.5 rounded">{totalCount}</span>
              </button>
              {departments.map(dept => (
                <button
                  key={dept.id}
                  onClick={() => { setSelectedDept(dept.id); fetchDirectory() }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                    selectedDept === dept.id ? 'bg-purple-50 text-purple-600 font-medium' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span style={{ backgroundColor: dept.color || '#6366f1' }} className="w-2 h-2 rounded-full" />
                    {dept.name}
                  </span>
                  <span className="text-xs bg-gray-100 px-1.5 rounded">{dept.memberCount || 0}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 在线状态 */}
          <Divider label="在线状态" />
          <div className="space-y-1">
            {statusOptions.map(s => (
              <button
                key={s.value || 'all'}
                onClick={() => setStatusFilter(s.value)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                  statusFilter === s.value ? 'bg-purple-50 text-purple-600' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span className={`w-2 h-2 rounded-full bg-${s.color}-500`} />
                {s.label}
              </button>
            ))}
          </div>

          <Divider />

          {/* 通讯录统计 */}
          <div className="text-xs text-gray-400 px-2">
            共 {totalCount} 位成员 · {departments.length} 个部门
          </div>
        </div>

        {/* 右侧主内容 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="bg-white border-b px-6 py-4 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">
                {tab === 'directory' ? '👥 通讯录' : '🏢 组织架构'}
              </h2>
            </div>
            <div className="flex-1 max-w-md">
              <SearchBar placeholder="搜索姓名、部门、技能..." value={search} onChange={setSearch} />
            </div>
            <TabSwitch
              tabs={[
                { id: 'directory', label: '📋 通讯录' },
                { id: 'orgchart', label: '🌳 组织架构' },
              ]}
              activeTab={tab}
              onTabChange={setTab}
            />
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {tab === 'directory' ? (
              loading ? <div className="text-center py-16 text-gray-400">加载中...</div> :
              employees.length === 0 ? <EmptyState icon="👥" title="没有找到成员" description="试试其他搜索词" /> :
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {employees.map(emp => (
                  <EmployeeCard key={emp.id} employee={emp} onClick={() => setSelectedEmployee(emp)} />
                ))}
              </div>
            ) : (
              <OrgChartView tree={orgTree} onEmployeeClick={setSelectedEmployee} />
            )}
          </div>
        </div>

        {/* 员工详情 */}
        <EmployeeDrawer
          employee={selectedEmployee}
          onClose={() => setSelectedEmployee(null)}
        />
      </div>
    )
  }

  // ===== 手机端布局 =====
  const mobileTabs = [
    { id: 'directory', icon: '👥', label: '通讯录' },
    { id: 'orgchart', icon: '🌳', label: '组织' },
    { id: 'profile', icon: '👤', label: '我的' },
  ]

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <PageHeader title="通讯录" icon="👥" />

      {/* 搜索 */}
      <div className="px-4 py-2 bg-white">
        <SearchBar placeholder="搜索姓名、部门、技能..." value={search} onChange={setSearch} />
      </div>

      {/* 标签切换 */}
      <div className="bg-white">
        <TabSwitch
          tabs={[
            { id: 'directory', label: '通讯录', badge: totalCount },
            { id: 'orgchart', label: '组织架构' },
          ]}
          activeTab={tab}
          onTabChange={setTab}
        />
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto pb-16">
        {tab === 'directory' ? (
          loading ? <div className="text-center py-16 text-gray-400">加载中...</div> :
          employees.length === 0 ? <EmptyState icon="👥" title="没有找到成员" /> :
          <div className="divide-y bg-white">
            {employees.map(emp => (
              <EmployeeListItem
                key={emp.id}
                employee={emp}
                onClick={() => setSelectedEmployee(emp)}
              />
            ))}
          </div>
        ) : (
          <MobileOrgChart
            tree={orgTree}
            onEmployeeClick={setSelectedEmployee}
          />
        )}
      </div>

      {/* 员工详情 */}
      <Drawer
        open={!!selectedEmployee}
        onClose={() => setSelectedEmployee(null)}
        title="员工详情"
        height="70vh"
      >
        {selectedEmployee && <EmployeeDetail employee={selectedEmployee} />}
      </Drawer>

      <MobileTabBar tabs={mobileTabs} activeTab={mobileTab} onTabChange={setMobileTab} />
    </div>
  )
}

// ===== 子组件 =====

function EmployeeCard({ employee, onClick }: { employee: any; onClick: () => void }) {
  const statusColors: Record<string, string> = {
    available: 'bg-green-500', busy: 'bg-red-500', away: 'bg-yellow-500', offline: 'bg-gray-400'
  }

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md transition-all cursor-pointer"
    >
      <div className="flex items-start gap-3">
        <div className="relative">
          {employee.avatarUrl ? (
            <img src={employee.avatarUrl} alt={employee.name} className="w-12 h-12 rounded-full object-cover" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white font-bold text-lg">
              {employee.name?.charAt(0) || '?'}
            </div>
          )}
          <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${statusColors[employee.status] || statusColors.offline}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{employee.name}</div>
          <div className="text-sm text-gray-500 truncate">{employee.jobTitle || employee.department}</div>
          {employee.department && (
            <div className="flex items-center gap-1 mt-1">
              <span className="text-xs text-purple-600">{employee.department}</span>
            </div>
          )}
        </div>
      </div>
      {employee.skills && employee.skills.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {employee.skills.slice(0, 3).map((skill: string, i: number) => (
            <span key={i} className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">{skill}</span>
          ))}
          {employee.skills.length > 3 && (
            <span className="px-2 py-0.5 text-xs text-gray-400">+{employee.skills.length - 3}</span>
          )}
        </div>
      )}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t">
        {employee.email && (
          <button
            onClick={e => { e.stopPropagation(); window.location.href = `mailto:${employee.email}` }}
            className="text-xs text-purple-600 hover:underline flex items-center gap-1"
          >
            📧 发邮件
          </button>
        )}
        {employee.phone && (
          <button
            onClick={e => { e.stopPropagation(); window.location.href = `tel:${employee.phone}` }}
            className="text-xs text-purple-600 hover:underline flex items-center gap-1"
          >
            📞 打电话
          </button>
        )}
      </div>
    </div>
  )
}

function EmployeeListItem({ employee, onClick }: { employee: any; onClick: () => void }) {
  const statusColors: Record<string, string> = {
    available: 'bg-green-500', busy: 'bg-red-500', away: 'bg-yellow-500', offline: 'bg-gray-400'
  }

  return (
    <div onClick={onClick} className="flex items-center gap-3 px-4 py-3 active:bg-gray-50">
      <div className="relative">
        {employee.avatarUrl ? (
          <img src={employee.avatarUrl} alt={employee.name} className="w-11 h-11 rounded-full object-cover" />
        ) : (
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white font-bold">
            {employee.name?.charAt(0) || '?'}
          </div>
        )}
        <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${statusColors[employee.status] || statusColors.offline}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium">{employee.name}</div>
        <div className="text-sm text-gray-500">{employee.jobTitle || employee.department || '未分配职位'}</div>
      </div>
      <span className="text-gray-300 text-xl">›</span>
    </div>
  )
}

function OrgChartView({ tree, onEmployeeClick, depth = 0 }: { tree: any[]; onEmployeeClick: (e: any) => void; depth?: number }) {
  if (!tree || tree.length === 0) return <EmptyState icon="🌳" title="暂无组织架构" description="请先在管理后台配置部门" />

  return (
    <div className="space-y-6">
      {tree.map(dept => (
        <div key={dept.id} className="border border-gray-200 rounded-xl overflow-hidden">
          {/* 部门头部 */}
          <div
            className="px-4 py-3 flex items-center gap-3"
            style={{ backgroundColor: dept.color ? `${dept.color}10` : '#f9fafb', borderLeft: dept.color ? `4px solid ${dept.color}` : '4px solid #e5e7eb' }}
          >
            <span className="font-semibold text-lg">{dept.name}</span>
            {dept.manager && (
              <span className="text-sm text-gray-500">👤 {dept.manager.name}</span>
            )}
            <span className="ml-auto text-sm bg-gray-100 px-2 py-0.5 rounded-full">
              {dept.employees?.length || 0} 人
            </span>
          </div>

          {/* 部门成员 */}
          {dept.employees && dept.employees.length > 0 && (
            <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              {dept.employees.map((emp: any) => (
                <div
                  key={emp.id}
                  onClick={() => onEmployeeClick(emp)}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  <div className="relative">
                    {emp.avatarUrl ? (
                      <img src={emp.avatarUrl} className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-sm">
                        {emp.name?.charAt(0)}
                      </div>
                    )}
                    <span className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-white ${
                      emp.status === 'available' ? 'bg-green-500' : 'bg-gray-400'
                    }`} />
                  </div>
                  <span className="text-sm font-medium truncate">{emp.name}</span>
                </div>
              ))}
            </div>
          )}

          {/* 子部门 */}
          {dept.children && dept.children.length > 0 && (
            <div className="px-4 pb-4">
              <OrgChartView tree={dept.children} onEmployeeClick={onEmployeeClick} depth={depth + 1} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function MobileOrgChart({ tree, onEmployeeClick }: { tree: any[]; onEmployeeClick: (e: any) => void }) {
  if (!tree || tree.length === 0) return <EmptyState icon="🌳" title="暂无组织架构" />

  return (
    <div className="p-4 space-y-3">
      {tree.map(dept => (
        <div key={dept.id} className="bg-white rounded-xl overflow-hidden">
          <div
            className="px-4 py-3 flex items-center gap-2 font-medium"
            style={{ backgroundColor: dept.color ? `${dept.color}15` : '#f9fafb' }}
          >
            <span style={{ backgroundColor: dept.color || '#6366f1' }} className="w-3 h-3 rounded-full" />
            <span>{dept.name}</span>
            <span className="ml-auto text-xs text-gray-400">{dept.employees?.length || 0}人</span>
          </div>
          <div className="divide-y">
            {dept.employees?.slice(0, 5).map((emp: any) => (
              <div
                key={emp.id}
                onClick={() => onEmployeeClick(emp)}
                className="flex items-center gap-3 px-4 py-3 active:bg-gray-50 cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-sm">
                  {emp.name?.charAt(0)}
                </div>
                <span className="text-sm">{emp.name}</span>
              </div>
            ))}
            {dept.employees && dept.employees.length > 5 && (
              <div className="px-4 py-2 text-center text-sm text-gray-400">
                还有 {dept.employees.length - 5} 人...
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function EmployeeDrawer({ employee, onClose }: { employee: any; onClose: () => void }) {
  if (!employee) return null

  const statusLabels: Record<string, { label: string; color: string }> = {
    available: { label: '在线', color: 'bg-green-100 text-green-700' },
    busy: { label: '忙碌', color: 'bg-red-100 text-red-700' },
    away: { label: '离开', color: 'bg-yellow-100 text-yellow-700' },
    offline: { label: '离线', color: 'bg-gray-100 text-gray-600' },
  }

  return (
    <Drawer open={!!employee} onClose={onClose} title="员工详情">
      {employee && <EmployeeDetail employee={employee} />}
    </Drawer>
  )
}

function EmployeeDetail({ employee }: { employee: any }) {
  return (
    <div className="space-y-6">
      {/* 头像和基本信息 */}
      <div className="text-center">
        <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white font-bold text-3xl mb-3">
          {employee.avatarUrl ? (
            <img src={employee.avatarUrl} className="w-full h-full rounded-full object-cover" />
          ) : employee.name?.charAt(0)}
        </div>
        <h3 className="text-xl font-bold">{employee.name}</h3>
        <p className="text-gray-500">{employee.jobTitle || '未分配职位'}</p>
        {employee.status && (
          <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium ${
            { available: 'bg-green-100 text-green-700', busy: 'bg-red-100 text-red-700', away: 'bg-yellow-100 text-yellow-700', offline: 'bg-gray-100 text-gray-600' }[employee.status]
          }`}>
            {employee.status === 'available' ? '🟢 在线' : employee.status === 'busy' ? '🔴 忙碌' : employee.status === 'away' ? '🟡 离开' : '⚫ 离线'}
          </span>
        )}
      </div>

      <Divider />

      {/* 联系信息 */}
      <div className="space-y-3">
        {employee.department && (
          <div className="flex items-center gap-3">
            <span className="text-xl">🏢</span>
            <div>
              <div className="text-xs text-gray-400">部门</div>
              <div className="text-sm font-medium">{employee.department}</div>
            </div>
          </div>
        )}
        {employee.email && (
          <div className="flex items-center gap-3">
            <span className="text-xl">📧</span>
            <div>
              <div className="text-xs text-gray-400">邮箱</div>
              <a href={`mailto:${employee.email}`} className="text-sm text-purple-600 hover:underline">{employee.email}</a>
            </div>
          </div>
        )}
        {employee.phone && (
          <div className="flex items-center gap-3">
            <span className="text-xl">📞</span>
            <div>
              <div className="text-xs text-gray-400">电话</div>
              <a href={`tel:${employee.phone}`} className="text-sm text-purple-600 hover:underline">{employee.phone}</a>
            </div>
          </div>
        )}
        {employee.location && (
          <div className="flex items-center gap-3">
            <span className="text-xl">📍</span>
            <div>
              <div className="text-xs text-gray-400">工位</div>
              <div className="text-sm">{employee.location}</div>
            </div>
          </div>
        )}
      </div>

      {/* 技能标签 */}
      {employee.skills && employee.skills.length > 0 && (
        <>
          <Divider />
          <div>
            <div className="text-xs text-gray-400 mb-2">🎯 技能</div>
            <div className="flex flex-wrap gap-2">
              {employee.skills.map((skill: string, i: number) => (
                <span key={i} className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">
                  {skill}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {/* 个人简介 */}
      {employee.bio && (
        <>
          <Divider />
          <div>
            <div className="text-xs text-gray-400 mb-2">✍️ 个人简介</div>
            <p className="text-sm text-gray-600 leading-relaxed">{employee.bio}</p>
          </div>
        </>
      )}

      <Divider />

      {/* 操作按钮 */}
      <div className="grid grid-cols-3 gap-3">
        {employee.phone && (
          <Button icon="📞" variant="secondary" size="sm" block onClick={() => window.location.href = `tel:${employee.phone}`}>
            拨号
          </Button>
        )}
        {employee.email && (
          <Button icon="📧" variant="secondary" size="sm" block onClick={() => window.location.href = `mailto:${employee.email}`}>
            邮件
          </Button>
        )}
        <Button icon="💬" variant="secondary" size="sm" block onClick={() => alert('消息功能开发中')}>
          消息
        </Button>
      </div>
    </div>
  )
}
