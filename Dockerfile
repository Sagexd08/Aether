FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --ignore-scripts
COPY server ./server
RUN npx tsc -p server/tsconfig.json && npm prune --omit=dev --ignore-scripts

FROM node:20-bookworm-slim
ENV NODE_ENV=production \
    UPLOAD_DIR=/data/uploads \
    MODELS_DIR=/data/models \
    TRAINING_DIR=/data/training
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/server/dist ./server/dist
COPY --chown=node:node server/migrations ./server/migrations
RUN mkdir -p /data/uploads /data/models /data/training && chown -R node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/dist/index.js"]
