import { mock } from "bun:test";
import { join } from "node:path";

export function mockDownloadServices(testDir: string): void {
  mock.module("../../src/services/ytdlp.ts", () => ({
    downloadVideo720p: mock(async (_url: string, videoId: string) => ({
      title: "Mock video title",
      filePath: join(testDir, "videos", `${videoId}_mock.mp4`),
    })),
    getVideoTitle: mock(async () => "Mock video title"),
    ensureYtDlpAvailable: mock(async () => "yt-dlp"),
  }));

  mock.module("../../src/services/telegram.ts", () => ({
    notifyVideoReady: mock(async () => {}),
  }));
}
