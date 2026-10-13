# Debian-based image: the offline sentiment model runs on ONNX Runtime, which needs glibc (not Alpine's musl)
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY public ./public
ENV NODE_ENV=production
# Hugging Face models are downloaded here on first use (mounted as a volume in docker-compose)
ENV LOCAL_MODEL_CACHE=/app/models-cache
EXPOSE 3000
CMD ["node", "dist/index.js"]
