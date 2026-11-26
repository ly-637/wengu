import type { Metadata } from 'next'
import './globals.css'
import './shell.css'
import './sprint.css'
import './fragment.css'
import './modes.css'
import './home.css'
import './score.css'
import './side.css'

export const metadata: Metadata = {
  title: '温故 · 记忆的时间表',
  description: '会掉色的知识地图 + 精确到小时的学习计划',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
