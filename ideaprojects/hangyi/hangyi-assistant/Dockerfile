FROM eclipse-temurin:17-jdk AS build

WORKDIR /workspace
COPY mvnw pom.xml ./
COPY .mvn .mvn
COPY hangyi-gateway/pom.xml hangyi-gateway/pom.xml
COPY hangyi-core/pom.xml hangyi-core/pom.xml
COPY hangyi-schedule/pom.xml hangyi-schedule/pom.xml
COPY hangyi-common hangyi-common
COPY hangyi-assistant hangyi-assistant
RUN ./mvnw -pl hangyi-assistant -am package -DskipTests

FROM eclipse-temurin:17-jre

WORKDIR /app
RUN useradd --system --uid 10001 hangyi
COPY --from=build /workspace/hangyi-assistant/target/hangyi-assistant-0.0.1-SNAPSHOT.jar app.jar
COPY knowledge /app/knowledge
USER hangyi
EXPOSE 9004
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
