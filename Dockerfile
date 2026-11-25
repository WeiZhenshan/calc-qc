FROM node:22-bookworm-slim AS frontend
WORKDIR /build
COPY frontend/package*.json frontend/
RUN cd frontend && npm ci
COPY frontend/ frontend/
COPY docs/data/ docs/data/
RUN npm --prefix frontend run build

FROM maven:3.9-eclipse-temurin-17 AS backend
WORKDIR /build
COPY backend/ backend/
COPY docs/data/ docs/data/
COPY --from=frontend /build/frontend/dist/ frontend/dist/
RUN mvn -B -f backend/pom.xml package

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=backend /build/backend/target/calc-qc-1.0.0.jar app.jar
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
