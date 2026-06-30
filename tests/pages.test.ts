import { afterAll, describe, expect, test } from "bun:test";
import { createTestEnv } from "./helpers/test-env";

const env = createTestEnv("pages");
const { pages } = await import("../src/routes/pages");

afterAll(() => env.cleanup());

describe("pages", () => {
  test("GET / renders download form and header navigation", async () => {
    const response = await pages.request("/");
    expect(response.status).toBe(200);

    const html = await response.text();
    expect(html).toContain("Download a YouTube video");
    expect(html).toContain('href="/videos"');
    expect(html).toContain('href="/" class="active"');
    expect(html).toContain('id="download-form"');
  });

  test("GET /videos renders video list page", async () => {
    const response = await pages.request("/videos");
    expect(response.status).toBe(200);

    const html = await response.text();
    expect(html).toContain("Your videos");
    expect(html).toContain('href="/videos" class="active"');
    expect(html).toContain('id="video-list"');
  });

  test("GET /watch/:id returns 404 for unknown video", async () => {
    const response = await pages.request("/watch/missing-id");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Video not found");
  });

  test("GET /watch/:id renders player shell for existing video", async () => {
    const { insertVideo } = await import("../src/db");
    insertVideo({
      id: "page-watch",
      password: "pw",
      youtube_url: "https://www.youtube.com/watch?v=page",
    });

    const response = await pages.request("/watch/page-watch");
    expect(response.status).toBe(200);

    const html = await response.text();
    expect(html).toContain('id="unlock-form"');
    expect(html).toContain('id="player"');
    expect(html).toContain("page-watch");
  });
});
