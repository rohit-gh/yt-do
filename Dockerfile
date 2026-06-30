FROM oven/bun:1.3-debian AS base
WORKDIR /app

# node: yt-dlp JS challenge solver (--js-runtimes node)
# ffmpeg: merge video+audio into mp4
# curl: health checks
# nano: edit cookies file from Coolify terminal
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg nano nodejs \
  && if command -v nodejs >/dev/null 2>&1 && ! command -v node >/dev/null 2>&1; then \
       ln -s "$(command -v nodejs)" /usr/bin/node; \
     fi \
  && rm -rf /var/lib/apt/lists/*

# yt-dlp needs an explicit JS runtime path in minimal containers
ENV YT_DLP_JS_RUNTIME=bun:/usr/local/bin/bun

COPY package.json bun.lock ./
RUN bun install --production

COPY src ./src

ENV NODE_ENV=production
ENV PORT=9988
ENV DATA_DIR=/app/data

EXPOSE 9988

VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:9988/ || exit 1

CMD ["bun", "run", "start"]
