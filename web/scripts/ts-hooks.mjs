// 模块解析钩子：只在测试进程里生效，把 './color' 补成 './color.ts'。
// 源码保持 bundler 友好的无扩展名导入，`node --test` 也能跑。
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (err) {
    const relative = specifier.startsWith('./') || specifier.startsWith('../')
    const hasExt = /\.[cm]?[jt]s$/.test(specifier)
    if (relative && !hasExt) {
      return await nextResolve(`${specifier}.ts`, context)
    }
    throw err
  }
}
