import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 演示时习惯用 127.0.0.1 打开，Next 会把 dev 资源当跨域请求拦掉（页面永远停在载入中）→ 两个 origin 都放行
  allowedDevOrigins: ['127.0.0.1', 'localhost'],

  // Next 自带的类型检查会 spawn 子进程，在受限沙箱里会 EPERM；类型正确性改由 `npm run typecheck` 保证
  typescript: { ignoreBuildErrors: true },

  // 左下角的 Next.js 开发浮标会盖住侧栏底部
  devIndicators: false,
}

export default nextConfig
