/**
 * 記事コンテンツ抽出サービス
 * Mozilla Readabilityを使用してWebページから記事の本文を抽出する
 * WeChat公式アカウント記事への特別対応を含む
 */

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { config } from '../config.js';

/**
 * URLから記事コンテンツを抽出する
 * @param {string} url - 抽出対象のURL
 * @param {object} options - オプション設定
 * @param {string} options.source - ソースタイプ ('wechat' | 'chrome')
 * @param {string} options.fallbackContent - フォールバック用コンテンツ
 * @returns {Promise<object>} 抽出された記事データ
 */
export async function extractArticle(url, options = {}) {
  const { source = 'chrome', fallbackContent = '' } = options;

  try {
    // WeChat記事かどうかを判定
    const isWechat = isWechatUrl(url);
    const userAgent = isWechat
      ? config.extractor.wechatUserAgent
      : config.extractor.defaultUserAgent;

    // HTMLコンテンツを取得
    const html = await fetchHtml(url, userAgent);

    // Readabilityで記事を解析
    const article = parseArticle(html, url);

    if (!article) {
      // Readabilityが失敗した場合はフォールバック
      console.warn(`[Extractor] Readability解析に失敗: ${url}`);
      return createFallbackResult(url, html, fallbackContent);
    }

    return {
      success: true,
      data: {
        title: article.title || extractTitleFromHtml(html) || 'タイトル不明',
        content: article.textContent || '',
        htmlContent: article.content || '',
        excerpt: article.excerpt || '',
        author: article.byline || extractAuthorFromWechat(html, isWechat) || '',
        siteName: article.siteName || (isWechat ? '微信公众号' : ''),
        url: url,
        source: source,
        length: article.length || 0,
        extractedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error(`[Extractor] 抽出エラー: ${error.message}`);

    // エラー時でもフォールバックコンテンツがあれば使用
    if (fallbackContent) {
      return {
        success: true,
        data: {
          title: 'タイトル取得失敗',
          content: fallbackContent,
          htmlContent: '',
          excerpt: fallbackContent.substring(0, 200),
          author: '',
          siteName: '',
          url: url,
          source: source,
          length: fallbackContent.length,
          extractedAt: new Date().toISOString(),
          warning: `URLからの抽出に失敗。フォールバックコンテンツを使用: ${error.message}`,
        },
      };
    }

    return {
      success: false,
      error: `記事抽出に失敗しました: ${error.message}`,
    };
  }
}

/**
 * URLがWeChat公式アカウント記事かどうかを判定
 * @param {string} url - 判定対象のURL
 * @returns {boolean}
 */
function isWechatUrl(url) {
  return (
    url.includes('mp.weixin.qq.com') ||
    url.includes('weixin.qq.com') ||
    url.includes('wechat.com')
  );
}

/**
 * HTTPリクエストでHTMLコンテンツを取得
 * @param {string} url - 取得対象のURL
 * @param {string} userAgent - 使用するUser-Agent
 * @returns {Promise<string>} HTMLコンテンツ
 */
async function fetchHtml(url, userAgent) {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    config.extractor.timeout
  );

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7',
        'Cache-Control': 'no-cache',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`HTTPステータスエラー: ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Readabilityを使用して記事を解析
 * @param {string} html - 解析対象のHTML
 * @param {string} url - 記事のURL
 * @returns {object|null} 解析結果
 */
function parseArticle(html, url) {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document, {
    charThreshold: 100,
  });
  return reader.parse();
}

/**
 * HTMLからタイトルを直接抽出（フォールバック用）
 * @param {string} html - HTML文字列
 * @returns {string} タイトル
 */
function extractTitleFromHtml(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  // og:titleを試行
  const ogTitle = doc.querySelector('meta[property="og:title"]');
  if (ogTitle) return ogTitle.getAttribute('content');

  // titleタグを試行
  const titleTag = doc.querySelector('title');
  if (titleTag) return titleTag.textContent.trim();

  // WeChat特有のタイトル要素を試行
  const richMediaTitle = doc.querySelector('#activity-name');
  if (richMediaTitle) return richMediaTitle.textContent.trim();

  return '';
}

/**
 * WeChat記事から著者情報を抽出
 * @param {string} html - HTML文字列
 * @param {boolean} isWechat - WeChat記事フラグ
 * @returns {string} 著者名
 */
function extractAuthorFromWechat(html, isWechat) {
  if (!isWechat) return '';

  const dom = new JSDOM(html);
  const doc = dom.window.document;

  // 公式アカウント名を取得
  const accountName = doc.querySelector('#js_name');
  if (accountName) return accountName.textContent.trim();

  // og:article:authorを試行
  const ogAuthor = doc.querySelector('meta[property="og:article:author"]');
  if (ogAuthor) return ogAuthor.getAttribute('content');

  return '';
}

/**
 * Readability解析失敗時のフォールバック結果を生成
 * @param {string} url - 記事のURL
 * @param {string} html - HTMLコンテンツ
 * @param {string} fallbackContent - フォールバックコンテンツ
 * @returns {object} フォールバック結果
 */
function createFallbackResult(url, html, fallbackContent) {
  const title = extractTitleFromHtml(html) || 'タイトル不明';
  const content = fallbackContent || extractBasicTextFromHtml(html);

  return {
    success: true,
    data: {
      title,
      content,
      htmlContent: '',
      excerpt: content.substring(0, 200),
      author: '',
      siteName: '',
      url,
      source: 'fallback',
      length: content.length,
      extractedAt: new Date().toISOString(),
      warning: 'Readability解析に失敗。基本テキスト抽出を使用。',
    },
  };
}

/**
 * HTMLから基本的なテキストを抽出（最終フォールバック）
 * @param {string} html - HTML文字列
 * @returns {string} 抽出されたテキスト
 */
function extractBasicTextFromHtml(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  // スクリプト、スタイル要素を削除
  doc.querySelectorAll('script, style, nav, header, footer').forEach((el) => {
    el.remove();
  });

  // bodyのテキストコンテンツを取得
  const text = doc.body ? doc.body.textContent : '';
  // 余分な空白を整理
  return text.replace(/\s+/g, ' ').trim().substring(0, 10000);
}
