FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
COPY backend/prisma ./prisma
RUN npm ci
COPY backend/src ./src
COPY backend/scripts ./scripts
COPY frontend/public /app/frontend/public
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
