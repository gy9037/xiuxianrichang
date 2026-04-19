FROM node:20-alpine

RUN apk add --no-cache python3 make g++ sqlite

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server/ ./server/
COPY public/ ./public/
COPY scripts/ ./scripts/

RUN mkdir -p /data /backup

# 每 6 小时备份一次 SQLite
RUN echo "0 */6 * * * /app/scripts/backup.sh >> /var/log/backup.log 2>&1" > /etc/crontabs/root

ENV DB_PATH=/data/data.db
ENV NODE_ENV=production

EXPOSE 3000

CMD crond && node server/index.js
