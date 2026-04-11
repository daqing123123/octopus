'use client'

import { useState, useEffect } from 'react'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import Dashboard from '@/components/Dashboard'
import MessagePage from '@/components/Messages/MessagePage'
import TablePage from '@/components/Tables/TablePage'
import DocumentPage from '@/components/Documents/DocumentPage'
import TaskPage from '@/components/Tasks/TaskPage'
import AIPage from '@/components/AI/AIPage'
import FilesPage from '@/components/Files/FilesPage'
import OKRPage from '@/components/OKR/OKRPage'
import CalendarPage from '@/components/Calendar/CalendarPage'
import {
  ClawSettingsPage, EnterpriseApplicationsPage, MyApplicationsPage,
  ProductivityAnalytics, PrivacyDashboard, AgentManager,
  MemoryEnhancement, KnowledgeGraph, ProactiveService,
  TentacleProfilePage, BrainDashboardPage,
  NotificationCenterPage, OnboardingWizardPage,
  DirectoryOrgChartPage, ProfileCompletenessPage, VideoMeetingPage
} from '@/components/Claw'
import CollaborationPage from './collaboration/page'
import { OffboardingPanel } from '@/components/Offboarding'
import { useRouter } from 'next/navigation'

export default function Workspace() {
  const router = useRouter()
  const [activeModule, setActiveModule] = useState('dashboard')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [currentEnterprise, setCurrentEnterprise] = useState<string | null>(null)

  useEffect(() => {
    // 检查登录状态
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/')
    }

    // 加载用户的企业
    const userStr = localStorage.getItem('user')
    if (userStr) {
      // TODO: 获取用户的企业列表
    }
  }, [router])

  const renderContent = () => {
    switch (activeModule) {
      case 'dashboard':
        return <Dashboard />
      case 'messages':
        return <MessagePage />
      case 'tables':
        return <TablePage />
      case 'documents':
        return <DocumentPage />
      case 'collaboration':
        return <CollaborationPage />
      case 'tasks':
        return <TaskPage />
      case 'ai':
        return <AIPage />
      case 'files':
        return <FilesPage />
      case 'okr':
        return <OKRPage />
      case 'calendar':
        return <CalendarPage />
      case 'settings':
        return <div className="p-6">设置模块开发中...</div>
      case 'claw-settings':
        return <ClawSettingsPage />
      case 'claw-knowledge':
        return <KnowledgeGraph />
      case 'claw-productivity':
        return <ProductivityAnalytics />
      case 'claw-memory':
        return <MemoryEnhancement />
      case 'claw-privacy':
        return <PrivacyDashboard />
      case 'claw-agent':
        return <AgentManager />
      case 'claw-proactive':
        return <ProactiveService />
      case 'enterprise-applications':
        return currentEnterprise ? (
          <EnterpriseApplicationsPage enterpriseId={currentEnterprise} />
        ) : (
          <div className="p-6 text-center text-gray-500">请先选择一个企业</div>
        )
      case 'my-applications':
        return <MyApplicationsPage />
      case 'claw-tentacle':
        return <TentacleProfilePage />
      case 'claw-brain':
        return currentEnterprise ? (
          <BrainDashboardPage />
        ) : (
          <div className="p-6 text-center text-gray-500">请先选择一个企业</div>
        )
      // ===== 5大新功能 =====
      case 'notifications':
        return <NotificationCenterPage />
      case 'onboarding-wizard':
        return currentEnterprise ? (
          <OnboardingWizardPage enterpriseId={currentEnterprise} />
        ) : (
          <div className="p-6 text-center text-gray-500">请先选择一个企业</div>
        )
      case 'directory':
        return currentEnterprise ? (
          <DirectoryOrgChartPage enterpriseId={currentEnterprise} />
        ) : (
          <div className="p-6 text-center text-gray-500">请先选择一个企业</div>
        )
      case 'profile-completeness':
        return <ProfileCompletenessPage enterpriseId={currentEnterprise || undefined} view="tentacle" />
      case 'meetings':
        return currentEnterprise ? (
          <VideoMeetingPage enterpriseId={currentEnterprise} view="tentacle" />
        ) : (
          <div className="p-6 text-center text-gray-500">请先选择一个企业</div>
        )
      case 'offboarding':
        return <OffboardingPanel enterpriseId={currentEnterprise || undefined} />
      default:
        return <Dashboard />
    }
  }

  return (
    <div className="h-screen flex bg-gray-100">
      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        activeModule={activeModule}
        onModuleChange={setActiveModule}
        currentEnterprise={currentEnterprise}
        onEnterpriseChange={setCurrentEnterprise}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          collapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          currentEnterprise={currentEnterprise}
        />

        <main className="flex-1 overflow-auto bg-gray-50">
          {renderContent()}
        </main>
      </div>
    </div>
  )
}