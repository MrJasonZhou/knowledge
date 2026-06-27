/**
 * 思源ノートAPIクライアント
 * 思源ノートのKernel APIと通信し、文書の作成・管理を行う
 */

import { config } from '../config.js';

/**
 * 思源ノートAPIにリクエストを送信する
 * @param {string} endpoint - APIエンドポイント
 * @param {object} payload - リクエストデータ
 * @returns {Promise<object>} APIレスポンス
 */
async function siyuanRequest(endpoint, payload = {}) {
  const url = `${config.siyuan.apiUrl}${endpoint}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${config.siyuan.apiToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`思源ノートAPIエラー (${response.status}): ${endpoint}`);
  }

  const data = await response.json();

  if (data.code !== 0) {
    throw new Error(`思源ノートAPIエラー: ${data.msg || '不明なエラー'}`);
  }

  return data.data;
}

/**
 * すべてのノートブックを一覧取得
 * @returns {Promise<object[]>} ノートブック一覧
 */
export async function listNotebooks() {
  const data = await siyuanRequest('/api/notebook/lsNotebooks');
  return data.notebooks || [];
}

/**
 * ノートブックを名前で検索（存在しない場合は作成）
 * @param {string} name - ノートブック名
 * @returns {Promise<string>} ノートブックID
 */
export async function getOrCreateNotebook(name) {
  const notebooks = await listNotebooks();
  const existing = notebooks.find((nb) => nb.name === name);

  if (existing) {
    return existing.id;
  }

  // 新しいノートブックを作成
  const data = await siyuanRequest('/api/notebook/createNotebook', {
    name: name,
  });

  return data.notebook.id;
}

/**
 * 指定パスのフォルダ（文書ツリー）を確認・作成
 * @param {string} notebookId - ノートブックID
 * @param {string} path - フォルダパス (例: "/技術-編程/2026-06")
 * @returns {Promise<string>} 最終フォルダの文書ID
 */
async function ensureFolderPath(notebookId, path) {
  // パスをセグメントに分割
  const segments = path.split('/').filter((s) => s.length > 0);
  let currentPath = '';

  for (const segment of segments) {
    currentPath += `/${segment}`;

    try {
      // パスで文書を検索（SQLクエリ）
      const results = await siyuanRequest('/api/query/sql', {
        stmt: `SELECT id FROM blocks WHERE box = '${notebookId}' AND hpath = '${currentPath}' AND type = 'd' LIMIT 1`,
      });

      if (results && results.length > 0) {
        continue; // このフォルダは既存
      }

      // フォルダ文書を作成
      await siyuanRequest('/api/filetree/createDocWithMd', {
        notebook: notebookId,
        path: currentPath,
        markdown: '',
      });
    } catch (error) {
      // パスが存在しない場合は作成を試行
      console.warn(
        `[SiYuan] フォルダ確認/作成: ${currentPath} - ${error.message}`
      );
      try {
        await siyuanRequest('/api/filetree/createDocWithMd', {
          notebook: notebookId,
          path: currentPath,
          markdown: '',
        });
      } catch (createError) {
        // 既に存在する場合のエラーは無視
        console.warn(`[SiYuan] フォルダ作成スキップ: ${createError.message}`);
      }
    }
  }

  return currentPath;
}

/**
 * Markdown形式で文書を作成し、思源ノートに保存する
 * @param {object} params - 文書パラメータ
 * @param {string} params.title - 文書タイトル
 * @param {string} params.content - 記事本文
 * @param {string} params.summary - AI摘要
 * @param {string[]} params.categories - カテゴリ
 * @param {string[]} params.keywords - キーワード
 * @param {number} params.rating - 品質評価
 * @param {string} params.author - 著者
 * @param {string} params.url - 元記事URL
 * @param {string} params.source - ソース (wechat/chrome)
 * @param {string} params.notebookPath - 保存先パス
 * @returns {Promise<object>} 作成結果
 */
export async function createArticleDoc(params) {
  const {
    title,
    content,
    summary,
    categories = [],
    keywords = [],
    rating = 3,
    author = '',
    url = '',
    source = '',
    notebookPath = '待分类',
    oneLine = '',
  } = params;

  try {
    // ノートブックIDを取得（メインの知識ベースノートブック）
    const notebookName = '知识库';
    const notebookId = await getOrCreateNotebook(notebookName);

    // フォルダパスを確保
    const datePath = new Date().toISOString().substring(0, 7); // YYYY-MM
    const categoryFolder =
      categories[0]?.replace(/\//g, '-') || '待分类';
    const folderPath = `/${categoryFolder}/${datePath}`;

    await ensureFolderPath(notebookId, folderPath);

    // タイトルをサニタイズ（ファイル名として無効な文字を除去）
    const safeTitle = sanitizeTitle(title);

    // 星評価の絵文字表現
    const ratingStars = '⭐'.repeat(Math.min(Math.max(rating, 1), 5));

    // Markdownコンテンツを生成
    const markdown = `---
title: ${title}
source: ${source}
url: ${url}
author: ${author}
date: ${new Date().toISOString().split('T')[0]}
tags: ${categories.join(', ')}
rating: ${ratingStars}
---

## 📋 AI 摘要

${summary || '暂无摘要'}

${oneLine ? `> ${oneLine}` : ''}

## 🏷️ 分类与标签

- **分类**: ${categories.join(' / ')}
- **关键词**: ${keywords.map((k) => `\`${k}\``).join(' ')}
- **质量评分**: ${ratingStars} (${rating}/5)

## 📄 正文

${content || '正文提取失败，请访问原文链接。'}

## 🔗 原文链接

[${title}](${url})

## 💭 个人笔记

*(在此添加你的笔记和想法)*
`;

    // 文書を作成
    const docPath = `${folderPath}/${safeTitle}`;
    const result = await siyuanRequest('/api/filetree/createDocWithMd', {
      notebook: notebookId,
      path: docPath,
      markdown: markdown,
    });

    // カスタム属性を設定（検索・フィルタリング用）
    if (result) {
      try {
        await siyuanRequest('/api/attr/setBlockAttrs', {
          id: result,
          attrs: {
            'custom-source': source,
            'custom-url': url,
            'custom-rating': String(rating),
            'custom-categories': categories.join(','),
          },
        });
      } catch (attrError) {
        console.warn(
          `[SiYuan] カスタム属性の設定に失敗: ${attrError.message}`
        );
      }
    }

    return {
      success: true,
      data: {
        docId: result,
        path: docPath,
        notebook: notebookName,
        notebookId: notebookId,
      },
    };
  } catch (error) {
    console.error(`[SiYuan] 文書作成エラー: ${error.message}`);
    return {
      success: false,
      error: `思源ノートへの保存に失敗: ${error.message}`,
    };
  }
}

/**
 * タイトルをファイル名として安全な形式にサニタイズ
 * @param {string} title - 元タイトル
 * @returns {string} サニタイズされたタイトル
 */
function sanitizeTitle(title) {
  return title
    .replace(/[\/\\:*?"<>|#\[\]{}]/g, '') // ファイルシステム不正文字を除去
    .replace(/\s+/g, ' ') // 連続空白を単一に
    .trim()
    .substring(0, 100); // 長さ制限
}

/**
 * 思源ノートの接続状態を確認
 * @returns {Promise<object>} 接続状態
 */
export async function checkConnection() {
  try {
    const notebooks = await listNotebooks();
    return {
      connected: true,
      notebookCount: notebooks.length,
      notebooks: notebooks.map((nb) => ({ id: nb.id, name: nb.name })),
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message,
    };
  }
}
