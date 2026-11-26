# 学习辅助网站 · 设计方案 v1

> 前提（已确认）：单用户本地/自托管 · 计算机理工科样板 · Next.js 全 TS 单体 · DeepSeek API · 先做知识树+颜色衰减 · 一周内全模块 v0 跑通

---

## 0. 一句话架构

**一个状态，五个投影。**

```
                    kp_state（user × 知识点）
                     stability / difficulty
                     last_review_at / due_at / mastery
                              │
        ┌───────────┬─────────┼─────────┬───────────┐
        ▼           ▼         ▼         ▼           ▼
   ① 知识树颜色  ② 小时级计划 ③ 出题优先级 ④ 成绩折线 ⑤ 复习提醒
        ▲
        │  证据回流（event sourcing）
   做题 / 费曼 / 阅读 / 复习 / 手动
```

颜色、规划、出题、统计全部是这张状态表的**视图**，不是四套逻辑。所有交互只写 `evidence`，再由规则更新 `kp_state`。

---

## 1. 核心算法：双通道颜色

只用一个值必然出问题：只用「记忆保持度」→ 昨天刚学会，三天后变灰，用户觉得"我明明学会了"。

**拆成两个变量：**

| 变量 | 含义 | 变化速度 | 来源 |
|---|---|---|---|
| `mastery` M | 掌握度：到底会不会 | 慢，几周级 | 证据累积（做题得分、费曼评分） |
| `R` | 可回忆性：现在还记得吗 | 快，天级 | FSRS 遗忘曲线 |

```ts
// lib/color.ts —— 纯函数，任意 now 都能算（前端计算 = 免费获得时间旅行）
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

export function strengthOf(s: KpState, now = Date.now()): number {
  if (!s.lastReviewAt) return 0                       // 从未学过 → 纯灰
  const days = (now - s.lastReviewAt) / 86_400_000
  const S = Math.max(s.stability, 0.1)                // 防除零
  // FSRS 闭式：S 定义为 R=0.9 的天数 → R(S,S)=0.9 ✓
  const R = Math.pow(1 + (19 / 81) * (days / S), -0.5)
  // 颜色只有一个含义：现在这个知识点的掌握程度。没有任何偏置系数。
  return clamp01(s.mastery * R)
}
```

> **决策记录（m00182）**：颜色只表达一件事——**当前掌握程度**。
> 早先版本写的 `M × (0.35 + 0.65R)`（以及中途改过的 `0.60 + 0.40R`）是错的：那个偏置让颜色**不等于任何真实量**，用户看到的深浅无法解释、也无法校准。已删除，不留地板、不留偏移。
> 一个掌握度 0.5 的点刚复习完是浅绿，一个 0.9 的点放了三个月也是浅绿——**颜色相同是应该的**，因为它们此刻"能用出来多少"确实一样。区别靠点开看分量（见下）。

**为什么不需要人为防灰地板**：FSRS 的可回忆性衰减是先慢后快的。以刚学完 `S = 3 天` 为例——第 7 天 `R ≈ 0.80`，第 30 天 `R ≈ 0.55`。所以"刚学会一周就一片灰"这个担心不成立，它不会发生；而三个月不碰确实会灰，**那个灰是真实的**。

> 若以后改用 FSRS-6 可学参数，换成 `fsrs.get_retrievability(card, now)`，别自己维护系数。

**渲染规则：**

```css
/* 灰 → 绿，直接在 OKLab 里混，暗色模式自动适配 */
background: color-mix(in oklab, #a1a1aa, #16a34a calc(var(--strength) * 100%));
```

| 状态 | 视觉 |
|---|---|
| 从未学过（无 state） | **纯灰底 + 虚线描边**（虚线是"还没开始"，不是"忘了"） |
| 学过、颜色随 R 自然变浅 | 深浅即掌握度，不设人为下限；悬浮显示"预计 2 天后明显遗忘" |
| 熟练（strength > 0.7） | 饱和深绿 |
| 已过 due 日期 | **颜色不变**，加红色外环 + 呼吸动画。"该复习"和"掌握度"走两个不通的通道，不互相污染 |
| 练习失分（score < 0.4） | M 下调 → 颜色立刻变浅，这是唯一让颜色瞬间掉下来的路径 |

**三种"灰"必须视觉可分**（否则分不清"没学"和"学废了"）：

| 状态 | 底色 | 边框 |
|---|---|---|
| 从未学过 | 纯灰 | **虚线** |
| 学过但很久没碰 | 浅绿（可能很浅，如实） | 实线 |
| 考砸了 | 近灰 | 实线 |

**单一通道的固有局限（要承认）**：`0.3` 这个颜色有两种成因——"学得浅但刚复习"（M 0.3 / R 1.0）和"学得深但快忘了"（M 0.9 / R 0.33）。该做的事完全不同（前者要深学，后者要复习）。

对策不是回到双通道，而是**点开节点时把两个分量摊开**：

| 显示 | 含义 | 用户该做什么 |
|---|---|---|
| 大数字 = 颜色值（M×R） | 此刻能用出来多少 | — |
| 小条 ① M | 学得多扎实 | M 低 → 需要深学、做题、讲一遍 |
| 小条 ② R | 现在还记得多少 | R 低 → 复习一次就能回到浓绿 |
| 红色外环 | 已过到期日 | 立刻复习，成本最低 |

**时间旅行**：树的接口返回 `{mastery, stability, lastReviewAt}` 原始值，颜色在前端算。所以顶部一个滑块 `−30 天 ←→ 今天 ←→ +30 天` 就是免费的，**这是验收"颜色会变淡"的唯一手段**，第一版必须有。它也顺便证明了颜色没有撒谎：拖到 +30 天，浅下去的是真实会变浅的部分。

---

## 2. 掌握度 M 的更新规则

必须写成明确公式，否则实现时会各自发挥。

```ts
const W = { quiz: 1.0, feynman: 0.8, review: 0.6, read: 0.3 } as const
const ALPHA = 0.35

// score ∈ [0,1]：选择题 对=1 错=0；填空按命中比例；费曼按四维评分
function updateMastery(M: number, kind: EvidenceKind, score: number) {
  let next = M + ALPHA * W[kind] * (score - M)
  if (score < 0.4) next -= 0.10        // 答错额外惩罚，避免"蒙对"虚高
  return clamp01(next)
}
```

可解释、单调、不会震荡。首次学习时 `M₀ = 0.15`（学过了但还没验证）。

---

## 3. 三种模式 = 一个引擎的三组参数

| | 完整学习 | 期末冲刺 | 碎片化 |
|---|---|---|---|
| 内容源 | 大纲/教材，拓扑序 | 考纲+错题，**覆盖优先** | 每日短文/卡片 |
| desired retention | 0.85 | 0.92 | 0.80 |
| 单次时长 | 45–90 min | 25–45 min，刷题为主 | 3–10 min |
| 排程权重 | 前置依赖 > 到期 > 弱项 | 考频 × (1−M) > 时间紧迫度 | 到期 + 每天 1 篇新内容 |
| 交互流 | 讲解 → 费曼 → 小测 | 刷题 → 错题回流 → 局部重讲 | 读 → 费曼追问 → 自动抽点 |
| 调度周期 | 7 天滚动 | 按 deadline 倒排 | 每日一次 |

`mode` 只映射到 `{retention, sessionLen, source, weights}` 预设，**不是三套代码**。

---

## 4. 数据模型

SQLite（最省事，`pnpm dev` 零依赖；Drizzle 换 driver 即可迁 Postgres）。

```sql
-- 课程 / 知识体系容器
CREATE TABLE course (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'full',
  exam_date INTEGER, daily_minutes INTEGER DEFAULT 120,
  desired_retention REAL DEFAULT 0.85, created_at INTEGER NOT NULL
);

-- 知识点（邻接表存树）
CREATE TABLE kp (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES course(id),
  parent_id TEXT REFERENCES kp(id), title TEXT NOT NULL, summary TEXT,
  order_index INTEGER NOT NULL DEFAULT 0, depth INTEGER NOT NULL DEFAULT 0,
  importance REAL DEFAULT 0.5,        -- 考频/权重，冲刺模式用
  est_minutes INTEGER DEFAULT 20, created_at INTEGER NOT NULL
);
CREATE INDEX idx_kp_course ON kp(course_id, order_index);

-- 跨点关系（前置依赖 / 相关）—— 力导向图和排程都要用
CREATE TABLE kp_edge (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL,
  from_kp TEXT NOT NULL REFERENCES kp(id), to_kp TEXT NOT NULL REFERENCES kp(id),
  kind TEXT NOT NULL,                 -- 'prereq' | 'related'
  weight REAL DEFAULT 1.0
);

-- ★ 核心状态表
CREATE TABLE kp_state (
  kp_id TEXT PRIMARY KEY REFERENCES kp(id),
  stability REAL NOT NULL DEFAULT 0, difficulty REAL NOT NULL DEFAULT 5,
  reps INTEGER DEFAULT 0, lapses INTEGER DEFAULT 0,
  last_review_at INTEGER, due_at INTEGER,
  mastery REAL NOT NULL DEFAULT 0.15, updated_at INTEGER NOT NULL
);
CREATE INDEX idx_state_due ON kp_state(due_at);

-- 证据（溯源，颜色/统计可重算）
CREATE TABLE evidence (
  id TEXT PRIMARY KEY, kp_id TEXT NOT NULL REFERENCES kp(id),
  kind TEXT NOT NULL,                 -- read|feynman|quiz|review|manual
  score REAL, weight REAL, ref_id TEXT, note TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX idx_ev_kp ON evidence(kp_id, created_at);

-- 文档 → 切片 → 知识点
CREATE TABLE doc (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL, title TEXT, filename TEXT,
  mime TEXT, bytes INTEGER, status TEXT NOT NULL DEFAULT 'pending',
  -- pending|parsing|chunking|extracting|done|error
  error TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE chunk (
  id TEXT PRIMARY KEY, doc_id TEXT NOT NULL REFERENCES doc(id),
  idx INTEGER NOT NULL, text TEXT NOT NULL, tokens INTEGER, hash TEXT
);
CREATE TABLE doc_kp (
  doc_id TEXT NOT NULL, kp_id TEXT NOT NULL, confidence REAL,
  PRIMARY KEY (doc_id, kp_id)
);

-- 出题
CREATE TABLE quiz_item (
  id TEXT PRIMARY KEY, kp_id TEXT NOT NULL REFERENCES kp(id),
  type TEXT NOT NULL,                 -- single|multi|judge|blank|short
  stem TEXT NOT NULL, options TEXT, answer TEXT, rubric TEXT, explain TEXT,
  difficulty REAL DEFAULT 0.5, p_value REAL, source TEXT DEFAULT 'ai',
  created_at INTEGER NOT NULL
);
CREATE TABLE quiz_attempt (
  id TEXT PRIMARY KEY, item_id TEXT NOT NULL, kp_id TEXT NOT NULL,
  paper_id TEXT, answer TEXT, score REAL NOT NULL, correct INTEGER,
  judge_note TEXT, duration_ms INTEGER, created_at INTEGER NOT NULL
);
CREATE TABLE paper (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL, title TEXT, mode TEXT,
  item_ids TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE paper_attempt (
  id TEXT PRIMARY KEY, paper_id TEXT NOT NULL, score REAL, total REAL,
  started_at INTEGER, finished_at INTEGER
);

-- 学习区：并行多个学习上下文
CREATE TABLE study_session (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL, kp_id TEXT,
  title TEXT, mode TEXT, draft TEXT, chat TEXT,
  last_active_at INTEGER NOT NULL, status TEXT DEFAULT 'open'
);

-- 小时级排程
CREATE TABLE plan_block (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL, date TEXT NOT NULL,  -- YYYY-MM-DD
  start_min INTEGER NOT NULL, end_min INTEGER NOT NULL,              -- 分钟内偏移
  kp_id TEXT, kind TEXT NOT NULL,                                    -- learn|review|quiz|feynman|break
  reason TEXT NOT NULL,                                              -- ★ 必须可解释
  status TEXT DEFAULT 'todo', actual_min INTEGER, generated_at INTEGER
);
CREATE INDEX idx_plan_date ON plan_block(course_id, date);
```

**关键约定**：`kp_state` 是一行一知识点（单用户无需 user_id）。多用户时加 `user_id` 进主键即可，其余表不用动。

---

## 5. 文档 → 知识点 流水线

DeepSeek 目前没有 embedding 接口，所以主路径不依赖向量检索：

```
上传 → 解析文本 → 结构化切片（按标题/段落，400~800 token，带上下文前缀）
     → ① LLM 抽候选知识点（JSON）
     → ② LLM 二次归并：与已有树比对，判定 {已有→挂载 | 新子节点 | 新根节点}
     → ③ 写 doc_kp + 新增 kp（M=0.15，加入"待学"队列）
     → ④ 命中的已有知识点：写入 evidence(read)，M 微增（W.read=0.3，score=0.55）
```

**去重是成败关键。** 不做归并，3 篇文档能把 200 点的树变 800 点。对策：

1. 抽取 prompt 明确要求「只输出 5–12 个**可独立考察**的知识点，禁止输出章节名作为知识点」。
2. 归并时把已有树的 `{id, title}` 全量喂进去（计算机类 300 点内 token 可控），要求模型**必须优先复用已有 id**，只在确实没有时新建。
3. 硬上限：单次新增 > 30 点或树总量 > 800 点时，返回告警让用户确认，不静默写入。

**可选增强**（第一周不做）：本地 `transformers.js` + `bge-small-zh` 做 embedding，用于相似度预筛和"相关知识点"推荐。

---

## 6. 出题与判分

**生成**：按知识点生成，一次 5 题，混合类型，要求同时给 `answer`、`explain`、`rubric`。

**质量门（必做，成本极低）**：生成后进第二轮调用——只给题干和选项，让模型独立作答，与第一轮的 `answer` 不一致的题**直接丢弃或重新生成**。这一步能把劣质题过滤掉一大半。

**判分**：

| 类型 | 判分方式 |
|---|---|
| single / multi / judge | 确定性比对，零 AI 参与 |
| blank | 去空格 + 同义词表 + 编辑距离 ≤ 1 命中 |
| short | rubric 打分，**重复三次取中位数**，保留手工覆盖入口 |

**错题回流**：错 → `evidence(quiz, score=0) ` → M 下降 → 该点自动进入次日复习队列；对 → `score=1` → 走 FSRS 正常调度。

**自适应**：每题记 `p_value`（滚动正确率），出卷时按 `(1 − p_value) × importance × (1 − M)` 排序取题，即「越不会、越重要、越没练」优先。

---

## 7. 小时级排程

不做运筹优化，做**贪心 + 滚动 7 天**：

```
输入：周可用时间模板（如 周一~五 19:00-22:00，周六 9:00-12:00）
      + 已 due 的复习点 + 未学的知识点（按拓扑序/重要度）+ 单点预计时长
循环每个可用时间窗：
  1. 先塞「已过期复习」（硬约束，最多占 40% 时间）
  2. 再塞「今日到期复习」
  3. 剩余时间按 score 从高到低塞新知识点：
     score = 前置依赖满足度 × importance × (1/M) ÷ 预计时长
  4. 每 45–60 min 插一个 5–10 min break
  5. 每个 block 写 reason
输出：7 天 block 表
```

**两条必须遵守的规则：**

1. **每个 block 带 `reason`**："复习「二叉搜索树」— 已到期 2 天，期末占比 12%"。可解释性是用户信任计划的全部来源。
2. **未完成只顺延，不重排全表**。每天重新生成「今天 + 剩余 6 天」，已过去的日期冻结不动。否则计划天天变，三天就放弃。

---

## 8. 学习区 · 费曼 · 碎片

**学习区（多开）**：`study_session` 表，每个 session 独立保存 `kp_id / draft / chat / last_active_at`。UI 是顶部 tab（最多 5 个），切换不丢状态。第一周不做分屏。

**费曼流程（文字版）**：

1. 用户读完/学完一个知识点 → 点「讲给我听」
2. 用户用大白话输入讲解（可多次追加，自动保存 draft）
3. AI 只做三件事，按轮次：**找漏洞 → 扮演小白追问（最多 3 轮）→ 四维评分**
4. 四维：准确性 / 完整性 / 通俗度 / 因果链，各 0–1，加权平均作为 `score` 写入 evidence

**碎片模式**：每日推送 1 篇短文（用户预置素材库或 LLM 生成），读 → 费曼追问 → 自动抽点并入知识树（走第 5 节流水线，但只允许「挂载到已有」或「新建草稿点」，避免污染主树）。

---

## 9. 技术栈与目录

```
Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui
Drizzle ORM + better-sqlite3
ts-fsrs                          # 调度，别自己写
@xyflow/react + dagre            # 树视图 / 力导向视图
recharts                          # 成绩折线、热力图
DeepSeek API (OpenAI 兼容 SDK) + zod 校验 + 1 次重试
pdf-parse / mammoth / officeparser / marked   # 文档解析
```

```
app/
  course/[id]/
    tree/page.tsx        知识体系（树/图双视图 + 时间旅行）
    plan/page.tsx        规划（日/周视图）
    docs/page.tsx        文档（上传 + 抽取状态）
    quiz/page.tsx        出题 + 答题 + 结果
    stats/page.tsx       统计（折线 + 热力图）
  study/page.tsx         学习区（多 tab）
  api/
    tree/route.ts                 GET ?at=...
    kp/route.ts                   POST / PATCH / DELETE
    kp/generate/route.ts          POST  AI 生成知识树
    doc/upload/route.ts           POST
    doc/[id]/route.ts             GET 状态轮询
    quiz/generate/route.ts        POST
    quiz/attempt/route.ts         POST（判分 + 更新状态）
    review/route.ts               POST（FSRS 打分 1-4）
    plan/generate/route.ts        POST
    session/route.ts              CRUD
lib/
  db/{index,schema}.ts
  fsrs.ts        # 卡片映射 + 调度
  color.ts       # strengthOf（前端共用）
  mastery.ts     # updateMastery
  llm/{client,prompts,json}.ts
  doc/{parse,chunk,extract,merge}.ts
  plan/generate.ts
  quiz/{generate,judge,quality}.ts
```

**零后台任务**：文档处理用 route handler 内异步跑 + `doc.status` 状态机 + 前端 2s 轮询。单用户不需要 BullMQ/Redis。

---

## 10. 一周排期（每条 v0，按依赖倒序）

| Day | 交付 | 验收标准 |
|---|---|---|
| D1 | 脚手架 + schema + FSRS + **时间旅行滑块** + 树渲染（静态灰绿） | 手动点"复习"颜色变深；滑块拖到 +30 天颜色变淡；肉眼可辨 |
| D2 | AI 生成知识树 + 手动增删改 + 拖拽排序 + 力导向视图切换 | 输入"数据结构"能出 80–150 点、层级合理的树，且能编辑 |
| D3 | 上传 PDF/DOCX/PPTX → 切片 → 抽点 → 归并 → 写入 + evidence | 传一份课件，树上新增的点 < 30 且无重复，相关点颜色变深 |
| D4 | 出题（4 类型）+ 质量门 + 判分 + 错题回流 + 成绩折线 | 点"出题"出 5 题，答完后树上错点颜色变浅、折线更新 |
| D5 | 排程引擎 + 日历日/周视图 + reason 展示 + 顺延 | 给 3 天可用时间，生成合理 7 天计划，每个 block 有 reason |
| D6 | 学习区多 tab + 费曼（文字，3 轮追问 + 四维评分） | 同时开 3 个知识点学习，切换草稿不丢；费曼评分写入颜色 |
| D7 | 冲刺模式（参数预设 + deadline 倒排）+ 碎片模式 + 打磨 + 打包 | 设 exam_date 后计划变为覆盖优先；`pnpm build` 通过可部署 |

**接受现实**：D6、D7 是最可能翻车的两天。若到 D6 落后，**优先砍冲刺模式的「倒排」逻辑**，只保留 `desired_retention=0.92` 的参数预设——功能表上算 80% 完成，代码上省 1.5 天。

---

## 11. 第一周明确不做

- 多用户 / 登录 / 权限（本地单用户，最多一个环境变量口令）
- OCR、图片、手写笔记、网页抓取
- 语音费曼 / 语音转写
- 主观题 AI 自动批改的**默认开启**（只留接口 + 手工评分）
- 题库真题频次统计（没有数据源）
- 图谱 WebGL 渲染、1000+ 节点性能优化
- 移动端适配、离线、推送通知、导出报告
- 版本历史 / 多课程对比 / 社交

---

## 12. Top 3 风险

| 风险 | 症状 | 对策 |
|---|---|---|
| 知识点爆炸 | 传 3 篇文档树从 200 变 800，全是重复 | 抽取数量硬约束 + 全量已有树喂给归并 + 30 点/次上限告警 |
| AI 出题劣质 | 答案错、选项都是废选项 | 双轮生成自检门；客观题确定性判分；保留手工删题 |
| 颜色不敏感 | 用户觉得"灰变绿没什么感觉" | 时间旅行滑块 + 常驻图例 + 悬浮数值；**D1 就要自己盯一天** |
