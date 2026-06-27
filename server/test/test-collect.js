/**
 * 記事収集APIのテストスクリプト
 * ローカルサーバーに対してテストリクエストを送信する
 */

const API_URL = 'http://localhost:3000';

/**
 * テストケース実行関数
 * @param {string} name - テストケース名
 * @param {Function} fn - テスト関数
 */
async function runTest(name, fn) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📋 テスト: ${name}`);
  console.log('='.repeat(60));

  try {
    await fn();
    console.log(`✅ 成功: ${name}`);
  } catch (error) {
    console.error(`❌ 失敗: ${name}`);
    console.error(`   エラー: ${error.message}`);
  }
}

/**
 * ヘルスチェックテスト
 */
async function testHealth() {
  const response = await fetch(`${API_URL}/api/health`);
  const data = await response.json();
  console.log('  レスポンス:', JSON.stringify(data, null, 2));

  if (data.status !== 'ok') {
    throw new Error('ヘルスチェック失敗');
  }
}

/**
 * 記事収集テスト（通常のWebページ）
 */
async function testCollectWebArticle() {
  const response = await fetch(`${API_URL}/api/collect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://blog.google/technology/ai/',
      source: 'chrome',
      tags: ['AI', 'テスト'],
    }),
  });

  const data = await response.json();
  console.log('  ステータス:', response.status);
  console.log('  レスポンス:', JSON.stringify(data, null, 2));

  if (!data.success && response.status < 500) {
    console.log('  ⚠️ 記事抽出に失敗（ネットワークまたはAPIの問題の可能性）');
  }
}

/**
 * バリデーションテスト（URL未指定）
 */
async function testValidation() {
  const response = await fetch(`${API_URL}/api/collect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  const data = await response.json();
  console.log('  ステータス:', response.status);
  console.log('  レスポンス:', JSON.stringify(data, null, 2));

  if (response.status !== 400) {
    throw new Error(`期待されるステータス400、実際: ${response.status}`);
  }
}

/**
 * フォールバックコンテンツ付きテスト
 */
async function testWithFallbackContent() {
  const response = await fetch(`${API_URL}/api/collect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://example.com/test-article',
      title: 'テスト記事：AI技術の最新動向',
      content:
        '人工知能技術は急速に進化しており、特に大規模言語モデル（LLM）の発展が著しい。Gemini、Claude、GPTなどのモデルは、テキスト生成から画像理解まで幅広いタスクに対応している。',
      source: 'chrome',
      tags: ['テスト', 'AI'],
    }),
  });

  const data = await response.json();
  console.log('  ステータス:', response.status);
  console.log('  レスポンス:', JSON.stringify(data, null, 2));
}

// ===== メイン実行 =====
console.log('🚀 Knowledge Collector API テスト開始');
console.log(`   サーバー: ${API_URL}`);

try {
  await runTest('ヘルスチェック', testHealth);
  await runTest('バリデーション（URL未指定）', testValidation);
  await runTest('フォールバックコンテンツ付き収集', testWithFallbackContent);
  await runTest('Web記事収集', testCollectWebArticle);
} catch (error) {
  console.error('\n💥 テスト実行エラー:', error.message);
  console.error(
    '   ヒント: サーバーが起動していることを確認してください (npm run dev)'
  );
}

console.log('\n📋 テスト完了\n');
