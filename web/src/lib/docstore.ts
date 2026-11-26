import { readJSON, writeJSON } from './kv'
import { makeDoc, type Doc, type Segment } from './docs'

/**
 * 读本存储：本地走 `.data/docs.json`，部署到只读文件系统的环境时自动换成 Redis（见 kv.ts）。
 * 单独一个 key，是因为读本和知识树的生命周期不同（读本可以随时删）。
 */

const KEY = 'docs'

type Db = { version: 1; docs: Doc[] }

async function readDb(): Promise<Db> {
  const db = await readJSON<Db>(KEY)
  if (!db || db.version !== 1 || !Array.isArray(db.docs)) return { version: 1, docs: [] }
  return db
}

async function writeDb(db: Db): Promise<void> {
  await writeJSON(KEY, db)
}

export async function listDocs(): Promise<Doc[]> {
  const db = await readDb()
  return db.docs.slice().sort((a, b) => b.createdAt - a.createdAt)
}

export async function getDoc(id: string): Promise<Doc | null> {
  const db = await readDb()
  return db.docs.find((d) => d.id === id) ?? null
}

export async function createDoc(title: string, text: string, now = Date.now()): Promise<Doc> {
  const db = await readDb()
  const doc = makeDoc(title, text, now)
  db.docs.unshift(doc)
  await writeDb(db)
  return doc
}

export type SegmentPatch = Partial<
  Pick<Segment, 'annotations' | 'readAt' | 'feynmanAt' | 'feynmanScore' | 'quizScore'>
>

export async function patchSegment(
  docId: string,
  segmentId: string,
  patch: SegmentPatch,
): Promise<Doc | null> {
  const db = await readDb()
  const doc = db.docs.find((d) => d.id === docId)
  if (!doc) return null
  const seg = doc.segments.find((s) => s.id === segmentId)
  if (!seg) return null
  Object.assign(seg, patch)
  await writeDb(db)
  return doc
}

export async function removeDoc(docId: string): Promise<void> {
  const db = await readDb()
  db.docs = db.docs.filter((d) => d.id !== docId)
  await writeDb(db)
}
