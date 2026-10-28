# web image: builds the SPA with vite and serves web/dist with vite preview.
# Build context is the repo root (npm workspaces), as for api/Dockerfile.
FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm -w web run build
WORKDIR /app/web
EXPOSE 5173
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]
