/**
 * Hermesエージェント - AI記事整理サービス
 * Gemini APIを使用して記事の分類、要約、キーワード抽出を行う
 */

import { config } from '../config.js';

/**
 * Hermesエージェントのシステムプロンプト
 * 記事整理のルールと出力フォーマットを定義
 */
const HERMES_SYSTEM_PROMPT = `你是 Hermes，一个专业的知识整理助手。你的任务是分析收到的文章，并进行结构化整理。

请严格按照以下规则处理：

1. **分类**：从以下预定义分类中选择 1-3 个最匹配的分类：
   - 技术/编程
   - AI/机器学习
   - 产品/设计
   - 商业/创业
   - 科学/研究
   - 人文/社科
   - 生活/效率
   - 健康/医疗
   - 投资/金融
   - 其他

2. **摘要**：生成 150-250 字的中文摘要，提炼文章核心观点。

3. **关键词**：提取 5-8 个关键词，优先使用中文。

4. **质量评分**：根据内容的深度、原创性和实用性，给出 1-5 的评分：
   - 1: 低质量/广告/水文
   - 2: 一般
   - 3: 有价值
   - 4: 高质量
   - 5: 精品/必读

5. **建议笔记本**：根据分类建议存放的笔记本路径（使用 "/" 分隔）。

你必须以严格的 JSON 格式回复，不要包含任何 markdown 代码块标记或其他内容。

回复格式：
{
  "categories": ["分类1", "分类2"],
  "summary": "文章摘要...",
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "rating": 4,
  "notebook_path": "技术-编程/2026-06",
  "one_line_summary": "一句话概括文章主旨"
}`;

/**
 * Hermesエージェントで記事を分析・整理する
 * @param {object} article - 記事データ
 * @param {string} article.title - 記事タイトル
 * @param {string} article.content - 記事本文
 * @param {string} article.author - 著者
 * @param {string} article.url - 記事URL
 * @returns {Promise<object>} AI整理結果
 */
export async function analyzeArticle(article) {
  const { title, content, author, url } = article;

  // コンテンツを適切な長さに切り詰め（トークン制限を考慮）
  const truncatedContent = truncateContent(content, 8000);

  const userPrompt = `请分析并整理以下文章：

标题：${title}
作者：${author || '未知'}
来源：${url}

正文内容：
${truncatedContent}`;

  try {
    const result = await callGeminiApi(userPrompt);
    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error(`[Hermes] AI分析エラー: ${error.message}`);

    // APIエラー時はフォールバック結果を返す
    return {
      success: true,
      data: generateFallbackAnalysis(title, content),
      warning: `AI分析がフォールバックモードで実行されました: ${error.message}`,
    };
  }
}

/**
 * Gemini APIを呼び出す
 * @param {string} userPrompt - ユーザープロンプト
 * @returns {Promise<object>} API応答のパース結果
 */
async function callGeminiApi(userPrompt) {
  const apiKey = config.gemini.apiKey;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEYが設定されていません');
  }

  const url = `${config.gemini.baseUrl}/models/${config.gemini.model}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ],
    systemInstruction: {
      parts: [{ text: HERMES_SYSTEM_PROMPT }],
    },
    generationConfig: {
      temperature: 0.3,
      topP: 0.8,
      // 出力トークン数を十分に確保（Thinkingモデルは思考にトークンを消費するため）
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      // 思考トークンを無効化して出力に全トークンを割り当て
      thinkingConfig: {
        thinkingBudget: 0,
      },
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Gemini APIエラー (${response.status}): ${errorText.substring(0, 200)}`
    );
  }

  const data = await response.json();

  // レスポンスからテキストを抽出
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini APIから空のレスポンスを受信');
  }

  // JSONをパース
  return parseJsonResponse(text);
}

/**
 * AI応答のJSONをパース（エラーハンドリング付き）
 * LLMが出力するJSON特有の問題（コメント、末尾カンマ等）にも対応
 * @param {string} text - APIからの応答テキスト
 * @returns {object} パースされたJSON
 */
function parseJsonResponse(text) {
  // デバッグ用に元テキストを記録
  console.log(`[Hermes] AI応答 (先頭200文字): ${text.substring(0, 200)}`);

  try {
    // ステップ1: Markdownコードブロックの除去
    let cleaned = text
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();

    // ステップ2: JavaScript風コメントの除去（// と /* */）
    cleaned = cleaned
      .replace(/\/\/.*$/gm, '')          // 行コメント
      .replace(/\/\*[\s\S]*?\*\//g, ''); // ブロックコメント

    // ステップ3: 末尾カンマの除去（配列・オブジェクト内）
    cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');

    // ステップ4: パース試行
    const parsed = JSON.parse(cleaned);

    // 必須フィールドの検証
    return {
      categories: Array.isArray(parsed.categories)
        ? parsed.categories
        : ['その他'],
      summary: parsed.summary || '摘要生成に失敗しました',
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      rating: typeof parsed.rating === 'number' ? parsed.rating : 3,
      notebook_path: parsed.notebook_path || '待分类',
      one_line_summary: parsed.one_line_summary || '',
    };
  } catch (parseError) {
    console.error(`[Hermes] JSONパースエラー: ${parseError.message}`);
    console.error(`[Hermes] 元テキスト: ${text.substring(0, 500)}`);
    throw new Error(`AI応答のJSONパースに失敗: ${parseError.message}`);
  }
}

/**
 * コンテンツを指定文字数に切り詰める（文の途中で切らない）
 * @param {string} content - 元コンテンツ
 * @param {number} maxLength - 最大文字数
 * @returns {string} 切り詰められたコンテンツ
 */
function truncateContent(content, maxLength) {
  if (!content || content.length <= maxLength) {
    return content || '';
  }

  // 最大長の位置で最後の句点を検索
  const truncated = content.substring(0, maxLength);
  const lastPeriod = Math.max(
    truncated.lastIndexOf('。'),
    truncated.lastIndexOf('．'),
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('\n')
  );

  if (lastPeriod > maxLength * 0.7) {
    return truncated.substring(0, lastPeriod + 1) + '\n\n[内容已截断...]';
  }

  return truncated + '\n\n[内容已截断...]';
}

/**
 * APIエラー時のフォールバック分析結果を生成
 * キーワードベースの簡易分類を行う
 * @param {string} title - 記事タイトル
 * @param {string} content - 記事本文
 * @returns {object} フォールバック分析結果
 */
function generateFallbackAnalysis(title, content) {
  const text = `${title} ${content}`.toLowerCase();

  // キーワードベースの簡易分類ルール
  const categoryRules = [
    {
      keywords: [
        'code',
        'programming',
        'javascript',
        'python',
        'react',
        'vue',
        'node',
        '编程',
        '开发',
        '代码',
        '框架',
        'api',
        'git',
        'docker',
        'kubernetes',
      ],
      category: '技術/プログラミング',
    },
    {
      keywords: [
        'ai',
        'gpt',
        'llm',
        'machine learning',
        'deep learning',
        '人工智能',
        '大模型',
        '机器学习',
        '深度学习',
        'gemini',
        'claude',
        'transformer',
      ],
      category: 'AI/機械学習',
    },
    {
      keywords: [
        'design',
        'ux',
        'ui',
        'product',
        '产品',
        '设计',
        '交互',
        '用户体验',
      ],
      category: 'プロダクト/デザイン',
    },
    {
      keywords: [
        'startup',
        'business',
        '创业',
        '商业',
        '融资',
        '增长',
        '营销',
      ],
      category: 'ビジネス/起業',
    },
    {
      keywords: ['invest', '投资', '理财', '基金', '股票', '金融'],
      category: '投資/金融',
    },
  ];

  const detectedCategories = categoryRules
    .filter((rule) => rule.keywords.some((kw) => text.includes(kw)))
    .map((rule) => rule.category)
    .slice(0, 2);

  if (detectedCategories.length === 0) {
    detectedCategories.push('その他');
  }

  // コンテンツの先頭から簡易摘要を生成
  const summary =
    content.substring(0, 200).trim() + (content.length > 200 ? '...' : '');

  return {
    categories: detectedCategories,
    summary: `[自动生成] ${summary}`,
    keywords: extractSimpleKeywords(title),
    rating: 3,
    notebook_path: '待分类',
    one_line_summary: title,
  };
}

/**
 * タイトルから簡易キーワードを抽出（フォールバック用）
 * @param {string} title - 記事タイトル
 * @returns {string[]} キーワード配列
 */
function extractSimpleKeywords(title) {
  if (!title) return [];

  // 中国語・日本語のタイトルからキーワードを抽出（句読点で分割）
  return title
    .split(/[,，、：:；;|｜\s]+/)
    .filter((word) => word.length >= 2 && word.length <= 20)
    .slice(0, 5);
}
