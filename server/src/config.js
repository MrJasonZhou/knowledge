/**
 * アプリケーション設定モジュール
 * 環境変数から設定を読み込み、デフォルト値を提供する
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

export const config = {
  // サーバー設定
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Gemini API設定（Hermesエージェント用）
  // 注意: Gemini Pro「サブスクリプション」とGemini「API」は別の課金体系
  // API無料枠はRPD 1000-1500回/日で、個人ナレッジベースには十分
  // デフォルトはFlash（無料枠が最も多く、分類・要約タスクに十分な品質）
  // 高品質が必要な場合は GEMINI_MODEL=gemini-2.5-pro に変更可能
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  },

  // 思源ノート設定
  siyuan: {
    apiUrl: process.env.SIYUAN_API_URL || 'http://localhost:6806',
    apiToken: process.env.SIYUAN_API_TOKEN || '',
    notebookId: process.env.SIYUAN_NOTEBOOK_ID || '',
  },

  // API認証設定
  auth: {
    token: process.env.API_AUTH_TOKEN || '',
  },

  // 記事抽出設定
  extractor: {
    // リクエストタイムアウト（ミリ秒）
    timeout: 15000,
    // WeChat記事用のUser-Agent
    wechatUserAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.43(0x18002b2d) NetType/WIFI Language/zh_CN',
    // 通常のブラウザUser-Agent
    defaultUserAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  },

  // Hermesエージェント設定
  hermes: {
    // 記事の分類カテゴリ
    categories: [
      '技術/プログラミング',
      'AI/機械学習',
      'プロダクト/デザイン',
      'ビジネス/起業',
      '科学/研究',
      '人文/社会科学',
      '生活/効率化',
      '健康/医療',
      '投資/金融',
      'その他',
    ],
  },
};
