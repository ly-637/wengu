# 部署：GitHub + Vercel（不需要任何第三方账号）

GitHub Pages 只能托管静态文件，这个站点有 `/api/*`、要存学习记录、要用 DeepSeek 的 key，必须跑在 Node 上。但**代码已经改成「只要 Vercel」**：

- 存储：`web/src/lib/kv.ts` 会优先用 **Vercel Blob**（`BLOB_READ_WRITE_TOKEN`），没有就退回本地 JSON。Blob 在 Vercel 项目里点一下就能建，不需要注册别的服务。
- 题库：114 道预生成题已经打进仓库（`web/src/lib/seed/quiz-cache.json`），线上开箱即用，不用灌数据。
- 门禁：`web/src/middleware.ts` 读 `SHARE_GATE`，别人拿不到 `?k=口令` 就进不来。
- 函数超时：`/api/ai/*` 都是 `maxDuration = 60`。

## 步骤（一共四处点击）

### 1. 导入仓库

https://vercel.com/new → 选 **ly-637/wengu** → Import

- **Root Directory 必须改成 `web`**（点 Edit 输入），其余保持默认（Framework 会自动识别 Next.js）。

### 2. 建一个 Blob 存学习记录

项目页 → **Storage** → **Create Database** → 选 **Blob** → 名字 `wengu` → Create → **Connect to Project**（勾 Production）。

完成后 Vercel 会自动注入 `BLOB_READ_WRITE_TOKEN`，不用手动填。

### 3. 填四个环境变量

项目页 → Settings → Environment Variables → 逐条加（Production 勾上）：

| 变量名 | 值 |
| --- | --- |
| `AI_BASE_URL` | `https://api.deepseek.com` |
| `AI_MODEL` | `deepseek-flash` |
| `AI_API_KEY` | 你的 `sk-...`（在本地 `web/.env.local` 里） |
| `SHARE_GATE` | `wengu-7f3a`（可自定） |

### 4. 部署

Deployments → 右上 **Redeploy**（如果第 1 步已经部署过，需要在加完变量后重跑一次，变量才会生效）。

## 验收

- `https://<项目>.vercel.app/` → 401
- `https://<项目>.vercel.app/?k=wengu-7f3a` → 进首页，标题「温故」
- 点「开始 · 15 分钟」→ 助教能回话（key 通了）
- 交卷后颜色变 → 刷新还在（Blob 通了）
- 点「重置演示数据」→ 回到 28 个考点

## 常见问题

- **构建失败说找不到模块**：Root Directory 没设成 `web`。
- **AI 一直转圈**：`AI_API_KEY` 没填或填错；Vercel → Functions 日志里能看到 401。
- **刷新后进度没了**：Blob 没 Connect 到项目，或在加 Blob 之前就部署了，Redeploy 即可。
- **想换域名**：Settings → Domains，按提示加一条 CNAME。
