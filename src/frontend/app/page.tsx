import { redirect } from 'next/navigation'
import LoginPage from './login/page'

export default function Home() {
  // 如果已登录，跳转到工作台
  // 否则显示登录页面
  return <LoginPage />
}
