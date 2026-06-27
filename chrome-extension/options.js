/**
 * オプションページのスクリプト
 * API設定の保存と読み込みを管理する
 */

// デフォルト設定値
const DEFAULTS = {
  apiEndpoint: 'http://localhost:3000/api/collect',
  apiKey: ''
};

// DOM要素の参照
const elements = {
  apiEndpoint: document.getElementById('api-endpoint'),
  apiKey: document.getElementById('api-key'),
  saveButton: document.getElementById('save-settings'),
  statusMessage: document.getElementById('settings-status'),
  resetLink: document.getElementById('reset-settings')
};

/**
 * 初期化: 保存された設定を読み込む
 */
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  setupEventListeners();
});

/**
 * 保存された設定を読み込む
 */
function loadSettings() {
  chrome.storage.sync.get(['apiEndpoint', 'apiKey'], (result) => {
    elements.apiEndpoint.value = result.apiEndpoint || DEFAULTS.apiEndpoint;
    elements.apiKey.value = result.apiKey || DEFAULTS.apiKey;
  });
}

/**
 * イベントリスナーを設定する
 */
function setupEventListeners() {
  // 保存ボタンのクリック
  elements.saveButton.addEventListener('click', saveSettings);

  // リセットリンクのクリック
  elements.resetLink.addEventListener('click', (e) => {
    e.preventDefault();
    resetSettings();
  });

  // Ctrl+Sでも保存可能
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveSettings();
    }
  });
}

/**
 * 設定を保存する
 */
function saveSettings() {
  const apiEndpoint = elements.apiEndpoint.value.trim();
  const apiKey = elements.apiKey.value.trim();

  // バリデーション: URLの形式チェック
  if (apiEndpoint && !isValidUrl(apiEndpoint)) {
    showStatus('有効なURLを入力してください', 'error');
    return;
  }

  // chrome.storage.syncに保存
  chrome.storage.sync.set({
    apiEndpoint: apiEndpoint || DEFAULTS.apiEndpoint,
    apiKey: apiKey
  }, () => {
    if (chrome.runtime.lastError) {
      showStatus('保存に失敗しました: ' + chrome.runtime.lastError.message, 'error');
    } else {
      showStatus('設定を保存しました ✓', 'success');

      // ボタンの状態を一時的に変更
      elements.saveButton.textContent = '保存しました！';
      elements.saveButton.classList.add('saved');

      setTimeout(() => {
        elements.saveButton.textContent = '設定を保存';
        elements.saveButton.classList.remove('saved');
      }, 2000);
    }
  });
}

/**
 * 設定をデフォルトにリセットする
 */
function resetSettings() {
  if (!confirm('設定をデフォルトに戻しますか？')) return;

  // デフォルト値を設定
  elements.apiEndpoint.value = DEFAULTS.apiEndpoint;
  elements.apiKey.value = DEFAULTS.apiKey;

  // ストレージに保存
  chrome.storage.sync.set(DEFAULTS, () => {
    showStatus('デフォルト設定にリセットしました', 'success');
  });
}

/**
 * ステータスメッセージを表示する
 * @param {string} message - 表示するメッセージ
 * @param {'success' | 'error'} type - メッセージタイプ
 */
function showStatus(message, type) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.style.color = type === 'error' ? '#fca5a5' : '#6ee7b7';
  elements.statusMessage.classList.add('visible');

  // 3秒後に非表示
  setTimeout(() => {
    elements.statusMessage.classList.remove('visible');
  }, 3000);
}

/**
 * URLの形式を検証する
 * @param {string} url - 検証するURL
 * @returns {boolean} URLが有効かどうか
 */
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
