import { describe, expect, test } from "bun:test";
import { isValidYoutubeUrl } from "../src/utils/youtube";

describe("youtube url validation", () => {
  test("accepts common YouTube URL shapes", () => {
    expect(isValidYoutubeUrl("https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(isValidYoutubeUrl("https://youtube.com/watch?v=abc")).toBe(true);
    expect(isValidYoutubeUrl("https://youtu.be/abc")).toBe(true);
    expect(isValidYoutubeUrl("https://m.youtube.com/watch?v=abc")).toBe(true);
    expect(isValidYoutubeUrl("https://music.youtube.com/watch?v=abc")).toBe(true);
  });

  test("rejects non-YouTube URLs", () => {
    expect(isValidYoutubeUrl("https://vimeo.com/123")).toBe(false);
    expect(isValidYoutubeUrl("https://notyoutube.com/watch?v=abc")).toBe(false);
    expect(isValidYoutubeUrl("not-a-url")).toBe(false);
    expect(isValidYoutubeUrl("")).toBe(false);
  });
});
