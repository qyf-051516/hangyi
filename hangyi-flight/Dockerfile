FROM eclipse-temurin:21-jdk-alpine AS builder
WORKDIR /build

# ===== 依赖缓存层：pom.xml 不变时跳过 =====
COPY pom.xml ./
COPY hangyi-common/pom.xml ./hangyi-common/pom.xml
COPY hangyi-gateway/pom.xml ./hangyi-gateway/pom.xml
COPY hangyi-auth/pom.xml ./hangyi-auth/pom.xml
COPY hangyi-employee/pom.xml ./hangyi-employee/pom.xml
COPY hangyi-schedule/pom.xml ./hangyi-schedule/pom.xml
COPY hangyi-flight/pom.xml ./hangyi-flight/pom.xml
COPY hangyi-leave/pom.xml ./hangyi-leave/pom.xml
COPY hangyi-dashboard/pom.xml ./hangyi-dashboard/pom.xml
COPY hangyi-ai/pom.xml ./hangyi-ai/pom.xml
COPY mvnw ./
COPY .mvn ./.mvn
RUN --mount=type=cache,target=/root/.m2 \
    ./mvnw dependency:resolve-plugins dependency:go-offline -B -q || true

# ===== 源码编译层 =====
COPY hangyi-common/src ./hangyi-common/src
COPY hangyi-flight/src ./hangyi-flight/src
RUN --mount=type=cache,target=/root/.m2 \
    ./mvnw clean package -DskipTests -pl hangyi-common,hangyi-flight -am -B

FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S hangyi && adduser -S hangyi -G hangyi
USER hangyi
WORKDIR /app
COPY --from=builder /build/hangyi-flight/target/*.jar app.jar
EXPOSE 8084
ENTRYPOINT ["java", "-jar", "app.jar"]
