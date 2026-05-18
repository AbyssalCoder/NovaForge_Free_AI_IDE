FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

FROM node:22-alpine
WORKDIR /app

# Install language runtimes for code execution
RUN apk add --no-cache \
  python3 \
  py3-pip \
  gcc \
  g++ \
  musl-dev \
  openjdk17-jdk \
  rust \
  cargo \
  bash

# Create a restricted user for running user code
RUN adduser -D -s /bin/sh sandbox

COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
COPY data ./data

# Ensure workspaces directory exists
RUN mkdir -p /app/workspaces && chown node:node /app/workspaces

EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:8787/health || exit 1
CMD ["node", "dist/index.js"]
