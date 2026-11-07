/**
 * Local memory store backed by expo-sqlite.
 *
 * Vectors are stored as Float32 BLOBs. Similarity search runs in JS: we fetch
 * all rows (optionally filtered by companion/memory_type), compute cosine
 * similarity on the client, and return the top-K. This is fine up to ~10k
 * memories per user on a modern phone.
 */

import * as SQLite from 'expo-sqlite';

export interface MemoryRow {
  id: string;
  content: string;
  memoryType: string;
  companionId: string | null;
  importance: number;
  createdAt: number;
  updatedAt: number;
}

export interface ScoredMemory extends MemoryRow {
  score: number;
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    const db = await SQLite.openDatabaseAsync('aethra.db');
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        memory_type TEXT NOT NULL DEFAULT 'general',
        companion_id TEXT,
        importance REAL NOT NULL DEFAULT 0.5,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        embedding BLOB NOT NULL,
        embedding_dim INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(memory_type);
      CREATE INDEX IF NOT EXISTS idx_memories_companion ON memories(companion_id);
      CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);
    `);
    return db;
  })();
  return dbPromise;
}

function vectorToBlob(vec: number[]): Uint8Array {
  const buf = new ArrayBuffer(vec.length * 4);
  const view = new DataView(buf);
  for (let i = 0; i < vec.length; i++) {
    view.setFloat32(i * 4, vec[i], true);
  }
  return new Uint8Array(buf);
}

function blobToVector(blob: Uint8Array, dim: number): Float32Array {
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const out = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    out[i] = view.getFloat32(i * 4, true);
  }
  return out;
}

function cosineSim(a: Float32Array | number[], b: Float32Array | number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function randomId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface InsertMemoryInput {
  content: string;
  embedding: number[];
  memoryType?: string;
  companionId?: string | null;
  importance?: number;
}

export async function insertMemory(input: InsertMemoryInput): Promise<string> {
  const db = await getDb();
  const id = randomId();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO memories
       (id, content, memory_type, companion_id, importance, created_at, updated_at, embedding, embedding_dim)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.content,
    input.memoryType ?? 'general',
    input.companionId ?? null,
    input.importance ?? 0.5,
    now,
    now,
    vectorToBlob(input.embedding),
    input.embedding.length,
  );
  return id;
}

export async function deleteMemory(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM memories WHERE id = ?', id);
}

export async function clearAllMemories(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM memories');
}

export interface ListMemoriesOptions {
  companionId?: string | null;
  memoryType?: string;
  limit?: number;
  offset?: number;
}

export async function listMemories(
  opts: ListMemoriesOptions = {},
): Promise<MemoryRow[]> {
  const db = await getDb();
  const clauses: string[] = [];
  const args: (string | number)[] = [];
  if (opts.companionId !== undefined) {
    if (opts.companionId === null) {
      clauses.push('companion_id IS NULL');
    } else {
      clauses.push('companion_id = ?');
      args.push(opts.companionId);
    }
  }
  if (opts.memoryType) {
    clauses.push('memory_type = ?');
    args.push(opts.memoryType);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await db.getAllAsync<{
    id: string;
    content: string;
    memory_type: string;
    companion_id: string | null;
    importance: number;
    created_at: number;
    updated_at: number;
  }>(
    `SELECT id, content, memory_type, companion_id, importance, created_at, updated_at
       FROM memories
       ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    ...args,
    opts.limit ?? 100,
    opts.offset ?? 0,
  );
  return rows.map((r) => ({
    id: r.id,
    content: r.content,
    memoryType: r.memory_type,
    companionId: r.companion_id,
    importance: r.importance,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function countMemories(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM memories',
  );
  return row?.n ?? 0;
}

export interface SearchOptions {
  companionId?: string | null;
  memoryType?: string;
  limit?: number;
  minScore?: number;
}

type RawRow = {
  id: string;
  content: string;
  memory_type: string;
  companion_id: string | null;
  importance: number;
  created_at: number;
  updated_at: number;
  embedding: Uint8Array;
  embedding_dim: number;
};

export async function searchMemories(
  queryEmbedding: number[],
  options: SearchOptions = {},
): Promise<ScoredMemory[]> {
  const db = await getDb();
  const limit = options.limit ?? 5;
  const minScore = options.minScore ?? 0.35;

  const clauses: string[] = [];
  const args: (string | number)[] = [];
  if (options.companionId !== undefined) {
    if (options.companionId === null) {
      clauses.push('companion_id IS NULL');
    } else {
      clauses.push('companion_id = ?');
      args.push(options.companionId);
    }
  }
  if (options.memoryType) {
    clauses.push('memory_type = ?');
    args.push(options.memoryType);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await db.getAllAsync<RawRow>(
    `SELECT id, content, memory_type, companion_id, importance,
            created_at, updated_at, embedding, embedding_dim
       FROM memories
       ${where}`,
    ...args,
  );

  const scored: ScoredMemory[] = [];
  for (const r of rows) {
    const v = blobToVector(r.embedding, r.embedding_dim);
    const score = cosineSim(queryEmbedding, v);
    if (score < minScore) continue;
    scored.push({
      id: r.id,
      content: r.content,
      memoryType: r.memory_type,
      companionId: r.companion_id,
      importance: r.importance,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      score,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
