/**
 * コンテンツスクリプト
 * ページ上の選択テキスト取得、メタデータ抽出、トースト通知を担当する
 */

/**
 * バックグラウンドスクリプトからのメッセージを処理する
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_SELECTED_TEXT':
      // 選択テキストを返す
      sendResponse(getSelectedText());
      break;

    case 'GET_METADATA':
      // ページメタデータを返す
      sendResponse(getPageMetadata());
      break;

    case 'SHOW_TOAST':
      // トースト通知を表示
      showToast(message.message, message.success);
      sendResponse({ received: true });
      break;

    default:
      break;
  }
  // 同期的なレスポンスの場合はfalseを返す
  return false;
});

/**
 * ページ上の選択テキストを取得する
 * @returns {string} 選択されたテキスト
 */
function getSelectedText() {
  const selection = window.getSelection();
  return selection ? selection.toString().trim() : '';
}

/**
 * ページのメタデータを抽出する
 * Open Graphタグ、Twitterカード、基本的なメタタグを取得する
 * @returns {Object} メタデータオブジェクト
 */
function getPageMetadata() {
  const metadata = {};

  // Open Graphメタデータを取得
  const ogTags = ['og:title', 'og:description', 'og:image', 'og:url', 'og:type', 'og:site_name'];
  ogTags.forEach((tag) => {
    const element = document.querySelector(`meta[property="${tag}"]`);
    if (element) {
      const key = tag.replace('og:', 'og_');
      metadata[key] = element.getAttribute('content');
    }
  });

  // Twitterカードメタデータを取得
  const twitterTags = ['twitter:title', 'twitter:description', 'twitter:image', 'twitter:card'];
  twitterTags.forEach((tag) => {
    const element = document.querySelector(`meta[name="${tag}"]`);
    if (element) {
      const key = tag.replace('twitter:', 'twitter_');
      metadata[key] = element.getAttribute('content');
    }
  });

  // 基本的なメタデータを取得
  const descriptionMeta = document.querySelector('meta[name="description"]');
  if (descriptionMeta) {
    metadata.description = descriptionMeta.getAttribute('content');
  }

  const keywordsMeta = document.querySelector('meta[name="keywords"]');
  if (keywordsMeta) {
    metadata.keywords = keywordsMeta.getAttribute('content');
  }

  const authorMeta = document.querySelector('meta[name="author"]');
  if (authorMeta) {
    metadata.author = authorMeta.getAttribute('content');
  }

  // ページの言語情報
  metadata.language = document.documentElement.lang || '';

  // 正規URLを取得
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) {
    metadata.canonical_url = canonical.getAttribute('href');
  }

  // ファビコンを取得
  const favicon = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
  if (favicon) {
    metadata.favicon = favicon.getAttribute('href');
  }

  return metadata;
}

/**
 * トースト通知を表示する
 * @param {string} message - 表示メッセージ
 * @param {boolean} success - 成功/失敗フラグ
 */
function showToast(message, success = true) {
  // 既存のトーストがあれば削除
  const existingToast = document.getElementById('kb-collector-toast');
  if (existingToast) {
    existingToast.remove();
  }

  // トースト要素を作成
  const toast = document.createElement('div');
  toast.id = 'kb-collector-toast';
  toast.className = `kb-toast ${success ? 'kb-toast-success' : 'kb-toast-error'}`;

  // アイコンとメッセージを設定
  const icon = success ? '✓' : '✕';
  toast.innerHTML = `
    <span class="kb-toast-icon">${icon}</span>
    <span class="kb-toast-message">${message}</span>
  `;

  // DOMに追加
  document.body.appendChild(toast);

  // アニメーションで表示
  requestAnimationFrame(() => {
    toast.classList.add('kb-toast-visible');
  });

  // 3秒後に自動非表示
  setTimeout(() => {
    toast.classList.remove('kb-toast-visible');
    toast.classList.add('kb-toast-hiding');

    // アニメーション完了後に要素を削除
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 400);
  }, 3000);
}
