FROM oven/bun:1-debian AS base
WORKDIR /app

# node: yt-dlp JS challenge solver (--js-runtimes node)
# ffmpeg: merge video+audio into mp4
# curl: optional Coolify health checks
RUN apt-get update \
  && apt-get install -y --no-install-recommends nodejs ca-certificates curl ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src

ENV NODE_ENV=production
ENV PORT=9988
ENV DATA_DIR=/app/data

EXPOSE 9988

VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:${PORT}/ || exit 1

CMD ["bun", "run", "start"]
