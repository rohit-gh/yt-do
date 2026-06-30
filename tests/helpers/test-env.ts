import { mkdirSync, mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface TestEnv {
  dir: string;
  masterPassword: string;
  sessionSecret: string;
  cleanup(): void;
  resetDatabase(): Promise<void>;
}

export function createTestEnv(prefix: string): TestEnv {
  const dir = mkdtempSync(join(tmpdir(), `yt-do-${prefix}-`));
  const masterPassword = "test-master-pass";
  const sessionSecret = "test-session-secret-32chars!!!!";

  process.env.BASE_URL = "http://localhost:9988";
  process.env.MASTER_PASSWORD = masterPassword;
  process.env.SESSION_SECRET = sessionSecret;
  process.env.TELEGRAM_BOT_TOKEN = "000000:TEST_TOKEN";
  process.env.TELEGRAM_CHAT_ID = "1";
  process.env.DATA_DIR = dir;
  process.env.DB_PATH = join(dir, "test.db");
  process.env.VIDEOS_DIR = join(dir, "videos");
  mkdirSync(process.env.VIDEOS_DIR, { recursive: true });

  return {
    dir,
    masterPassword,
    sessionSecret,
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
    async resetDatabase() {
      const { resetDbForTests, getDb } = await import("../../src/db");
      try {
        getDb().exec("DELETE FROM videos");
      } catch {
        // database file may not exist yet
      }
      resetDbForTests();
      for (const suffix of ["", "-wal", "-shm"]) {
        try {
          unlinkSync(process.env.DB_PATH! + suffix);
        } catch {
          // fresh install
        }
      }
      getDb();
    },
  };
}
