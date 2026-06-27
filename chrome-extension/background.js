/**
 * バックグラウンドサービスワーカー
 * コンテキストメニュー、キーボードショートカット、API通信を管理する
 */

// デフォルトのAPI設定
const DEFAULT_API_ENDPOINT = 'http://localhost:3000/api/collect';
const DEFAULT_API_KEY = '';

/**
 * 拡張機能インストール時にコンテキストメニューを作成する
 */
chrome.runtime.onInstalled.addListener(() => {
  // コンテキストメニューを作成
  chrome.contextMenus.create({
    id: 'save-to-knowledge-base',
    title: 'ナレッジベースに保存',
    contexts: ['page', 'selection', 'link', 'image']
  });

  // デフォルト設定を保存
  chrome.storage.sync.get(['apiEndpoint', 'apiKey'], (result) => {
    if (!result.apiEndpoint) {
      chrome.storage.sync.set({
        apiEndpoint: DEFAULT_API_ENDPOINT,
        apiKey: DEFAULT_API_KEY
      });
    }
  });
});

/**
 * コンテキストメニューがクリックされた時の処理
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'save-to-knowledge-base') {
    try {
      // コンテンツスクリプトからメタデータを取得
      const metadata = await getPageMetadata(tab.id);

      // 保存データを構築
      const data = {
        url: info.pageUrl || tab.url,
        title: tab.title || '',
        content: info.selectionText || '',
        source: 'chrome',
        tags: [],
        metadata: metadata || {}
      };

      // APIに送信
      const result = await saveToKnowledgeBase(data);

      // コンテンツスクリプトにトースト通知を送信
      await chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_TOAST',
        success: result.success,
        message: result.success ? '保存しました！' : 'エラーが発生しました'
      });
    } catch (error) {
      console.error('保存エラー:', error);
      // エラー時もトースト通知を送信
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'SHOW_TOAST',
          success: false,
          message: 'エラーが発生しました: ' + error.message
        });
      } catch (e) {
        // コンテンツスクリプトが読み込まれていない場合は無視
        console.warn('トースト通知の送信に失敗:', e);
      }
    }
  }
});

/**
 * キーボードショートカットの処理
 */
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'save-to-knowledge-base') {
    try {
      // アクティブなタブを取得
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      // コンテンツスクリプトからデータを取得
      const metadata = await getPageMetadata(tab.id);
      const selectedText = await getSelectedText(tab.id);

      // 保存データを構築
      const data = {
        url: tab.url,
        title: tab.title || '',
        content: selectedText || '',
        source: 'chrome',
        tags: [],
        metadata: metadata || {}
      };

      // APIに送信
      const result = await saveToKnowledgeBase(data);

      // コンテンツスクリプトにトースト通知を送信
      await chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_TOAST',
        success: result.success,
        message: result.success ? '保存しました！' : 'エラーが発生しました'
      });
    } catch (error) {
      console.error('ショートカット保存エラー:', error);
    }
  }
});

/**
 * ポップアップやコンテンツスクリプトからのメッセージを処理する
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SAVE_TO_KNOWLEDGE_BASE') {
    // 非同期処理のためtrueを返す
    saveToKnowledgeBase(message.data)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

/**
 * ページのメタデータを取得する
 * @param {number} tabId - タブID
 * @returns {Promise<Object>} メタデータオブジェクト
 */
async function getPageMetadata(tabId) {
  try {
    const results = await chrome.tabs.sendMessage(tabId, { type: 'GET_METADATA' });
    return results;
  } catch (error) {
    console.warn('メタデータ取得失敗:', error);
    return {};
  }
}

/**
 * 選択テキストを取得する
 * @param {number} tabId - タブID
 * @returns {Promise<string>} 選択テキスト
 */
async function getSelectedText(tabId) {
  try {
    const results = await chrome.tabs.sendMessage(tabId, { type: 'GET_SELECTED_TEXT' });
    return results;
  } catch (error) {
    console.warn('選択テキスト取得失敗:', error);
    return '';
  }
}

/**
 * ナレッジベースにデータを保存する
 * @param {Object} data - 保存するデータ
 * @returns {Promise<Object>} 保存結果
 */
async function saveToKnowledgeBase(data) {
  // ストレージから設定を取得
  const settings = await chrome.storage.sync.get(['apiEndpoint', 'apiKey']);
  const endpoint = settings.apiEndpoint || DEFAULT_API_ENDPOINT;
  const apiKey = settings.apiKey || '';

  // リクエストヘッダーを構築
  const headers = {
    'Content-Type': 'application/json'
  };

  // APIキーが設定されている場合はヘッダーに追加
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    return { success: true, data: result };
  } catch (error) {
    console.error('API通信エラー:', error);
    return { success: false, error: error.message };
  }
}
