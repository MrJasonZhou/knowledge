# ビルドステージ - 依存関係のインストール
FROM node:20-alpine AS builder

WORKDIR /app

# パッケージ定義ファイルのみコピー（キャッシュ最適化）
COPY package.json package-lock.json* ./
RUN npm ci --production

# 実行ステージ
FROM node:20-alpine

WORKDIR /app

# セキュリティ: 非rootユーザーで実行
RUN addgroup -g 1001 -S nodejs \
    && adduser -S collector -u 1001 -G nodejs

# 依存関係をコピー
COPY --from=builder /app/node_modules ./node_modules

# アプリケーションコードをコピー
COPY package.json ./
COPY src/ ./src/

# データディレクトリの作成
RUN mkdir -p /app/data /app/logs && chown -R collector:nodejs /app

USER collector

# ヘルスチェック設定
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "src/index.js"]
