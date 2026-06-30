import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTestEnv } from "./helpers/test-env";
import { mockDownloadServices } from "./helpers/mock-services";

const env = createTestEnv("api-list");
mockDownloadServices(env.dir);
const { api } = await import("../src/routes/api");

afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.resetDatabase();
});

describe("GET /videos", () => {
  test("requires master password", async () => {
    const response = await api.request("/videos?masterPassword=wrong");
    expect(response.status).toBe(401);
  });

  test("lists stored videos for admin", async () => {
    const { insertVideo, updateVideoReady } = await import("../src/db");
    insertVideo({
      id: "listed-1",
      password: "pw",
      youtube_url: "https://www.youtube.com/watch?v=one",
    });
    updateVideoReady("listed-1", {
      title: "First video",
      file_path: join(env.dir, "videos", "listed-1.mp4"),
    });

    const response = await api.request(
      `/videos?masterPassword=${encodeURIComponent(env.masterPassword)}`,
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.videos).toHaveLength(1);
    expect(body.videos[0].title).toBe("First video");
    expect(body.videos[0].watchUrl).toContain("/watch/listed-1");
    expect(body.videos[0].password).toBeUndefined();
  });
});

describe("GET /videos/:id", () => {
  test("exposes failed status and error message", async () => {
    const { insertVideo, updateVideoFailed } = await import("../src/db");
    insertVideo({
      id: "failed-vid",
      password: "pw",
      youtube_url: "https://youtu.be/fail",
    });
    updateVideoFailed("failed-vid", "yt-dlp exploded");

    const response = await api.request("/videos/failed-vid");
    const body = await response.json();
    expect(body.status).toBe("failed");
    expect(body.error_message).toBe("yt-dlp exploded");
  });
});
