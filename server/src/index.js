/**
 * Knowledge Collector サーバーエントリーポイント
 * Express HTTPサーバーの初期化と起動を行う
 */

import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import collectRouter from './routes/collect.js';

const app = express();

// ===== ミドルウェア設定 =====

// CORSを有効化（Chrome拡張機能からのクロスオリジンリクエストに対応）
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// JSONリクエストボディのパース（最大5MBまで許可）
app.use(express.json({ limit: '5mb' }));

// リクエストログミドルウェア
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ===== 認証ミドルウェア =====
/**
 * APIリクエストの認証チェック
 * Authorization: Bearer <token> 形式をチェック
 * 開発環境またはトークン未設定の場合はスキップ
 */
function authMiddleware(req, res, next) {
  // ヘルスチェックは認証不要
  if (req.path === '/api/health' || req.path === '/api/status') {
    return next();
  }

  // トークンが設定されていない場合は認証をスキップ
  if (!config.auth.token) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: '需要认证。请在请求头中添加 Authorization: Bearer <token>',
    });
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (token !== config.auth.token) {
    return res.status(403).json({
      success: false,
      error: '认证失败。API Token 无效。',
    });
  }

  next();
}

app.use(authMiddleware);

// ===== ルート設定 =====

// API ルーター
app.use('/api', collectRouter);

// ルートエンドポイント - ウェルカムページ
app.get('/', (req, res) => {
  res.json({
    name: '📚 Knowledge Collector',
    description: '个人知识库收集服务 - 微信公众号文章 & 网页文章自动整理',
    version: '1.0.0',
    endpoints: {
      'POST /api/collect': '提交文章到知识库',
      'GET /api/health': '健康检查',
      'GET /api/status': '服务状态',
    },
    documentation: 'https://github.com/rocky/weixin',
  });
});

// 404ハンドラー
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `路由 ${req.method} ${req.path} 不存在`,
  });
});

// グローバルエラーハンドラー
app.use((err, req, res, _next) => {
  console.error(`[Error] ${err.stack}`);
  res.status(500).json({
    success: false,
    error: '服务器内部错误',
    detail: config.nodeEnv === 'development' ? err.message : undefined,
  });
});

// ===== サーバー起動 =====
app.listen(config.port, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     📚 Knowledge Collector Server        ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  ポート:        ${config.port}                       ║`);
  console.log(`║  環境:          ${config.nodeEnv.padEnd(23)}║`);
  console.log(`║  Gemini API:    ${config.gemini.apiKey ? '✅ 設定済み' : '❌ 未設定'}              ║`);
  console.log(`║  思源ノート:    ${config.siyuan.apiToken ? '✅ 設定済み' : '❌ 未設定'}              ║`);
  console.log(`║  認証トークン:  ${config.auth.token ? '✅ 有効' : '⚠️  無効（認証なし）'}          ║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
  console.log(`🌐 http://localhost:${config.port}`);
  console.log('');
});
