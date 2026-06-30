import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { createTestEnv } from "./helpers/test-env";

const env = createTestEnv("db");
const {
  getVideoById,
  insertVideo,
  listVideos,
  updateVideoDownloading,
  updateVideoReady,
  updateVideoFailed,
  verifyVideoPassword,
} = await import("../src/db");

afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.resetDatabase();
});

describe("database", () => {
  test("insertVideo creates a pending record", () => {
    insertVideo({
      id: "vid-1",
      password: "pw-1",
      youtube_url: "https://www.youtube.com/watch?v=abc",
    });

    const video = getVideoById("vid-1");
    expect(video?.status).toBe("pending");
    expect(video?.password).toBe("pw-1");
    expect(video?.title).toBeNull();
  });

  test("updateVideoDownloading marks record as downloading", () => {
    insertVideo({ id: "vid-2", password: "pw", youtube_url: "https://youtu.be/x" });
    updateVideoDownloading("vid-2");
    expect(getVideoById("vid-2")?.status).toBe("downloading");
  });

  test("updateVideoReady stores title and file path", () => {
    insertVideo({ id: "vid-3", password: "pw", youtube_url: "https://youtu.be/x" });
    updateVideoReady("vid-3", { title: "Hello", file_path: "/tmp/hello.mp4" });

    const video = getVideoById("vid-3");
    expect(video?.status).toBe("ready");
    expect(video?.title).toBe("Hello");
    expect(video?.file_path).toBe("/tmp/hello.mp4");
    expect(video?.completed_at).not.toBeNull();
  });

  test("updateVideoFailed stores error message", () => {
    insertVideo({ id: "vid-4", password: "pw", youtube_url: "https://youtu.be/x" });
    updateVideoFailed("vid-4", "network error");

    const video = getVideoById("vid-4");
    expect(video?.status).toBe("failed");
    expect(video?.error_message).toBe("network error");
  });

  test("listVideos returns newest first", () => {
    insertVideo({ id: "old", password: "pw", youtube_url: "https://youtu.be/old" });
    insertVideo({ id: "new", password: "pw", youtube_url: "https://youtu.be/new" });

    const ids = listVideos().map((video) => video.id);
    expect(ids[0]).toBe("new");
    expect(ids).toContain("old");
  });

  test("verifyVideoPassword checks stored password", () => {
    insertVideo({ id: "vid-5", password: "correct", youtube_url: "https://youtu.be/x" });
    expect(verifyVideoPassword("vid-5", "correct")).toBe(true);
    expect(verifyVideoPassword("vid-5", "wrong")).toBe(false);
    expect(verifyVideoPassword("missing", "correct")).toBe(false);
  });
});
