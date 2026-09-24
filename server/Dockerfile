# Plebeian Scheduler — self-hosted backend
# Node 22 ships the stable built-in `node:sqlite` module and native WebSocket,
# so this image needs ZERO npm dependencies.
FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY scheduler-server.mjs ./
COPY secret-box.mjs ./
COPY nip46-sign.mjs ./
RUN npm install --omit=dev

# Persist the SQLite database outside the container.
ENV DATA_DIR=/data
VOLUME ["/data"]

ENV PORT=8080
EXPOSE 8080

# Basic container healthcheck hitting the health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1

CMD ["node", "scheduler-server.mjs"]
