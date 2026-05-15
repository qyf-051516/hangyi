# ============================================
# 航翼排班 · 前端 Dockerfile (Multi-stage)
# ============================================

# === Stage 1: 构建 ===
FROM node:20-alpine AS builder

WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# === Stage 2: Nginx 运行 ===
FROM nginx:1.27-alpine

# 复制构建产物
COPY --from=builder /build/dist /usr/share/nginx/html

# 复制 Nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
