import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTestEnv } from "./helpers/test-env";
import { createAccessToken } from "../src/utils/password";

const env = createTestEnv("api-verify");
const { api } = await import("../src/routes/api");

afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.resetDatabase();
});

async function seedReadyVideo(id: string, password: string) {
  const { insertVideo, updateVideoReady } = await import("../src/db");
  const filePath = join(env.dir, "videos", `${id}.mp4`);
  writeFileSync(filePath, "test-video-bytes");

  insertVideo({
    id,
    password,
    youtube_url: "https://www.youtube.com/watch?v=verify",
  });
  updateVideoReady(id, {
    title: "Verify me",
    file_path: filePath,
  });
}

describe("POST /videos/:id/verify", () => {
  test("rejects verify when video is not ready", async () => {
    const { insertVideo } = await import("../src/db");
    insertVideo({
      id: "pending-vid",
      password: "pw",
      youtube_url: "https://youtu.be/x",
    });

    const response = await api.request("/videos/pending-vid/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "pw" }),
    });

    expect(response.status).toBe(409);
    expect((await response.json()).status).toBe("pending");
  });

  test("rejects wrong password", async () => {
    await seedReadyVideo("ready-vid", "correct-pass");

    const response = await api.request("/videos/ready-vid/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "wrong-pass" }),
    });

    expect(response.status).toBe(401);
  });

  test("returns stream URL and sets access cookie on success", async () => {
    await seedReadyVideo("unlock-vid", "video-pass");

    const response = await api.request("/videos/unlock-vid/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "video-pass" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.streamUrl).toBe("/api/videos/unlock-vid/stream");

    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain("va_unlock-vid=");
    expect(cookie).toContain("HttpOnly");
  });
});

describe("GET /videos/:id/stream auth", () => {
  test("requires unlock cookie before streaming", async () => {
    await seedReadyVideo("stream-vid", "video-pass");

    const blocked = await api.request("/videos/stream-vid/stream");
    expect(blocked.status).toBe(401);

    const token = createAccessToken("stream-vid", "video-pass", env.sessionSecret);
    const allowed = await api.request("/videos/stream-vid/stream", {
      headers: { Cookie: `va_stream-vid=${token}` },
    });
    expect(allowed.status).toBe(200);
    expect(await allowed.text()).toBe("test-video-bytes");
  });
});
