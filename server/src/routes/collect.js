/**
 * 記事収集APIルーター
 * iOS Shortcuts・Chrome拡張機能からの記事提出を処理する
 */

import { Router } from 'express';
import { extractArticle } from '../services/extractor.js';
import { analyzeArticle } from '../services/hermes.js';
import { createArticleDoc, checkConnection } from '../services/siyuan.js';
import { config } from '../config.js';

const router = Router();

/**
 * POST /api/collect
 * 記事を収集・処理・保存するメインエンドポイント
 *
 * リクエストボディ:
 * {
 *   url: string (必須) - 記事URL
 *   title?: string - タイトル（省略時は自動抽出）
 *   content?: string - 選択テキスト/コンテンツ（省略時は自動抽出）
 *   source?: 'wechat' | 'chrome' - ソースタイプ
 *   tags?: string[] - 手動タグ
 * }
 */
router.post('/collect', async (req, res) => {
  const startTime = Date.now();

  try {
    const { url, title, content, source = 'chrome', tags = [] } = req.body;

    // URLの必須検証
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL是必填项',
      });
    }

    // URL形式の簡易検証
    try {
      new URL(url);
    } catch {
      return res.status(400).json({
        success: false,
        error: '无效的URL格式',
      });
    }

    console.log(`[Collect] 新しい記事を受信: ${url} (ソース: ${source})`);

    // ステップ1: 記事コンテンツを抽出
    console.log('[Collect] ステップ1: 記事コンテンツの抽出中...');
    const extractResult = await extractArticle(url, {
      source,
      fallbackContent: content || '',
    });

    if (!extractResult.success) {
      return res.status(422).json({
        success: false,
        error: extractResult.error,
        step: 'extraction',
      });
    }

    const articleData = extractResult.data;
    // クライアントからのタイトル指定があれば優先
    if (title) {
      articleData.title = title;
    }

    // ステップ2: Hermesエージェントで分析
    console.log('[Collect] ステップ2: Hermes AI分析中...');
    const analysisResult = await analyzeArticle({
      title: articleData.title,
      content: articleData.content,
      author: articleData.author,
      url: url,
    });

    const analysis = analysisResult.data;

    // 手動タグを分析結果に統合
    if (tags.length > 0) {
      analysis.keywords = [...new Set([...tags, ...analysis.keywords])];
    }

    // ステップ3: 思源ノートに保存
    console.log('[Collect] ステップ3: 思源ノートに保存中...');
    const saveResult = await createArticleDoc({
      title: articleData.title,
      content: articleData.content,
      summary: analysis.summary,
      categories: analysis.categories,
      keywords: analysis.keywords,
      rating: analysis.rating,
      author: articleData.author,
      url: url,
      source: source,
      notebookPath: analysis.notebook_path,
      oneLine: analysis.one_line_summary,
    });

    const elapsed = Date.now() - startTime;

    // 成功レスポンス
    const response = {
      success: true,
      message: '文章已成功收录到知识库',
      data: {
        article: {
          title: articleData.title,
          author: articleData.author,
          url: url,
          source: source,
          contentLength: articleData.length,
        },
        analysis: {
          categories: analysis.categories,
          summary: analysis.summary,
          keywords: analysis.keywords,
          rating: analysis.rating,
          oneLine: analysis.one_line_summary,
        },
        storage: saveResult.success
          ? {
              saved: true,
              path: saveResult.data?.path,
              notebook: saveResult.data?.notebook,
            }
          : {
              saved: false,
              error: saveResult.error,
            },
        processingTime: `${elapsed}ms`,
      },
    };

    // 警告情報があれば追加
    if (extractResult.data?.warning) {
      response.warnings = response.warnings || [];
      response.warnings.push(extractResult.data.warning);
    }
    if (analysisResult.warning) {
      response.warnings = response.warnings || [];
      response.warnings.push(analysisResult.warning);
    }

    console.log(
      `[Collect] 完了: "${articleData.title}" (${elapsed}ms)`
    );
    res.json(response);
  } catch (error) {
    console.error(`[Collect] 予期しないエラー: ${error.message}`);
    console.error(error.stack);

    res.status(500).json({
      success: false,
      error: '服务器内部错误',
      detail:
        config.nodeEnv === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/health
 * ヘルスチェックエンドポイント - サービスの状態を確認
 */
router.get('/health', async (req, res) => {
  const siyuanStatus = await checkConnection();

  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    services: {
      server: true,
      geminiApi: !!config.gemini.apiKey,
      siyuan: siyuanStatus,
    },
  });
});

/**
 * GET /api/status
 * 詳細ステータスエンドポイント
 */
router.get('/status', async (req, res) => {
  res.json({
    name: 'Knowledge Collector',
    version: '1.0.0',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    config: {
      port: config.port,
      environment: config.nodeEnv,
      geminiModel: config.gemini.model,
      siyuanUrl: config.siyuan.apiUrl,
    },
  });
});

export default router;
