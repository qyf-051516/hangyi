FROM eclipse-temurin:21-jdk-alpine AS builder
WORKDIR /build
COPY . .
RUN --mount=type=cache,target=/root/.m2 \
    ./mvnw clean package -DskipTests -pl hangyi-common,hangyi-schedule -am

FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S hangyi && adduser -S hangyi -G hangyi
USER hangyi
WORKDIR /app
COPY --from=builder /build/hangyi-schedule/target/*.jar app.jar
EXPOSE 8083
ENTRYPOINT ["java", "-jar", "app.jar"]
