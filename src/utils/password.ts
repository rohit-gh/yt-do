const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

export function generateVideoPassword(length = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => CHARSET[b % CHARSET.length]).join("");
}

export function createAccessToken(
  videoId: string,
  password: string,
  sessionSecret: string,
): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(`${videoId}:${password}:${sessionSecret}`);
  return hasher.digest("hex");
}
