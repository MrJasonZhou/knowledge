/**
 * ポップアップUIのメインスクリプト
 * ページ情報の取得、タグ管理、保存処理を制御する
 */

// DOM要素の参照
const elements = {
  pageTitle: document.getElementById('page-title'),
  pageUrl: document.getElementById('page-url'),
  selectionSection: document.getElementById('selection-section'),
  selectedText: document.getElementById('selected-text'),
  tagInput: document.getElementById('tag-input'),
  tagsContainer: document.getElementById('tags-container'),
  saveButton: document.getElementById('save-button'),
  statusMessage: document.getElementById('status-message'),
  optionsLink: document.getElementById('options-link')
};

// タグの配列
let tags = [];

// ページ情報の保存用
let pageInfo = {
  url: '',
  title: '',
  selectedText: '',
  metadata: {}
};

/**
 * 初期化処理
 */
document.addEventListener('DOMContentLoaded', async () => {
  await loadPageInfo();
  setupEventListeners();
});

/**
 * アクティブタブからページ情報を読み込む
 */
async function loadPageInfo() {
  try {
    // アクティブなタブを取得
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      showStatus('タブ情報を取得できません', 'error');
      return;
    }

    // 基本情報を設定
    pageInfo.url = tab.url || '';
    pageInfo.title = tab.title || '';

    // UIに反映
    elements.pageTitle.textContent = pageInfo.title || '（タイトルなし）';
    elements.pageUrl.textContent = pageInfo.url || '（URLなし）';
    elements.pageUrl.title = pageInfo.url;

    // コンテンツスクリプトから追加情報を取得
    try {
      // 選択テキストを取得
      const selectedText = await chrome.tabs.sendMessage(tab.id, { type: 'GET_SELECTED_TEXT' });
      if (selectedText && selectedText.trim()) {
        pageInfo.selectedText = selectedText.trim();
        elements.selectedText.textContent = pageInfo.selectedText;
        elements.selectionSection.style.display = 'block';
      }

      // メタデータを取得
      const metadata = await chrome.tabs.sendMessage(tab.id, { type: 'GET_METADATA' });
      if (metadata) {
        pageInfo.metadata = metadata;
      }
    } catch (e) {
      // chrome://やedge://などの特殊ページではコンテンツスクリプトが動作しない
      console.warn('コンテンツスクリプトとの通信に失敗:', e);
    }
  } catch (error) {
    console.error('ページ情報の読み込みエラー:', error);
    elements.pageTitle.textContent = 'エラー';
    elements.pageUrl.textContent = 'ページ情報を取得できません';
  }
}

/**
 * イベントリスナーを設定する
 */
function setupEventListeners() {
  // タグ入力のキーイベント
  elements.tagInput.addEventListener('keydown', handleTagInput);

  // 保存ボタンのクリック
  elements.saveButton.addEventListener('click', handleSave);

  // 設定リンクのクリック
  elements.optionsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // タグ入力ラッパーのクリックでフォーカス
  document.querySelector('.tag-input-wrapper').addEventListener('click', () => {
    elements.tagInput.focus();
  });
}

/**
 * タグ入力のキーイベントを処理する
 * @param {KeyboardEvent} e - キーボードイベント
 */
function handleTagInput(e) {
  const value = elements.tagInput.value.trim();

  // Enterキーまたはカンマで区切ってタグを追加
  if ((e.key === 'Enter' || e.key === ',') && value) {
    e.preventDefault();

    // カンマ区切りの場合は複数タグを処理
    const newTags = value.split(',').map(t => t.trim()).filter(t => t);
    newTags.forEach(tag => addTag(tag));

    elements.tagInput.value = '';
  }

  // Backspaceで最後のタグを削除
  if (e.key === 'Backspace' && !value && tags.length > 0) {
    removeTag(tags.length - 1);
  }
}

/**
 * タグを追加する
 * @param {string} tag - タグ名
 */
function addTag(tag) {
  // 重複チェック
  if (tags.includes(tag)) return;

  tags.push(tag);
  renderTags();
}

/**
 * タグを削除する
 * @param {number} index - タグのインデックス
 */
function removeTag(index) {
  tags.splice(index, 1);
  renderTags();
}

/**
 * タグリストをレンダリングする
 */
function renderTags() {
  elements.tagsContainer.innerHTML = '';

  tags.forEach((tag, index) => {
    const tagElement = document.createElement('span');
    tagElement.className = 'tag-item';
    tagElement.innerHTML = `
      ${escapeHtml(tag)}
      <button class="tag-remove" data-index="${index}" title="タグを削除">×</button>
    `;

    // 削除ボタンのイベントリスナー
    tagElement.querySelector('.tag-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      removeTag(index);
    });

    elements.tagsContainer.appendChild(tagElement);
  });
}

/**
 * 保存処理を実行する
 */
async function handleSave() {
  // ボタンの状態をローディングに変更
  setButtonState('loading');
  showStatus('');

  // 保存データを構築
  const data = {
    url: pageInfo.url,
    title: pageInfo.title,
    content: pageInfo.selectedText,
    source: 'chrome',
    tags: tags,
    metadata: pageInfo.metadata,
    savedAt: new Date().toISOString()
  };

  try {
    // バックグラウンドスクリプト経由でAPIに送信
    const result = await chrome.runtime.sendMessage({
      type: 'SAVE_TO_KNOWLEDGE_BASE',
      data: data
    });

    if (result && result.success) {
      setButtonState('success');
      showStatus('ナレッジベースに保存しました！', 'success');

      // アクティブタブにトースト通知を送信
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'SHOW_TOAST',
            success: true,
            message: '保存しました！'
          });
        }
      } catch (e) {
        // トースト送信失敗は無視
      }

      // 3秒後にボタンをリセット
      setTimeout(() => setButtonState('default'), 3000);
    } else {
      const errorMsg = result?.error || '不明なエラー';
      setButtonState('error');
      showStatus(`エラー: ${errorMsg}`, 'error');

      // 3秒後にボタンをリセット
      setTimeout(() => setButtonState('default'), 3000);
    }
  } catch (error) {
    console.error('保存エラー:', error);
    setButtonState('error');
    showStatus(`接続エラー: ${error.message}`, 'error');

    // 3秒後にボタンをリセット
    setTimeout(() => setButtonState('default'), 3000);
  }
}

/**
 * ボタンの状態を変更する
 * @param {'default' | 'loading' | 'success' | 'error'} state - ボタンの状態
 */
function setButtonState(state) {
  const button = elements.saveButton;
  const content = button.querySelector('.button-content');
  const loading = button.querySelector('.button-loading');
  const success = button.querySelector('.button-success');

  // すべてのスタイルクラスをリセット
  button.classList.remove('success', 'error');
  button.disabled = false;

  switch (state) {
    case 'loading':
      content.style.display = 'none';
      loading.style.display = 'flex';
      success.style.display = 'none';
      button.disabled = true;
      break;

    case 'success':
      content.style.display = 'none';
      loading.style.display = 'none';
      success.style.display = 'flex';
      button.classList.add('success');
      break;

    case 'error':
      content.style.display = 'flex';
      loading.style.display = 'none';
      success.style.display = 'none';
      button.classList.add('error');
      break;

    default:
      content.style.display = 'flex';
      loading.style.display = 'none';
      success.style.display = 'none';
      break;
  }
}

/**
 * ステータスメッセージを表示する
 * @param {string} message - メッセージ
 * @param {'success' | 'error' | ''} type - メッセージタイプ
 */
function showStatus(message, type = '') {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `status-message ${type}`;
}

/**
 * HTMLエスケープ処理
 * @param {string} text - エスケープするテキスト
 * @returns {string} エスケープ済みテキスト
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
