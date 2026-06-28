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

// ===== iOS快捷指令分发服务 =====

const SHORTCUT_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>WFWorkflowClientVersion</key>
	<string>2600</string>
	<key>WFWorkflowClientRelease</key>
	<string>3.0</string>
	<key>WFWorkflowIcon</key>
	<dict>
		<key>WFWorkflowIconStartColor</key>
		<integer>4282601727</integer>
		<key>WFWorkflowIconGlyphNumber</key>
		<integer>59799</integer>
	</dict>
	<key>WFWorkflowInputContentItemClasses</key>
	<array>
		<string>WFURLContentItem</string>
		<string>WFStringContentItem</string>
		<string>WFSafariWebPageContentItem</string>
		<string>WFArticleContentItem</string>
	</array>
	<key>WFWorkflowActions</key>
	<array>
		<dict>
			<key>WFWorkflowActionIdentifier</key>
			<string>is.workflow.actions.geturls</string>
			<key>WFWorkflowActionParameters</key>
			<dict>
				<key>WFInput</key>
				<dict>
					<key>Value</key>
					<dict>
						<key>Type</key>
						<string>ExtensionInput</string>
					</dict>
				</dict>
			</dict>
		</dict>
		<dict>
			<key>WFWorkflowActionIdentifier</key>
			<string>is.workflow.actions.ask</string>
			<key>WFWorkflowActionParameters</key>
			<dict>
				<key>UUID</key>
				<string>B80D8DE6-54A6-4FA2-8356-621B43AF013E</string>
				<key>WFAskActionPrompt</key>
				<string>请输入标签（以英文逗号分隔）</string>
				<key>WFInputType</key>
				<string>Text</string>
			</dict>
		</dict>
		<dict>
			<key>WFWorkflowActionIdentifier</key>
			<string>is.workflow.actions.downloadurl</string>
			<key>WFWorkflowActionParameters</key>
			<dict>
				<key>WFURL</key>
				<string>https://knowledge.jasonzhou.com/api/collect</string>
				<key>WFHTTPMethod</key>
				<string>POST</string>
				<key>WFHTTPBodyType</key>
				<string>JSON</string>
				<key>WFJSONValues</key>
				<array>
					<dict>
						<key>WFKey</key>
						<string>url</string>
						<key>WFValue</key>
						<dict>
							<key>Value</key>
							<dict>
								<key>Type</key>
								<string>ExtensionInput</string>
							</dict>
							<key>WFSerializationType</key>
							<string>WFTextTokenAttachmentParameterState</string>
						</dict>
					</dict>
					<dict>
						<key>WFKey</key>
						<string>source</string>
						<key>WFValue</key>
						<dict>
							<key>Value</key>
							<string>wechat</string>
							<key>WFSerializationType</key>
							<string>WFTextTokenAttachmentParameterState</string>
						</dict>
					</dict>
					<dict>
						<key>WFKey</key>
						<string>tags</string>
						<key>WFValue</key>
						<dict>
							<key>Value</key>
							<dict>
								<key>Type</key>
								<string>ActionOutput</string>
								<key>OutputName</key>
								<string>要求输入的结果</string>
								<key>OutputUUID</key>
								<string>B80D8DE6-54A6-4FA2-8356-621B43AF013E</string>
							</dict>
							<key>WFSerializationType</key>
							<string>WFTextTokenAttachmentParameterState</string>
						</dict>
					</dict>
				</array>
				<key>WFHTTPHeaders</key>
				<dict>
					<key>Value</key>
					<dict>
						<key>Content-Type</key>
						<string>application/json</string>
					</dict>
				</dict>
			</dict>
		</dict>
		<dict>
			<key>WFWorkflowActionIdentifier</key>
			<string>is.workflow.actions.shownotification</string>
			<key>WFWorkflowActionParameters</key>
			<dict>
				<key>WFNotificationActionTitle</key>
				<string>知识库收录</string>
				<key>WFNotificationActionBody</key>
				<string>✅ 文章已成功保存到思源笔记！</string>
			</dict>
		</dict>
	</array>
	<key>WFWorkflowTypes</key>
	<array>
		<string>NCWidget</string>
		<string>ActionExtension</string>
	</array>
</dict>
</plist>`;

/**
 * GET /api/shortcut/file
 * .shortcut 文件直接作为二进制数据下载（避免被 iOS 识别为描述文件）
 */
router.get('/shortcut/file', (req, res) => {
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="knowledge_collect.shortcut"');
  res.send(Buffer.from(SHORTCUT_PLIST, 'utf8'));
});

/**
 * GET /api/shortcut
 * 精美でレスポンシブなインストール誘導Webページをレンダリングする
 */
router.get('/shortcut', (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>快捷指令安装 - 个人知识库助手</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Noto+Sans+SC:wght@300;400;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-color: #0b0f19;
            --card-bg: rgba(17, 25, 40, 0.65);
            --border-color: rgba(255, 255, 255, 0.08);
            --primary-grad: linear-gradient(135deg, #818cf8 0%, #c084fc 100%);
            --glow-color: rgba(129, 140, 248, 0.15);
        }
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            background-color: var(--bg-color);
            color: #f3f4f6;
            font-family: 'Outfit', 'Noto Sans SC', sans-serif;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            overflow-x: hidden;
            position: relative;
        }
        body::before {
            content: '';
            position: absolute;
            width: 300px;
            height: 300px;
            background: var(--primary-grad);
            filter: blur(120px);
            opacity: 0.12;
            top: 10%;
            left: -5%;
            z-index: 0;
        }
        body::after {
            content: '';
            position: absolute;
            width: 400px;
            height: 400px;
            background: linear-gradient(135deg, #c084fc 0%, #6366f1 100%);
            filter: blur(150px);
            opacity: 0.1;
            bottom: 5%;
            right: -10%;
            z-index: 0;
        }
        .container {
            width: 100%;
            max-width: 480px;
            background: var(--card-bg);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid var(--border-color);
            border-radius: 24px;
            padding: 40px 30px;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.1);
            position: relative;
            z-index: 1;
        }
        .icon-container {
            width: 80px;
            height: 80px;
            background: var(--primary-grad);
            border-radius: 20px;
            margin: 0 auto 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 10px 20px var(--glow-color);
            animation: float 4s ease-in-out infinite;
        }
        @keyframes float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-8px); }
        }
        .icon-container svg {
            width: 40px;
            height: 40px;
            fill: #ffffff;
        }
        h1 {
            font-size: 24px;
            font-weight: 800;
            margin-bottom: 12px;
            background: var(--primary-grad);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        p.subtitle {
            font-size: 14px;
            color: #9ca3af;
            margin-bottom: 30px;
            line-height: 1.6;
        }
        .download-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            width: 100%;
            padding: 16px;
            background: var(--primary-grad);
            border: none;
            border-radius: 14px;
            color: #ffffff;
            font-size: 16px;
            font-weight: 600;
            text-decoration: none;
            cursor: pointer;
            box-shadow: 0 8px 16px var(--glow-color);
            transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
            margin-bottom: 24px;
        }
        .download-btn:hover {
            transform: scale(1.02);
            box-shadow: 0 12px 24px rgba(129, 140, 248, 0.3);
        }
        .download-btn:active {
            transform: scale(0.98);
        }
        .steps {
            text-align: left;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 16px;
            padding: 20px;
            border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .steps h3 {
            font-size: 14px;
            color: #e5e7eb;
            margin-bottom: 12px;
            font-weight: 600;
        }
        .step-item {
            font-size: 13px;
            color: #9ca3af;
            line-height: 1.8;
            margin-bottom: 8px;
            display: flex;
            align-items: flex-start;
            gap: 8px;
        }
        .step-item:last-child {
            margin-bottom: 0;
        }
        .step-number {
            background: rgba(255, 255, 255, 0.08);
            border-radius: 50%;
            width: 18px;
            height: 18px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            font-weight: 700;
            color: #d1d5db;
            flex-shrink: 0;
            margin-top: 2px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon-container">
            <svg viewBox="0 0 24 24">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
        </div>
        <h1>一键保存到知识库</h1>
        <p class="subtitle">微信公众号文章一键提取、自动 AI 摘要与归档到思源笔记的官方快捷指令</p>
        
        <a href="/api/shortcut/file" class="download-btn">
            <span>📥 安装快捷指令</span>
        </a>

        <div class="steps">
            <h3>使用指南</h3>
            <div class="step-item">
                <span class="step-number">1</span>
                <span>点击上方按钮下载并在 iPhone 的「文件」中打开。</span>
            </div>
            <div class="step-item">
                <span class="step-number">2</span>
                <span>在微信或 Safari 中打开任意文章，点击右上角分享。</span>
            </div>
            <div class="step-item">
                <span class="step-number">3</span>
                <span>选择「收藏到知识库」，系统即可自动 AI 归档。</span>
            </div>
        </div>
    </div>
</body>
</html>`;
  res.send(html);
});

export default router;

