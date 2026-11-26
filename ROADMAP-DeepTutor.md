# 基于 DeepTutor 的开发路线

> 配套文档：`DESIGN.md`（产品规格：颜色公式、掌握度更新、三模式参数、排程算法）
> 本文档回答一个问题：**既然以 DeepTutor 为底座，哪些不做了、哪些改个做法、哪些仍然是你的核心工作。**
> 事实来源：HKUDS/DeepTutor（61.2k★，Apache-2.0，2026-11-20 仍在推送）、官网 deeptutor.info、docs.deeptutor.info 的 Learning / Mastery Path / Server API 三页。

---

## 0. 一句话结论

**你的六条需求里，有四条 DeepTutor 已经做完了（文档上传、出题、学习区并行、复习调度），有一条它做了一半（知识体系——有知识点地图但只有二元/进度环，没有连续颜色衰减），只有一条是纯空白（精确到小时的学习规划 + 成绩折线）。**

所以项目重心从"建一个学习系统"变成 **"给一个成熟的学习引擎装一块仪表盘"**。工期从 7 天压到 5–6 天，且质量天花板高得多。

---

## 1. 需求 × 现状对照表

| 你的诉求 | DeepTutor 现状（已核实） | 你要做的 |
|---|---|---|
| 知识体系可视化 | **Mastery Path**：目标 → 模块 → **类型化知识点**（`memory` / `procedure` / `concept` / `design`）；`/learning/mastery` 有 atlas 视图；每个主题一个**进度环** | 缺**连续颜色 + 时间衰减 + 时间旅行**。需读它的知识点掌握数据，套 `DESIGN.md` 的 strength 公式渲染 |
| 学会=绿 / 没学会=灰 | 有 "assessed mastery" 与 "learner declaration" 两种来源，且**明确区分**；mastery gate 控制推进 | 二元/环 → 连续值。这是你最核心的差异化，必须自己写 |
| 颜色随时间变淡 | 有 **spaced review when due**（完成的点到期会回来复习），但**没有"变淡"的表达** | 双通道 `strength = M × (0.35 + 0.65R)`，前端算 |
| 复习加深颜色 | due review 回流机制已有，due 计算不用你写 | 复用它的 due 列表，只做"复习 → 颜色变深"的投影 |
| 精确到小时的规划（主线） | **Calendar** 有 account 事件、workspace 任务、due reviews、scheduled instructions、study activity；**Task Board** 管任务 | **纯空白**。排程器 + 日历视图自研（算法见 `DESIGN.md` 第 7 节） |
| 上传文档 → 影响知识体系 | **Knowledge Base** 全链路：上传 → 索引 → RAG；Mastery Path 建路径时可直接选 KB 文件作为 Materials | 已有。你只需在"文档 → 知识点"这步做**归并 + 写回** |
| 学习区同时学不同知识 | **Workspaces**：每个 workspace 一套 conversations / learning / resources，切换即换上下文 | 已有。你要加的是**并排看**（多 workspace 同屏面板） |
| 出题 | `WS /ws/questions/generate`、`/ws/questions/judge`、`/ws/questions/mimic`；Practice 存 answers / mistakes / **recall ratings** / **next review date** | 已有。别重写 |
| 成绩折线 | Practice 存了全部原始数据，但**没有折线图** | 自研，读 `POST /api/sessions/{id}/quiz-results` 等数据源 |
| 费曼学习法 | mastery gate **本身就要求"your own explanation"** 才能过（"Reading an answer alone does not demonstrate a concept or design skill"） | 雏形已有。你只加 **3 轮追问 + 四维评分**（准确性/完整性/通俗度/因果链） |
| 三种模式 | 已有 **Outline / Study / Review** 三种模式 —— 但那是**一次学习会话内的交互模式** | ⚠️ **命名撞车**。你的三种模式是**时间尺度**（完整/冲刺/碎片），必须换个词，建议叫 **节奏（pace）**：`full` / `sprint` / `fragment` |

**这张表的意义**：把 `DESIGN.md` 里"明确不做"的清单再砍一刀——出题双轮自检、判分、错题回流、RAG、文档解析、多 workspace 隔离，**全部不用做了**，改成调用它的 API。

---

## 2. 架构选择

DeepTutor 的后端是独立 FastAPI（`deeptutor serve`，默认 `127.0.0.1:8001`），有完整 OpenAPI（`/openapi.json`、`/docs`），并且**文档里明确写了 "Generate a typed client"**。这决定了你可以不 fork。

### 方案 A：影子前端（推荐）

```
┌────────────────────────┐        ┌─────────────────────────────┐
│ 你的应用 graph-desk    │  HTTP  │  DeepTutor (不动它)          │
│ Next.js :3000          │ ─────► │  FastAPI :8001              │
│                        │   WS   │  ├ Mastery Path (kp + 掌握)  │
│ ├ 知识树（颜色衰减）    │ ◄───── │  ├ Questions (生成/判分)     │
│ ├ 小时级日历           │        │  ├ Knowledge Base (文档)     │
│ ├ 成绩折线             │        │  └ Sessions / Calendar      │
│ ├ 学习区并排面板        │        └─────────────────────────────┘
│ └ 影子 kp_state (SQLite)│
└────────────────────────┘
```

- **改动面 = 0**：不 fork、不 patch，DeepTutor 可以随时 `docker pull` 升级
- **你的代码 100% 是自己的**，只依赖它的 HTTP/WS 契约
- 代价：两个界面（用户在 DeepTutor 里学、在你的应用里看）。**可接受**——因为你的应用是"仪表盘 + 计划"，本来就不是学习场所

### 方案 B：Fork 改前端

clone 下来在 `web/` 里加页面。一个 UI，体验统一。但：它迭代极快（390 个 open issue、`pushed_at` 昨天），你改过的文件每次上游更新都要 merge，**一周的项目不值得背上这个债**。

### 决策依据（唯一未知项）

> **能不能从 DeepTutor 拿到四元组 `(kp_id, mastery 数值, last_assessed_at, due_at)`？**

- **能** → 方案 A，`strength` 直接由它算（2–3 天能出成品）
- **只能拿到二元（mastered / not）** → 方案 A′：自己维护**影子 kp_state 表**，用 `quiz-results` + mastery 变更事件重建连续值（多 1 天）
- **完全拿不到** → 方案 B，只加一个**只读**知识树页面（最不划算，但可行）

**这个判定必须在 D0 完成，不能拖。** 见下一节。

---

## 3. D0：30 分钟验证清单（今天就能跑）

```bash
# 1. 起服务（官方稳定镜像，数据持久化到卷）
docker run --rm --name deeptutor -p 127.0.0.1:3782:3782 \
  -v deeptutor-data:/app/data ghcr.io/hkuds/deeptutor:latest
# 打开 http://127.0.0.1:3782
```

| # | 验证什么 | 怎么做 | 判定标准 |
|---|---|---|---|
| 1 | 有没有 mastery 路由 | 另开终端 `curl -s http://127.0.0.1:3782/openapi.json \| jq '.paths \| keys[]' \| grep -i -E 'master\|path\|knowledge-point'` | 有 GET 能列 kp 即 ✅ |
| 2 | 掌握度是数值还是布尔 | 建一个 Mastery Path，学 1 个点、过 gate，再看该接口返回 | 返回里有 `mastery: 0.xx` 之类数值 → A；只有 `status: mastered` → A′ |
| 3 | due 时间戳在哪 | 看同一响应里有没有 `due_at` / `next_review` / `review_at` | 有 → 复习调度直接复用 |
| 4 | 数据落盘形态 | `docker exec -it deeptutor ls -R /app/data \| head -50` | 找到 mastery 的 json/db 文件 → 有兜底读取路径 |
| 5 | 出题返回什么 | `WS /ws/questions/generate` 或用 UI 出一道，看 `quiz-results` | 有 score / recall rating → 折线数据源确定 |

**把 1–5 的结果贴给我，我直接给你锁定架构并把 D1 的适配层代码写出来。**

---

## 4. 三个自研模块（你的真正工作量）

### 4.1 知识树颜色层（核心差异化，不可省）

规格完全沿用 `DESIGN.md` 第 3 节，这里只记关键：

```
R = (1 + (19/81) × (days / S))^(-0.5)     // S = stability，R=0.9 时的天数
strength = M × (0.35 + 0.65 × R)          // M = mastery，从未学过 → 0
```

渲染：
```css
background: color-mix(in oklab, #a1a1aa, #16a34a calc(var(--strength) * 100%));
```
- `strength < 0.02` → 纯灰 `#a1a1aa`（没学会）
- 已过 `due_at` → 红环 + 呼吸动画
- **必须做时间旅行滑块**（−30 / 今天 / +30 天）：颜色在前端算，这是唯一能验收"会变淡"的手段
- 悬浮必须显示数值：`mastery 0.62 · 保持 71% · 下次复习 3 天后`

图：`@xyflow/react` + `dagre` 自动布局；节点 = 知识点，边 = 前置依赖。

### 4.2 小时级排程器（纯空白，必须自己写）

输入：DeepTutor 的 due 列表 + 你的目标 + 每日可用时段
输出：`plan_block(date, start_min, end_min, kind, reason, status)`

算法（贪心，滚动 7 天，不做运筹优化）：
1. 先塞**过期复习**，占当日时间 ≤ 40%
2. 再塞**今日到期**
3. 剩余时间按 `前置满足度 × importance × (1/M) / 时长` 塞新知识点
4. 每 45–60 min 插 break
5. **每个 block 必须带 `reason`**（"《概率论》第 3 章还没过 gate，且是第 5 章的前置"）
6. **未完成只顺延，已过去的日期冻结**——否则计划天天变，用户会弃用

三种节奏（原名"三模式"，避免与它的 Outline/Study/Review 撞车）只是这组参数：

| 节奏 | 保留率目标 | 单块时长 | 排程权重 |
|---|---|---|---|
| `full` 完整 | 0.85 | 45–90 min | 前置依赖 > 到期 > 弱项 |
| `sprint` 冲刺 | 0.92 | 25–45 min | 考频 ×(1−M) > 紧迫度 |
| `fragment` 碎片 | 0.80 | 3–10 min | 到期 + 每日 1 篇 |

### 4.3 成绩折线 + 学习区并排

- 折线：按天聚合 `score`，叠加"新增知识点数"和"复习完成率"三条线（recharts）
- 并排：多 workspace 的知识树缩略图同屏，点进去切 DeepTutor 的对应 workspace

---

## 5. 一周排期（改造版）

| 天 | 任务 | 交付物 |
|---|---|---|
| **D0**（半天） | 跑通 + 跑完第 3 节验证清单 + 定架构 | 架构决策记录 |
| **D1** | 数据适配层：生成 typed client、拉 kp/掌握/due、影子 `kp_state` 表、时间旅行 | 能在自己的页面显示一棵带 `strength` 的静态树 |
| **D2** | 知识树页面：dagre 布局、颜色、红环、悬浮数值、图例 | 可交互的知识树（截图即 demo） |
| **D3** | 小时级排程器 + 日历视图 | 今日计划能生成、能勾完成、能顺延 |
| **D4** | 成绩折线 + 学习区并排面板 | 三张图 + 多开视图 |
| **D5** | 三节奏参数注入 + 碎片模式（Reading → 费曼 3 轮追问 + 四维评分） | 切换节奏，计划形态明显变化 |
| **D6** | 文档 → 知识点归并写回（复用 `DESIGN.md` 第 6 节的全量归并策略） | 传一份 PDF，树上多出 N 个点且颜色变浅绿 |
| **D7** | 打磨 + 录 demo + 写 README | 可展示成品 |

**降级顺序（时间不够就从下往上砍）**：
1. 砍 D6 → 文档直接用它的 KB，不做知识点归并
2. 砍 D5 的碎片模式 → 只留 `full` / `sprint`
3. 砍 D4 的并排 → 只留折线
4. **绝不砍 D1–D3**：那是你唯一不可替代的部分

---

## 6. 边界：明确不要做的事

- ❌ 不重写它的 RAG / 文档解析 / 向量检索
- ❌ 不重写它的出题与判分（包括双轮自检——`/ws/questions/judge` 已经是独立判分通道）
- ❌ 不重写它的 workspace 隔离
- ❌ 不自己实现 spaced repetition 的 due 计算（有就用它的）
- ❌ 不 fork 改 `web/`（除非 D0 判定必须走方案 B）
- ❌ 不做多用户 / 权限（它已有 `multi-user` 部署文档，需要时直接用）

## 7. 合规

Apache-2.0 允许商用与修改，但必须：
- 保留 `LICENSE`、`NOTICE`（若有）、`THIRD_PARTY_NOTICES.md`
- 修改过的文件加变更声明
- 方案 A（只调 API）不构成衍生作品，但 README 里仍应致谢并链接上游

---

## 8. 决策记录（已定）

| # | 决策 | 用户选择 | 影响 |
|---|---|---|---|
| 1 | D0 验证由谁跑 | **用户自己跑** | 跑完把 `d0-report.txt` 贴回来即可锁定架构 |
| 2 | Embedding 供应商 | **本地** | 见 §9 |
| 3 | 冲刺模式的考频来源 | **AI 自己分析** | 见 §10（不能是"让 LLM 打星"） |

---

## 9. 本地 Embedding 落地（Windows）

DeepTutor 的 Knowledge Base 是 RAG，**必须有 embedding**；DeepSeek 不提供 embedding 接口。

### 9.1 结论先行

**默认选 Ollama + `qwen3-embedding:0.6b`（1024 维，639MB, Q8_0），不选 `bge-m3`。**

`bge-m3` 本身不差，但它四个卖点里有两个在 Ollama 下拿不到，而且它在你这个场景（800 字左右的中文长块）实测不如 qwen3。详见 §9.3。

```
类型：embedding
base_url：http://127.0.0.1:11434/v1
model：qwen3-embedding:0.6b
维度：1024
```

### 9.2 bge-m3 的缺陷（按对你的影响排序）

| # | 缺陷 | 对你的实际影响 |
|---|---|---|
| 1 | **三大检索能力只剩一个**。BGE-M3 的卖点是 dense + sparse + multi-vector 三合一，但 Ollama 的 `/api/embed` 只返回 `embeddings` 一个稠密数组，sparse/ColBERT 分量取不到 | 你付了 567M 参数的代价，拿到的却是一个普通 dense 模型。想用混检必须改用 transformers/FlagEmbedding 或 TEI |
| 2 | **Ollama 端点 4095 token 静默截断**。模型卡写 8192，实际端点给 4095，超了不报错不告警 | 单块 400–800 token 安全；但"整篇文档一次嵌入"、长网页阅读会被砍尾。判断方法：看返回体 `prompt_eval_count`，卡在 4095 就是撞上了 |
| 3 | **长块场景不如 qwen3**。800 字块首位命中率 0.700 vs qwen3 的 0.750 | 你的课件切片恰好在这个量级 |
| 4 | **Ollama 里的包 2 年没更新**（2024 年打的包），qwen3 是 1 年内 | 新量化格式、新算子都拿不到 |
| 5 | **短块（<512 token）并不占优**。300 字块 0.525，低于 bge-large-zh-v1.5 的 0.600 | 影响不大，因为你不会用 300 字块 |
| 6 | **通用模型对公式/代码/表格无专门优化** | 这是所有通用 embedding 的通病，换模型解决不了；靠切片时不把公式和文字混切来缓解 |

### 9.3 块长比模型选择更重要

同一批中文语料上的实测（3032 块、40 道题）：

| 模型 | 300 字块首位命中 | 800 字块首位命中 | 上下文 |
|---|---|---|---|
| bge-large-zh-v1.5 | 0.600 | 0.550 ↓ | 512（长块被截断，748/1286 块越线） |
| bge-m3 | 0.525 | 0.700 ↑ | 8192（Ollama 下实为 4095） |
| qwen3-embedding:0.6b | 0.500 | 0.750 ↑ | 32768（Ollama 下实为 4095） |

**三条可操作结论**：
1. **块要偏大**（600–900 字），别切碎。切碎对这三个模型都是净损失。
2. **300 字块上的排名差异在噪声内**（配对 bootstrap 区间跨 0），别拿它当选型依据。真正有机制解释的是块长反转。
3. **查询加指令前缀、块首拼标题，实测都在噪声内**，别折腾。

### 9.4 换模型的两个陷阱

1. **维度不同** → 直接报错，好认。
2. **维度相同** → **静默失效**。拿 bge-large 的查询向量去查 bge-m3 的 1024 维索引，top1 平均余弦 0.089（等同随机），接口一声不响。所以"先用 A，以后换 B"这个策略是错的，**必须在库还小的时候就定**。
3. **余弦阈值不可跨模型复用**。qwen3 的 top1 平均余弦 0.718 反而排序不如 0.679 的 bge-large——每个模型的相似度刻度不同，把 0.7 当"相关"门槛，换模型即失效。

### 9.5 别在 D0–D3 纠结这件事

知识树归并走的是**全量喂树给 LLM**，不依赖向量检索；向量只用于"文档片段 → 已有知识点"的召回，而一个课程的 chunk 数量只有几百量级，必要时可以整批塞给 LLM。**这件事推到 D6 再定也不会返工，现在不要花时间调模型。**

---

## 10. 冲刺模式的「考频」：AI 分析 ≠ 让 AI 拍星

**问题**：直接问 LLM「这个知识点考频几颗星」得到的是幻觉——它不知道你们学校、这门课、这位老师考什么。

**正确形态：证据驱动的考频，三源加权，零幻觉空间。**

```
exam_freq = 0.50 × 篇幅密度      // 本地可算，0 成本
          + 0.35 × 取证得分      // 联网检索，必须有出处
          + 0.15 × 历史弱点      // 用户自己的练习数据
```

| 源 | 怎么算 | 为什么可信 |
|---|---|---|
| **① 篇幅/例题密度** | 该知识点命中的 chunk 占该课程总 chunk 的 token 比例 + 例题/习题出现次数，归一化 0–1 | 老师花 12% 篇幅讲的东西，大概率考；这个数**可复现、可解释** |
| **② 联网取证** | 用 DeepTutor 的 deepresearch 搜「`<课程名>` `<学校/考试名>` 期末 重点 / 考纲 / 往年题」，**要求逐条返回带出处的条目**；LLM 只做抽取与去重，**不评分** | 没有出处 → 该项记 **0**。宁可少给分，也不给幻觉留口子 |
| **③ 历史弱点** | Practice 的 `mistakes` + 复习后仍错的点，上调该点 importance | 这是"你个人版的考频"，比通用考频更有用 |

**存储**：`kp.exam_freq_source` 存三个原始分量（`spread` / `evidence` / `weakness`）和各自的出处列表。

**为什么分开存**：排程的 `reason` 必须能说人话——
> ❌ "AI 认为这个点重要"
> ✅ "《数据结构》课件里占 12% 篇幅、5 道例题，且你 3 次练习错 2 次"

这是 `DESIGN.md` 里"每个 block 必须带 reason"能成立的唯一前提。**如果只能输出一个星数，这个功能就别做了。**

---

## 11. D0 勘察脚本

已生成 `scripts/d0-probe.ps1`（已在本机实测跑通）。

**前提**：DeepTutor 已在 `http://127.0.0.1:3782` 跑起来，**并且你已经建了 1 个 Mastery Path、学完至少 1 个知识点、过 1 次 mastery gate**——否则脚本会什么都查不到。

```powershell
# 这台机器只有 Windows PowerShell 5.1（没有 pwsh 7），且默认执行策略禁止运行 .ps1，
# 所以必须带 -ExecutionPolicy Bypass
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\d0-probe.ps1
```

> 脚本已写成 **UTF-8 带 BOM**。原因是本机缺 BOM 时 PowerShell 按 GBK 读文件，中文字符串会被吃进引号导致解析失败——这个坑已经验证过并修掉了。

它会产出 `d0-report.txt`，包含：
1. 服务状态
2. OpenAPI 里所有含 `master` / `waypoint` / `knowledge-point` 的路径
3. 全部路径清单（供人工挑）
4. `/app/data` 的文件树
5. 数据目录里含 `mastery` 字样的文件路径

**把 `d0-report.txt` 全文贴回来，即可锁定方案 A / A′ / B。**

---

## 12. 剩余待确认

1. `d0-report.txt` 的结果（唯一阻塞项）
2. 每天实际能投入几小时（影响 D0–D7 是否现实，直接决定降级顺序从哪砍）
3. 样板课程选哪门（`DESIGN.md` 里假设的是计算机理工科，具体是哪门会决定考频检索的查询词）
