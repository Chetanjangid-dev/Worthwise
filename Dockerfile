# ---- Build stage ----
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -B -q dependency:go-offline
COPY src ./src
RUN mvn -B -q clean package -DskipTests

# ---- Run stage ----
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/target/worth-wise-0.0.1-SNAPSHOT.jar app.jar

# Render provides PORT env var at runtime; app reads it via server.port=${PORT:5000}
EXPOSE 5000

ENTRYPOINT ["java", "-jar", "app.jar"]