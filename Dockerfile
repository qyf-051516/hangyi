# ============================================
# 航翼排班 · 后端 Dockerfile (Multi-stage)
# ============================================

# === Stage 1: 构建 ===
FROM eclipse-temurin:21-jdk-alpine AS builder

WORKDIR /build

# 复制 Maven wrapper 和源码
COPY mvnw pom.xml ./
COPY .mvn .mvn
COPY src src

# 配置 Maven 镜像加速
RUN mkdir -p /root/.m2 && \
    echo '<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0" \
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" \
      xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.0.0 \
                          https://maven.apache.org/xsd/settings-1.0.0.xsd"> \
      <mirrors> \
        <mirror> \
          <id>aliyun</id> \
          <name>Aliyun Maven Mirror</name> \
          <url>https://maven.aliyun.com/repository/public</url> \
          <mirrorOf>central</mirrorOf> \
        </mirror> \
      </mirrors> \
    </settings>' > /root/.m2/settings.xml

# 构建可执行 JAR（跳过测试）
RUN chmod +x mvnw && ./mvnw clean package -DskipTests -q

# === Stage 2: 运行 ===
FROM eclipse-temurin:21-jre-alpine

RUN addgroup -S hangyi && adduser -S hangyi -G hangyi

WORKDIR /app

COPY --from=builder /build/target/*.jar app.jar

USER hangyi

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
