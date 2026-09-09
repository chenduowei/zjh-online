# 炸金花 Online — 单机 + 联网（Next.js + Socket.IO）
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --registry https://registry.npmjs.org --no-audit --no-fund

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# standalone 输出 + 静态资源 + 自定义 server
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/server.mjs ./server.mjs
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json
# server.mjs 用 strip-types 加载 src/game/*.ts，需要完整 node_modules 中的 next/socket.io
COPY --from=deps /app/node_modules ./node_modules

EXPOSE 3000
CMD ["npx", "tsx", "server.mjs"]
