/**
 * 演示用种子数据 —— 《中国近代史纲要》。
 *
 * 为什么换成文科：这个原型是拿去做答辩/演示的，讲「晚清变局 → 三次探索 →
 * 辛亥革命 → 五四 → 建党 → 抗战 → 建国」这条线，比讲「二叉树遍历」容易让
 * 评委听懂——它本身就是一棵因果树，时间顺序和先修关系是同一件事。
 *
 * 为什么还是这个文件：界面、颜色、排程三块都不认识具体学科，只认识 Kp 这个
 * 结构。换学科 = 换这一个文件的数据，页面一行不用改。
 *
 * 这批数据的价值是：它刻意覆盖了所有状态 —— 从没学过、快忘了、逾期、
 * 刚复习完、学得浅但勤复习、考砸了。少了任何一种，界面就测不出问题。
 */

import type { KpState } from './color'

export type Kp = {
  id: string
  title: string
  parent: string | null
  depth: number
  /** 1..5，决定排程优先级；文科里当「考频」用 */
  importance: 1 | 2 | 3 | 4 | 5
  estMinutes: number
  prereqs: string[]
  state: KpState
  /** 用于详情面板的一句话说明 */
  note?: string
}

export type Attempt = {
  id: string
  at: number
  /** 0..1 */
  score: number
  kpTitle: string
  kind: 'quiz' | 'feynman'
}

export const COURSE_TITLE = '中国近代史纲要'

const DAY = 86_400_000

type Spec = {
  id: string
  title: string
  parent: string | null
  importance: 1 | 2 | 3 | 4 | 5
  est: number
  prereqs?: string[]
  /** 从未学过 */
  never?: boolean
  /** mastery / stability / 几天前学 */
  m?: number
  s?: number
  ago?: number
  note?: string
}

// 结构：2 编 → 8 章 → 20 个考点，四层以内，先修关系沿时间线走。
const SPECS: Spec[] = [
  // ── 上编：旧民主主义革命 1840–1919 ───────────────────────────────
  {
    id: 'old',
    title: '上编：旧民主主义革命（1840–1919）',
    parent: null,
    importance: 5,
    est: 40,
    m: 0.8,
    s: 30,
    ago: 15,
    note: '这一段的主线只有一句：被打败 → 学器物 → 学制度 → 学思想，三次都没成',
  },

  // 第一章 晚清变局
  { id: 'wanqing', title: '第一章 晚清变局', parent: 'old', importance: 5, est: 50, prereqs: ['old'], m: 0.85, s: 40, ago: 8 },
  {
    id: 'yapian',
    title: '鸦片战争与《南京条约》',
    parent: 'wanqing',
    importance: 5,
    est: 30,
    prereqs: ['wanqing'],
    m: 0.92,
    s: 60,
    ago: 3,
    note: '整门课的地基。条约内容、五口通商、割让香港岛，一句话都要说得出',
  },
  {
    id: 'tiaoyue',
    title: '第二次鸦片战争与条约体系',
    parent: 'wanqing',
    importance: 4,
    est: 25,
    prereqs: ['yapian'],
    m: 0.62,
    s: 12,
    ago: 14,
    note: '英法联军、火烧圆明园、《天津条约》《北京条约》，和第一次别记混',
  },
  {
    id: 'taiping',
    title: '太平天国与洋务运动的起点',
    parent: 'wanqing',
    importance: 3,
    est: 30,
    prereqs: ['yapian'],
    m: 0.48,
    s: 6,
    ago: 26,
    note: '《天朝田亩制度》《资政新篇》两份纲领的差别是常考点',
  },
  {
    id: 'jiawu',
    title: '甲午战争与《马关条约》',
    parent: 'wanqing',
    importance: 5,
    est: 30,
    prereqs: ['tiaoyue'],
    m: 0.38,
    s: 3,
    ago: 22,
    note: '学过但放太久了，颜色已经掉到红区——这是「学过 ≠ 记得」的典型',
  },

  // 第二章 器物与制度的探索
  { id: 'tansuo', title: '第二章 器物与制度的探索', parent: 'old', importance: 5, est: 45, prereqs: ['wanqing'], m: 0.6, s: 10, ago: 12 },
  {
    id: 'yangwu',
    title: '洋务运动「中体西用」',
    parent: 'tansuo',
    importance: 4,
    est: 25,
    prereqs: ['tansuo'],
    m: 0.7,
    s: 14,
    ago: 9,
    note: '「自强」「求富」，军事工业 → 民用工业，甲午一战宣告破产',
  },
  {
    id: 'weixin',
    title: '戊戌变法',
    parent: 'tansuo',
    importance: 4,
    est: 30,
    prereqs: ['yangwu', 'jiawu'],
    m: 0.52,
    s: 5,
    ago: 18,
    note: '和洋务运动做对比：一个动器物，一个动制度——这是论述题的标准切口',
  },
  {
    id: 'yituan',
    title: '义和团与《辛丑条约》',
    parent: 'tansuo',
    importance: 3,
    est: 25,
    prereqs: ['weixin'],
    never: true,
    note: '还没学。它标志「半殖民地半封建社会完全形成」，后面讲辛亥要用',
  },
  {
    id: 'xinzheng',
    title: '清末新政与预备立宪',
    parent: 'tansuo',
    importance: 2,
    est: 20,
    prereqs: ['yituan'],
    never: true,
  },

  // 第三章 辛亥革命与民国初年
  { id: 'geming', title: '第三章 辛亥革命与民国初年', parent: 'old', importance: 5, est: 45, prereqs: ['tansuo'], m: 0.75, s: 18, ago: 6 },
  {
    id: 'tongmeng',
    title: '同盟会与三民主义',
    parent: 'geming',
    importance: 5,
    est: 30,
    prereqs: ['geming'],
    m: 0.8,
    s: 22,
    ago: 11,
    note: '民族、民权、民生，各自对应什么问题要能分开说',
  },
  {
    id: 'wuchang',
    title: '武昌起义与中华民国成立',
    parent: 'geming',
    importance: 4,
    est: 25,
    prereqs: ['tongmeng'],
    m: 0.86,
    s: 26,
    ago: 1,
    note: '刚复习过，是树里最绿的那一片',
  },
  {
    id: 'beiyang',
    title: '北洋军阀与袁世凯称帝',
    parent: 'geming',
    importance: 3,
    est: 25,
    prereqs: ['wuchang'],
    m: 0.42,
    s: 4,
    ago: 15,
    note: '这段人名和年份最乱，适合出「以下哪个不属于」型题',
  },
  {
    id: 'xinhai-yiyi',
    title: '辛亥革命的意义与局限',
    parent: 'geming',
    importance: 5,
    est: 30,
    prereqs: ['wuchang', 'beiyang'],
    never: true,
    note: '论述题常客：推翻帝制 vs 没改变半殖民地半封建性质',
  },

  // 第四章 新文化运动与五四
  { id: 'xinwenhua', title: '第四章 新文化运动与五四', parent: 'old', importance: 5, est: 40, prereqs: ['geming'], m: 0.55, s: 8, ago: 16 },
  {
    id: 'wusi-xin',
    title: '新文化运动（民主与科学）',
    parent: 'xinwenhua',
    importance: 4,
    est: 25,
    prereqs: ['xinwenhua'],
    m: 0.58,
    s: 7,
    ago: 10,
    note: '和五四运动的因果关系要分清：新文化是铺垫，五四让它变成政治运动',
  },
  {
    id: 'wusi',
    title: '五四运动',
    parent: 'xinwenhua',
    importance: 5,
    est: 25,
    prereqs: ['wusi-xin'],
    m: 0.44,
    s: 5,
    ago: 19,
    note: '「新民主主义革命的开端」这个判断是必答点',
  },
  {
    id: 'makesi',
    title: '马克思主义在中国的传播',
    parent: 'xinwenhua',
    importance: 4,
    est: 20,
    prereqs: ['wusi'],
    m: 0.35,
    s: 3,
    ago: 23,
    note: '建党一章的前置。现在颜色很淡，会挡住「中共一大」',
  },

  // ── 中编：新民主主义革命 1919–1949 ───────────────────────────────
  {
    id: 'new',
    title: '中编：新民主主义革命（1919–1949）',
    parent: null,
    importance: 5,
    est: 35,
    prereqs: ['old'],
    m: 0.5,
    s: 10,
    ago: 7,
    note: '主线：谁领导、依靠谁、走什么路——每章都在回答这三问',
  },

  // 第五章 建党与国民革命
  { id: 'jiandang', title: '第五章 建党与国民革命', parent: 'new', importance: 5, est: 40, prereqs: ['new', 'makesi'], m: 0.62, s: 9, ago: 5 },
  {
    id: 'yida',
    title: '中共一大与二大',
    parent: 'jiandang',
    importance: 5,
    est: 25,
    prereqs: ['jiandang'],
    m: 0.72,
    s: 15,
    ago: 8,
  },
  {
    id: 'hezuo',
    title: '第一次国共合作与北伐',
    parent: 'jiandang',
    importance: 4,
    est: 25,
    prereqs: ['yida'],
    m: 0.5,
    s: 6,
    ago: 17,
    note: '「党内合作」这个形式和后来的抗日统一战线不是一回事',
  },
  {
    id: 'shiqi',
    title: '大革命失败与八七会议',
    parent: 'jiandang',
    importance: 4,
    est: 20,
    prereqs: ['hezuo'],
    m: 0.4,
    s: 4,
    ago: 21,
    note: '「枪杆子里面出政权」的出处，容易和遵义会议混',
  },

  // 第六章 土地革命与长征
  { id: 'tudi', title: '第六章 土地革命与长征', parent: 'new', importance: 5, est: 40, prereqs: ['jiandang'], m: 0.68, s: 12, ago: 4 },
  {
    id: 'nanchang',
    title: '南昌起义与井冈山道路',
    parent: 'tudi',
    importance: 4,
    est: 25,
    prereqs: ['tudi'],
    m: 0.78,
    s: 20,
    ago: 2,
    note: '「农村包围城市」是这条路的结论，问法经常反过来问',
  },
  {
    id: 'changzheng',
    title: '长征与遵义会议',
    parent: 'tudi',
    importance: 5,
    est: 25,
    prereqs: ['nanchang'],
    m: 0.65,
    s: 10,
    ago: 12,
  },
  {
    id: 'xian',
    title: '西安事变与抗日民族统一战线',
    parent: 'tudi',
    importance: 4,
    est: 20,
    prereqs: ['changzheng'],
    m: 0.46,
    s: 5,
    ago: 13,
    note: '「逼蒋抗日」到「联蒋抗日」的转变，是下一章的前提',
  },

  // 第七章 抗日战争
  { id: 'kangzhan', title: '第七章 抗日战争', parent: 'new', importance: 5, est: 45, prereqs: ['tudi'], m: 0.6, s: 9, ago: 10 },
  {
    id: 'jiu18',
    title: '九一八事变与局部抗战',
    parent: 'kangzhan',
    importance: 3,
    est: 20,
    prereqs: ['kangzhan'],
    m: 0.83,
    s: 24,
    ago: 25,
    note: '逾期了但底子厚，掉得不快——正好用来演示「间隔长 ≠ 忘得多」',
  },
  {
    id: 'qiqi',
    title: '七七事变与全面抗战',
    parent: 'kangzhan',
    importance: 5,
    est: 20,
    prereqs: ['jiu18'],
    m: 0.74,
    s: 16,
    ago: 6,
  },
  {
    id: 'chizhan',
    title: '持久战与正面/敌后两个战场',
    parent: 'kangzhan',
    importance: 5,
    est: 35,
    prereqs: ['qiqi'],
    m: 0.3,
    s: 2,
    ago: 27,
    note: '学过但基本忘了。两个战场的区别、各自的代表战役是高频考点',
  },
  {
    id: 'shengli',
    title: '抗战胜利的原因与意义',
    parent: 'kangzhan',
    importance: 4,
    est: 25,
    prereqs: ['chizhan'],
    never: true,
  },

  // 第八章 解放战争与建国
  { id: 'jiefang', title: '第八章 解放战争与建国', parent: 'new', importance: 4, est: 35, prereqs: ['kangzhan'], m: 0.55, s: 8, ago: 3 },
  {
    id: 'chongqing',
    title: '重庆谈判与内战爆发',
    parent: 'jiefang',
    importance: 4,
    est: 20,
    prereqs: ['jiefang'],
    m: 0.66,
    s: 11,
    ago: 5,
  },
  {
    id: 'sanzhan',
    title: '三大战役与渡江战役',
    parent: 'jiefang',
    importance: 5,
    est: 25,
    prereqs: ['chongqing'],
    m: 0.8,
    s: 18,
    ago: 0,
    note: '今天刚复习过，颜色最饱和的一个点',
  },
  {
    id: 'jianguo',
    title: '新中国成立与《共同纲领》',
    parent: 'jiefang',
    importance: 5,
    est: 20,
    prereqs: ['sanzhan'],
    m: 0.5,
    s: 6,
    ago: 7,
  },
]

export function makeCourse(now: number): Kp[] {
  return SPECS.map((sp) => {
    const state: KpState = sp.never
      ? { mastery: 0, stability: 1, lastReviewAt: null }
      : {
          mastery: sp.m ?? 0.5,
          stability: sp.s ?? 5,
          lastReviewAt: now - (sp.ago ?? 0) * DAY,
        }
    return {
      id: sp.id,
      title: sp.title,
      parent: sp.parent,
      depth: 0, // 下面重算
      importance: sp.importance,
      estMinutes: sp.est,
      prereqs: sp.prereqs ?? [],
      state,
      note: sp.note,
    }
  }).map((kp, _i, all) => ({ ...kp, depth: depthOf(kp.id, all) }))
}

function depthOf(id: string, all: Kp[]): number {
  let d = 0
  let cur = all.find((k) => k.id === id)
  while (cur && cur.parent) {
    d += 1
    const p: string = cur.parent
    cur = all.find((k) => k.id === p)
    if (d > 20) break
  }
  return d
}

/** 成绩记录：刻意做成"上下起伏但整体向上"，折线才看得出东西 */
export function makeAttempts(now: number): Attempt[] {
  const raw: Array<[number, number, string, 'quiz' | 'feynman']> = [
    [21, 0.45, '甲午战争与《马关条约》', 'quiz'],
    [18, 0.5, '戊戌变法', 'feynman'],
    [16, 0.4, '五四运动', 'quiz'],
    [13, 0.62, '同盟会与三民主义', 'quiz'],
    [11, 0.55, '北洋军阀与袁世凯称帝', 'quiz'],
    [8, 0.7, '中共一大与二大', 'feynman'],
    [6, 0.58, '长征与遵义会议', 'quiz'],
    [4, 0.66, '七七事变与全面抗战', 'quiz'],
    [2, 0.74, '重庆谈判与内战爆发', 'quiz'],
    [0, 0.82, '三大战役与渡江战役', 'quiz'],
  ]
  return raw.map(([daysAgo, score, kpTitle, kind], i) => ({
    id: `a${i}`,
    at: now - daysAgo * DAY,
    score,
    kpTitle,
    kind,
  }))
}
