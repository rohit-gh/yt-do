import { afterAll, describe, expect, test } from "bun:test";
import { createAccessToken, generateVideoPassword } from "../src/utils/password";

describe("password utils", () => {
  test("generateVideoPassword returns requested length", () => {
    expect(generateVideoPassword(12)).toHaveLength(12);
    expect(generateVideoPassword(8)).toHaveLength(8);
  });

  test("generateVideoPassword uses only allowed characters", () => {
    const password = generateVideoPassword(50);
    expect(password).toMatch(/^[A-Za-z0-9]+$/);
    expect(password).not.toMatch(/[OIl01]/);
  });

  test("createAccessToken is deterministic for same inputs", () => {
    const a = createAccessToken("vid-1", "secret", "session-key");
    const b = createAccessToken("vid-1", "secret", "session-key");
    const c = createAccessToken("vid-1", "wrong", "session-key");

    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(64);
  });
});
