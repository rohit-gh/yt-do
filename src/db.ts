import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config";

export type VideoStatus = "pending" | "downloading" | "ready" | "failed";

export interface VideoRecord {
  id: string;
  title: string | null;
  file_path: string | null;
  password: string;
  youtube_url: string;
  status: VideoStatus;
  error_message: string | null;
  created_at: number;
  completed_at: number | null;
}

let db: Database | null = null;

export function getDb(): Database {
  if (db) return db;

  mkdirSync(dirname(config.dbPath), { recursive: true });
  db = new Database(config.dbPath);
  db.exec("PRAGMA journal_mode = WAL;");

  db.exec(`
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      title TEXT,
      file_path TEXT,
      password TEXT NOT NULL,
      youtube_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_videos_created_at ON videos(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
  `);

  return db;
}

export function insertVideo(record: {
  id: string;
  password: string;
  youtube_url: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO videos (id, password, youtube_url, status, created_at)
       VALUES (?, ?, ?, 'pending', ?)`,
    )
    .run(record.id, record.password, record.youtube_url, Date.now());
}

export function updateVideoDownloading(id: string): void {
  getDb()
    .prepare(`UPDATE videos SET status = 'downloading' WHERE id = ?`)
    .run(id);
}

export function updateVideoReady(
  id: string,
  data: { title: string; file_path: string },
): void {
  getDb()
    .prepare(
      `UPDATE videos
       SET title = ?, file_path = ?, status = 'ready', completed_at = ?, error_message = NULL
       WHERE id = ?`,
    )
    .run(data.title, data.file_path, Date.now(), id);
}

export function updateVideoFailed(id: string, errorMessage: string): void {
  getDb()
    .prepare(
      `UPDATE videos
       SET status = 'failed', error_message = ?, completed_at = ?
       WHERE id = ?`,
    )
    .run(errorMessage, Date.now(), id);
}

export function getVideoById(id: string): VideoRecord | null {
  const row = getDb()
    .prepare(`SELECT * FROM videos WHERE id = ?`)
    .get(id) as VideoRecord | null;
  return row ?? null;
}

export function listVideos(): VideoRecord[] {
  return getDb()
    .prepare(`SELECT * FROM videos ORDER BY created_at DESC`)
    .all() as VideoRecord[];
}

export function verifyVideoPassword(id: string, password: string): boolean {
  const row = getDb()
    .prepare(`SELECT password FROM videos WHERE id = ?`)
    .get(id) as { password: string } | null;
  if (!row) return false;
  return row.password === password;
}

/** Close the singleton so the next getDb() opens a fresh connection (tests). */
export function resetDbForTests(): void {
  if (db) {
    db.close();
    db = null;
  }
}
