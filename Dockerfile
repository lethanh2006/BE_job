# syntax=docker/dockerfile:1

# --- Build: cần devDependencies (Nest CLI, TypeScript) để biên dịch.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# --- Runtime: chỉ dist + dependencies production, chạy bằng người dùng không đặc quyền.
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=5000 \
    STORAGE_DIR=/data/storage
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app \
    && mkdir -p /data/storage && chown app:app /data/storage
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/package.json ./
USER app
VOLUME ["/data/storage"]
EXPOSE 5000
# Readiness (có kiểm tra cơ sở dữ liệu) để orchestrator chỉ chuyển request khi instance dùng được.
HEALTHCHECK --interval=15s --timeout=4s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health/ready').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/main"]
