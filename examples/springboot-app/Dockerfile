# Multi-stage build: install fluxguard-java to local Maven repo, then package this Spring Boot app (context: repo root).
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build
COPY packages/fluxguard-java /build/fluxguard-java
RUN cd /build/fluxguard-java && chmod +x mvnw && ./mvnw -B -q -DskipTests install
COPY examples/springboot-app /build/springboot-app
WORKDIR /build/springboot-app
RUN mvn -B -q -DskipTests package

FROM eclipse-temurin:17-jre-jammy
WORKDIR /app
COPY --from=build /build/springboot-app/target/fluxguard-springboot-example-0.0.1-SNAPSHOT.jar /app/app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
