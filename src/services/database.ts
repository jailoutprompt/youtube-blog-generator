import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'blogbot.db');

// data 디렉토리 생성
import fs from 'fs';
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// WAL 모드 (성능 향상)
db.pragma('journal_mode = WAL');

// 테이블 생성
db.exec(`
  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    youtube_url TEXT NOT NULL,
    video_id TEXT,
    title TEXT NOT NULL,
    subtitle TEXT DEFAULT '',
    outline TEXT DEFAULT '[]',
    content TEXT NOT NULL,
    tags TEXT DEFAULT '[]',
    summary TEXT DEFAULT '',
    tone TEXT DEFAULT 'informative',
    model TEXT DEFAULT 'gpt-4o-mini',
    source TEXT DEFAULT 'subtitle',
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  )
`);

export interface HistoryRecord {
  id: number;
  youtube_url: string;
  video_id: string | null;
  title: string;
  subtitle: string;
  outline: string[];
  content: string;
  tags: string[];
  summary: string;
  tone: string;
  model: string;
  source: string;
  created_at: string;
}

interface RawHistoryRow {
  id: number;
  youtube_url: string;
  video_id: string | null;
  title: string;
  subtitle: string;
  outline: string;
  content: string;
  tags: string;
  summary: string;
  tone: string;
  model: string;
  source: string;
  created_at: string;
}

export function saveToHistory(data: {
  youtubeUrl: string;
  videoId: string | null;
  title: string;
  subtitle: string;
  outline: string[];
  content: string;
  tags: string[];
  summary: string;
  tone: string;
  model: string;
  source: string;
}): number {
  const stmt = db.prepare(`
    INSERT INTO history (youtube_url, video_id, title, subtitle, outline, content, tags, summary, tone, model, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    data.youtubeUrl,
    data.videoId,
    data.title,
    data.subtitle,
    JSON.stringify(data.outline),
    data.content,
    JSON.stringify(data.tags),
    data.summary,
    data.tone,
    data.model,
    data.source
  );

  return result.lastInsertRowid as number;
}

export function getHistory(limit = 50, offset = 0): HistoryRecord[] {
  const stmt = db.prepare(`
    SELECT * FROM history ORDER BY created_at DESC LIMIT ? OFFSET ?
  `);

  const rows = stmt.all(limit, offset) as RawHistoryRow[];

  return rows.map((row) => ({
    ...row,
    outline: JSON.parse(row.outline),
    tags: JSON.parse(row.tags),
  }));
}

export function getHistoryById(id: number): HistoryRecord | null {
  const stmt = db.prepare(`SELECT * FROM history WHERE id = ?`);
  const row = stmt.get(id) as RawHistoryRow | undefined;

  if (!row) return null;

  return {
    ...row,
    outline: JSON.parse(row.outline),
    tags: JSON.parse(row.tags),
  };
}

export function deleteHistoryById(id: number): boolean {
  const stmt = db.prepare(`DELETE FROM history WHERE id = ?`);
  const result = stmt.run(id);
  return result.changes > 0;
}

export function getHistoryCount(): number {
  const row = db.prepare(`SELECT COUNT(*) as count FROM history`).get() as { count: number };
  return row.count;
}
