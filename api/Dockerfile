# api image. Build context is the repo root: npm workspaces need the root
# lockfile and both workspace manifests. Migrations run from the compose command
# (prisma migrate deploy), before `node dist/main.js` starts listening.
FROM node:24-bookworm-slim
# Prisma's engines need OpenSSL; the slim image does not ship it.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npx prisma generate --schema api/prisma/schema.prisma && npm -w api run build
WORKDIR /app/api
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/main.js"]
