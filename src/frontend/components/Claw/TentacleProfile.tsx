'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

// ============================================
// 触手档案页面 - 个人Claw视角
// 展示触手保存的所有个人工作数据
// ============================================

export default function TentacleProfilePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [editing, setEditing] = useState(false)
  const [formData, setFormData] = useState<any>({})

  useEffect(() => {
    fetchProfile()
  }, [])

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/me/profile', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      const data = await res.json()
      if (data.success) {
        setProfile(data.data)
        setFormData(data.data.profile)
      }
    } catch (e) {
      console.error('获取触手档案失败', e)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      const res = await fetch('/api/me/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(formData)
      })
      const data = await res.json()
      if (data.success) {
        setEditing(false)
        fetchProfile()
      }
    } catch (e) {
      console.error('保存失败', e)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载触手档案中...</div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="p-6 text-center">
        <div className="text-6xl mb-4">🦑</div>
        <h2 className="text-xl font-bold mb-2">还没有触手档案</h2>
        <p className="text-gray-500 mb-4">您的触手正在初始化中...</p>
      </div>
    )
  }

  const { profile: p, connections, stats } = profile

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-2xl">
            {p.avatarUrl ? (
              <img src={p.avatarUrl} alt={p.realName || '触手'} className="w-full h-full rounded-full object-cover" />
            ) : (
              '🦑'
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{p.realName || '触手'}</h1>
            <p className="text-gray-500">{p.clawName || '个人Claw'}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 rounded text-xs ${
                p.profileStatus === 'verified' ? 'bg-green-100 text-green-700' :
                p.profileStatus === 'complete' ? 'bg-blue-100 text-blue-700' :
                'bg-yellow-100 text-yellow-700'
              }`}>
                {p.profileStatus === 'verified' ? '✅ 已认证' :
                 p.profileStatus === 'complete' ? '📋 已完善' : '⚠️ 待完善'}
              </span>
              {connections.length > 0 && (
                <span className="px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-700">
                  🔗 已连接 {connections.length} 个企业
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={() => setEditing(!editing)}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
        >
          {editing ? '取消' : '编辑档案'}
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon="📄" label="证件数量" value={stats.documentCount} color="blue" />
        <StatCard icon="🎯" label="入职完成" value={`${stats.onboardingCompleted}/${stats.onboardingTotal}`} color="green" />
        <StatCard icon="🏢" label="连接企业" value={connections.length} color="purple" />
        <StatCard icon="💪" label="触手健康" value={stats.clawHealth || '良好'} color={stats.clawHealth === 'healthy' ? 'green' : 'yellow'} />
      </div>

      {/* 标签页 */}
      <div className="border-b">
        <div className="flex gap-4">
          {['overview', 'connections', 'documents', 'resume', 'skills'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'overview' && '📋 概览'}
              {tab === 'connections' && '🔗 企业连接'}
              {tab === 'documents' && '📄 证件管理'}
              {tab === 'resume' && '📝 简历'}
              {tab === 'skills' && '🎯 技能'}
            </button>
          ))}
        </div>
      </div>

      {/* 标签页内容 */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {editing ? (
              <div className="grid grid-cols-2 gap-4">
                <InputField label="真实姓名" value={formData.realName} onChange={v => setFormData({...formData, realName: v})} />
                <InputField label="性别" value={formData.gender} onChange={v => setFormData({...formData, gender: v})} />
                <InputField label="生日" value={formData.birthday} onChange={v => setFormData({...formData, birthday: v})} type="date" />
                <InputField label="个人电话" value={formData.personalPhone} onChange={v => setFormData({...formData, personalPhone: v})} />
                <InputField label="紧急联系人" value={formData.emergencyContact?.name} onChange={v => setFormData({...formData, emergencyContact: {...formData.emergencyContact, name: v}})} />
                <InputField label="紧急联系电话" value={formData.emergencyContact?.phone} onChange={v => setFormData({...formData, emergencyContact: {...formData.emergencyContact, phone: v}})} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <InfoRow label="真实姓名" value={p.realName || '未设置'} />
                <InfoRow label="性别" value={p.gender || '未设置'} />
                <InfoRow label="生日" value={p.birthday || '未设置'} />
                <InfoRow label="个人电话" value={p.personalPhone || '未设置'} />
                <InfoRow label="工号" value={p.employeeNumber || '未分配'} />
                <InfoRow label="工作邮箱" value={p.workEmail || '未设置'} />
                <InfoRow label="入职日期" value={p.onboardedAt || '待入职'} />
                <InfoRow label="身份证" value={p.idCardNumber || '未填写'} />
                <InfoRow label="紧急联系人" value={p.emergencyContact ? `${p.emergencyContact.name} ${p.emergencyContact.phone}` : '未设置'} />
              </div>
            )}
            {editing && (
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setEditing(false)} className="px-4 py-2 border rounded-lg">取消</button>
                <button onClick={handleSave} className="px-4 py-2 bg-purple-600 text-white rounded-lg">保存</button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'connections' && (
          <div className="space-y-4">
            <h3 className="font-semibold">已连接的企业</h3>
            {connections.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <div className="text-4xl mb-2">🏢</div>
                <p>还没有连接任何企业</p>
                <button
                  onClick={() => router.push('/discover')}
                  className="mt-2 text-purple-600 hover:underline"
                >
                  探索并加入企业 →
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {connections.map(conn => (
                  <div key={conn.enterpriseId} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded bg-gray-200 flex items-center justify-center">
                        {conn.enterpriseName.charAt(0)}
                      </div>
                      <div>
                        <div className="font-semibold">{conn.enterpriseName}</div>
                        <div className="text-sm text-gray-500">
                          {conn.role} · {conn.department || ''} {conn.jobTitle ? `· ${conn.jobTitle}` : ''}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {conn.status === 'active' ? '🟢 已连接' : '🔴 已断开'} · 
                          {conn.connectedAt ? `连接于 ${new Date(conn.connectedAt).toLocaleDateString()}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {conn.status === 'active' && (
                        <div className="text-right text-sm">
                          <div className="text-gray-500">入职进度</div>
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-purple-600 rounded-full"
                                style={{ width: `${(conn.onboarding?.rate || 0)}%` }}
                              />
                            </div>
                            <span className="text-xs">{conn.onboarding?.rate || 0}%</span>
                          </div>
                        </div>
                      )}
                      <button
                        onClick={() => router.push(`/enterprise/${conn.enterpriseId}`)}
                        className="px-3 py-1 text-sm border rounded hover:bg-gray-100"
                      >
                        查看详情
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'documents' && (
          <DocumentsTab />
        )}

        {activeTab === 'resume' && (
          <ResumeTab />
        )}

        {activeTab === 'skills' && (
          <SkillsTab skills={p.skills || []} workExperience={p.workExperience || []} editing={editing} />
        )}
      </div>

      {/* 触手生命周期时间线 */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="font-semibold mb-4">🦑 触手生命周期</h3>
        <div className="space-y-2">
          {[
            { icon: '🎉', label: '触手创建', desc: '个人Claw已初始化', done: true },
            { icon: '📝', label: '完善档案', desc: '填写个人信息和工作经历', done: p.profileStatus !== 'incomplete' },
            { icon: '🔗', label: '连接企业', desc: '加入第一个企业', done: connections.some((c: any) => c.status === 'active') },
            { icon: '🎯', label: '完成入职', desc: '完成企业入职任务', done: stats.onboardingCompleted > 0 },
            { icon: '💪', label: '触手成长', desc: '持续使用，让Claw越来越懂你', done: false },
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg ${
                step.done ? 'bg-green-100' : 'bg-gray-100'
              }`}>
                {step.icon}
              </div>
              <div>
                <div className={`font-medium ${step.done ? '' : 'text-gray-400'}`}>{step.label}</div>
                <div className="text-xs text-gray-400">{step.desc}</div>
              </div>
              <div className="ml-auto">
                {step.done ? (
                  <span className="text-green-500 text-sm">✅</span>
                ) : (
                  <span className="text-gray-300 text-sm">○</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// 子组件

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: any; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600',
  }
  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${colors[color]?.split(' ')[1] || 'text-gray-800'}`}>{value}</div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-100">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function InputField({ label, value, onChange, type = 'text' }: any) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
      />
    </div>
  )
}

function DocumentsTab() {
  const [docs, setDocs] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    fetchDocuments()
  }, [])

  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/me/profile/documents', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      const data = await res.json()
      if (data.success) setDocs(data.data)
    } catch (e) { console.error(e) }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return
    setUploading(true)
    // TODO: 上传到 MinIO
    setTimeout(() => {
      setUploading(false)
      fetchDocuments()
    }, 1000)
  }

  const docTypeLabels: Record<string, string> = {
    avatar: '工牌照', id_card: '身份证', resume: '简历',
    contract: '合同', certificate: '证书', other: '其他'
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">证件管理</h3>
        <label className="px-4 py-2 bg-purple-600 text-white rounded-lg cursor-pointer hover:bg-purple-700">
          {uploading ? '上传中...' : '📤 上传证件'}
          <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={handleUpload} />
        </label>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {docs.length === 0 ? (
          <div className="col-span-3 text-center py-8 text-gray-400">
            <div className="text-4xl mb-2">📄</div>
            <p>还没有上传任何证件</p>
            <p className="text-xs mt-1">支持身份证、工牌照、简历、合同等</p>
          </div>
        ) : docs.map(doc => (
          <div key={doc.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <span className={`px-2 py-0.5 rounded text-xs ${
                doc.visibility === 'private' ? 'bg-gray-100 text-gray-600' :
                doc.visibility === 'company_only' ? 'bg-blue-100 text-blue-600' :
                'bg-green-100 text-green-600'
              }`}>
                {doc.visibility === 'private' ? '🔒 仅自己' :
                 doc.visibility === 'company_only' ? '🏢 公司可见' : '🌐 公开'}
              </span>
              <span className="text-xs text-gray-400">{docTypeLabels[doc.docType] || doc.docType}</span>
            </div>
            <div className="text-sm font-medium truncate">{doc.docName}</div>
            <div className="text-xs text-gray-400 mt-1">
              {doc.verifiedAt ? `✅ 已认证于 ${new Date(doc.verifiedAt).toLocaleDateString()}` : '未认证'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ResumeTab() {
  const [resumeUrl, setResumeUrl] = useState('')
  const [uploading, setUploading] = useState(false)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return
    setUploading(true)
    // TODO: 上传到 MinIO 并调用解析 API
    setTimeout(() => setUploading(false), 2000)
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">📝 个人简历</h3>
      {resumeUrl ? (
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📄</span>
            <div>
              <div className="font-medium">简历已上传</div>
              <a href={resumeUrl} target="_blank" className="text-sm text-purple-600 hover:underline">查看简历 →</a>
            </div>
          </div>
          <label className="px-3 py-1 border rounded hover:bg-gray-50 cursor-pointer text-sm">
            重新上传
            <input type="file" className="hidden" accept=".pdf,.doc,.docx" onChange={handleUpload} />
          </label>
        </div>
      ) : (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <div className="text-4xl mb-2">📄</div>
          <p className="font-medium">上传您的简历</p>
          <p className="text-sm text-gray-400 mt-1">支持 PDF、Word 格式，Claw会自动解析技能和工作经历</p>
          <label className="mt-4 inline-block px-4 py-2 bg-purple-600 text-white rounded-lg cursor-pointer hover:bg-purple-700">
            {uploading ? '上传并解析中...' : '📤 选择文件'}
            <input type="file" className="hidden" accept=".pdf,.doc,.docx" onChange={handleUpload} />
          </label>
        </div>
      )}
    </div>
  )
}

function SkillsTab({ skills, workExperience, editing }: { skills: any[]; workExperience: any[]; editing: boolean }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-3">🎯 技能标签</h3>
        <div className="flex flex-wrap gap-2">
          {skills.length === 0 ? (
            <span className="text-gray-400">还没有添加技能</span>
          ) : skills.map((skill: string, i: number) => (
            <span key={i} className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">
              {skill}
            </span>
          ))}
        </div>
        {editing && (
          <p className="text-sm text-gray-400 mt-2">从简历解析或手动编辑可添加技能</p>
        )}
      </div>
      <div>
        <h3 className="font-semibold mb-3">💼 工作经历</h3>
        {workExperience.length === 0 ? (
          <p className="text-gray-400">还没有工作经历记录</p>
        ) : (
          <div className="space-y-3">
            {workExperience.map((exp: any, i: number) => (
              <div key={i} className="flex gap-4 p-3 border rounded-lg">
                <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center">🏢</div>
                <div>
                  <div className="font-medium">{exp.title || exp.job || '职位'}</div>
                  <div className="text-sm text-gray-500">{exp.company}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {exp.startDate || exp.startYear} - {exp.endDate || exp.endYear || '至今'}
                  </div>
                  {exp.description && (
                    <p className="text-sm text-gray-600 mt-2">{exp.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
