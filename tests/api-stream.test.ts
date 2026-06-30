import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTestEnv } from "./helpers/test-env";
import { createAccessToken } from "../src/utils/password";

const env = createTestEnv("api-stream");
const { api } = await import("../src/routes/api");

afterAll(() => env.cleanup());

const videoId = "stream-range";
const password = "stream-pass";
const filePath = join(env.dir, "videos", `${videoId}.mp4`);
const fileContents = "0123456789abcdef";

beforeEach(async () => {
  await env.resetDatabase();
  writeFileSync(filePath, fileContents);

  const { insertVideo, updateVideoReady } = await import("../src/db");
  insertVideo({
    id: videoId,
    password,
    youtube_url: "https://www.youtube.com/watch?v=range",
  });
  updateVideoReady(videoId, { title: "Range test", file_path: filePath });
});

function streamRequest(range?: string) {
  const token = createAccessToken(videoId, password, env.sessionSecret);
  const headers: Record<string, string> = { Cookie: `va_${videoId}=${token}` };
  if (range) headers.Range = range;
  return api.request(`/videos/${videoId}/stream`, { headers });
}

describe("GET /videos/:id/stream", () => {
  test("serves full file with length header", async () => {
    const response = await streamRequest();
    expect(response.status).toBe(200);
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(response.headers.get("Content-Length")).toBe(String(fileContents.length));
    expect(await response.text()).toBe(fileContents);
  });

  test("serves byte range for seeking", async () => {
    const response = await streamRequest("bytes=3-7");
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe(`bytes 3-7/${fileContents.length}`);
    expect(await response.text()).toBe("34567");
  });

  test("returns 416 for invalid range", async () => {
    const response = await streamRequest("bytes=999-1000");
    expect(response.status).toBe(416);
  });

  test("returns 404 when file is missing on disk", async () => {
    const { unlinkSync } = await import("node:fs");
    unlinkSync(filePath);

    const response = await streamRequest();
    expect(response.status).toBe(404);
  });
});
