FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY protocol.mjs bunker-server.mjs ./
ENV DATA_DIR=/data
ENV PORT=1879
VOLUME ["/data"]
EXPOSE 1879
CMD ["node", "bunker-server.mjs"]
