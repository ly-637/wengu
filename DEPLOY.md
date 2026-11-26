# 部署：GitHub + Vercel + Upstash（全免费，无需信用卡）

GitHub 本身只能托管**静态文件**（GitHub Pages），这个站点有 `/api/*`、要写学习记录、要拿 DeepSeek key，所以必须跑在 Node 运行时上。免费又常年可用的组合是：

```
GitHub（存代码） → Vercel（跑 Node，给你 <project>.vercel.app） → Upstash Redis（存学习记录，免费额度 10MB 足够）
```

代码已经改好，不需要再动：

- `web/src/lib/kv.ts`：有 `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` 就走 Redis，没有就退回本地 `.data/*.json`。
- `web/src/lib/store.ts`、`docstore.ts`、`quizcache.ts` 都改成走这层，本地开发体验不变。
- `web/src/middleware.ts`：设了 `SHARE_GATE` 就要求 `?k=口令`，防止陌生人烧你的 API 额度。
- `/api/ai/*` 全部声明 `maxDuration = 60`，避开 Vercel 默认 10 秒超时。

## 一、建 Upstash（3 分钟）

1. https://upstash.com 用 GitHub 登录 → Create Database → 名字随意，Region 选 `us-east-1`（离 Vercel 默认区域近）→ Free。
2. 进数据库页，翻到 **REST API**，抄下两个值：`UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`。

## 二、推代码到 GitHub

本仓库已经初始化好 git（根目录 `.gitignore` 已排除 `node_modules`、`.next`、`.data`、录屏帧）。只需要：

```powershell
cd "C:\Users\刘屹\Downloads\ds学习agent"
git remote add origin https://github.com/<你的用户名>/wengu.git
git branch -M main
git push -u origin main
```

（先在 GitHub 上 New repository 建一个空仓库，别勾 README。）

## 三、连 Vercel（2 分钟）

1. https://vercel.com 用 GitHub 登录 → Add New → Project → 选刚推的仓库。
2. **Root Directory 改成 `web`**（重要，Next 项目在子目录里）。
3. Framework 会自动识别成 Next.js，构建命令和输出目录都不用改。
4. Environment Variables 填这几条（Production + Preview 都勾上）：

| 变量 | 值 |
| --- | --- |
| `AI_BASE_URL` | `https://api.deepseek.com` |
| `AI_MODEL` | `deepseek-flash` |
| `AI_API_KEY` | 你的 `sk-...` |
| `SHARE_GATE` | 自定口令，例如 `wengu-7f3a` |
| `UPSTASH_REDIS_REST_URL` | 上一步抄的 URL |
| `UPSTASH_REDIS_REST_TOKEN` | 上一步抄的 TOKEN |

5. Deploy。完成后地址是 `https://<project>.vercel.app`，发给别人用 `https://<project>.vercel.app/?k=口令`。

## 四、把题库缓存灌进 Upstash（可选，但强烈建议）

线上第一次点「考我 3 题」若缓存为空，会实时调模型（约 4 秒）。把本地已经生成好的 114 道题推上去，演示就是秒开：

```powershell
cd web
$env:UPSTASH_REDIS_REST_URL="https://xxx.upstash.io"
$env:UPSTASH_REDIS_REST_TOKEN="xxx"
node scripts/seed-redis.mjs
```

## 五、验证清单

- [ ] `https://<project>.vercel.app/` 不带口令 → 401
- [ ] 带 `?k=口令` → 跳到首页，看到「温故 / 中国近代史纲要」
- [ ] 点「开始 · 15 分钟」→ 助教能回话（说明 key 通了）
- [ ] 交卷后颜色变化 → 刷新还在（说明 Upstash 通了）
- [ ] 点「重置演示数据」→ 回到 28 个考点的初始状态

## 备注

- Vercel 的 Serverless 冷启动约 1 秒，AI 回复本身 2–4 秒，体感正常。
- 免费额度：Vercel Hobby 100GB 带宽/月；Upstash Free 10MB 存储 + 每天 1 万次命令，这个站点一天用不到 100 次。
- 想换自己的域名：Vercel 项目 Settings → Domains，按提示加一条 CNAME 即可。
