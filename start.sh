#!/bin/bash
# ============================================
# 航翼排班 · 一键启动脚本
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=============================================="
echo "  航翼排班系统 · 启动中..."
echo "=============================================="

# 1. 检查 Docker 是否运行
echo ""
echo "[1/4] 检查 Docker 运行状态..."

if ! docker info >/dev/null 2>&1; then
  echo "  Docker 未运行，正在启动..."
  open -a Docker
  echo "  等待 Docker Desktop 启动..."
  for i in $(seq 1 60); do
    if docker info >/dev/null 2>&1; then
      echo "  Docker 已就绪"
      break
    fi
    sleep 2
  done
  if ! docker info >/dev/null 2>&1; then
    echo "  ❌ Docker 启动失败，请手动打开 Docker Desktop"
    exit 1
  fi
else
  echo "  ✅ Docker 运行中"
fi

# 2. 检查 Docker Hub 连通性，不通则走镜像
echo ""
echo "[2/4] 检查 Docker Hub 连通性..."

MIRROR="docker.m.daocloud.io"
if curl -s --connect-timeout 5 https://registry-1.docker.io/v2/ >/dev/null 2>&1; then
  echo "  ✅ Docker Hub 可直连"
else
  echo "  ⚠️  Docker Hub 不可达，使用 DaoCloud 镜像"
  echo "  检查必要镜像..."

  images=(
    "mysql:8.0"
    "redis:7-alpine"
    "nacos/nacos-server:v2.4.3"
    "ollama/ollama:0.5.4"
    "node:20-alpine"
    "nginx:1.27-alpine"
    "eclipse-temurin:21-jdk-alpine"
    "eclipse-temurin:21-jre-alpine"
  )

  for img in "${images[@]}"; do
    if docker image inspect "$img" >/dev/null 2>&1; then
      echo "  ✅ $img 已存在"
    else
      echo "  ⏳ 拉取 $img (通过镜像)..."
      mirror_img="$MIRROR/$img"
      docker pull "$mirror_img" 2>&1 | tail -1
      docker tag "$mirror_img" "$img"
    fi
  done
fi

# 3. 启动服务
echo ""
echo "[3/4] 构建并启动所有服务..."
docker compose up -d --build 2>&1 | tail -5

# 4. 检查状态
echo ""
echo "[4/4] 等待服务就绪..."
sleep 10

echo ""
echo "=============================================="
echo "  服务状态"
echo "=============================================="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# 5. 检查并修复已有数据卷中的管理员密码 (BCrypt兼容性)
echo ""
echo "[5/5] 检查管理员密码..."
if docker exec hangyi-mysql mysql -uroot -phangyi123 hangyi_scheduling -e \
  "SELECT id FROM sys_user WHERE username='admin' AND password NOT LIKE '\$2%' LIMIT 1" 2>/dev/null | grep -q '[0-9]'; then
  echo "  ⚠️  检测到旧版MD5密码，正在升级为BCrypt..."
  docker exec hangyi-mysql mysql -uroot -phangyi123 hangyi_scheduling -e \
    "UPDATE sys_user SET password='\$2a\$10\$n9kgTE8.LRKToOD4LBPZP.3cNI5mSnmrTb4M3gVUHIG5IA7k36a5m' WHERE username='admin'"
  echo "  ✅ 管理员密码已升级"
else
  echo "  ✅ 管理员密码正常 (BCrypt)"
fi

echo ""
echo "=============================================="
echo "  ✅ 启动完成！"
echo "  前端:    http://localhost:8089"
echo "  API:     http://localhost:8080/api"
echo "  Nacos:   http://localhost:8848/nacos"
echo "  MySQL:   localhost:3307 (root/hangyi123)"
echo "  Redis:   localhost:6380"
echo "=============================================="
