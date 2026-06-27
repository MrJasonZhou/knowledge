#!/usr/bin/env bash
# ============================================================
# テストスクリプト: iOS ショートカットの API リクエストをシミュレーション
# 使用方法: ./test-shortcut.sh [API_URL] [API_KEY]
# ============================================================

set -euo pipefail

# デフォルト設定値
DEFAULT_API_URL="http://localhost:3000/api/collect"
DEFAULT_API_KEY="your-api-key"

# コマンドライン引数またはデフォルト値を使用
API_URL="${1:-$DEFAULT_API_URL}"
API_KEY="${2:-$DEFAULT_API_KEY}"

# テスト用のサンプル微信記事 URL
SAMPLE_URL="https://mp.weixin.qq.com/s/example-wechat-article-id"

# カラー出力用の定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # リセット

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  iOS ショートカット API テストスクリプト${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# ──────────────────────────────────────────────
# テスト 1: 基本的な記事収集リクエスト
# ──────────────────────────────────────────────
echo -e "${YELLOW}📋 テスト 1: 基本的な記事収集リクエスト${NC}"
echo -e "   エンドポイント: ${API_URL}"
echo -e "   メソッド: POST"
echo -e "   テスト URL: ${SAMPLE_URL}"
echo ""

echo -e "${BLUE}リクエスト送信中...${NC}"
echo ""

# リクエストの送信とレスポンスの取得
HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${API_URL}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_KEY}" \
  -d "{
    \"url\": \"${SAMPLE_URL}\",
    \"source\": \"wechat\",
    \"tags\": [\"テスト\", \"微信\"]
  }" 2>&1) || true

# レスポンスボディとステータスコードを分離
HTTP_BODY=$(echo "$HTTP_RESPONSE" | sed '$d')
HTTP_STATUS=$(echo "$HTTP_RESPONSE" | tail -n 1)

echo -e "ステータスコード: ${HTTP_STATUS}"
echo -e "レスポンスボディ:"
echo "$HTTP_BODY" | python3 -m json.tool 2>/dev/null || echo "$HTTP_BODY"
echo ""

# ステータスコードに基づく結果表示
if [[ "$HTTP_STATUS" =~ ^2[0-9][0-9]$ ]]; then
  echo -e "${GREEN}✅ テスト 1 成功！サーバーは正常に応答しました。${NC}"
else
  echo -e "${RED}❌ テスト 1 失敗。ステータスコード: ${HTTP_STATUS}${NC}"
fi

echo ""

# ──────────────────────────────────────────────
# テスト 2: タグなしのリクエスト
# ──────────────────────────────────────────────
echo -e "${YELLOW}📋 テスト 2: タグなしのリクエスト${NC}"
echo ""

HTTP_RESPONSE_2=$(curl -s -w "\n%{http_code}" \
  -X POST "${API_URL}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_KEY}" \
  -d "{
    \"url\": \"${SAMPLE_URL}\",
    \"source\": \"wechat\",
    \"tags\": []
  }" 2>&1) || true

HTTP_BODY_2=$(echo "$HTTP_RESPONSE_2" | sed '$d')
HTTP_STATUS_2=$(echo "$HTTP_RESPONSE_2" | tail -n 1)

echo -e "ステータスコード: ${HTTP_STATUS_2}"
echo -e "レスポンスボディ:"
echo "$HTTP_BODY_2" | python3 -m json.tool 2>/dev/null || echo "$HTTP_BODY_2"
echo ""

if [[ "$HTTP_STATUS_2" =~ ^2[0-9][0-9]$ ]]; then
  echo -e "${GREEN}✅ テスト 2 成功！${NC}"
else
  echo -e "${RED}❌ テスト 2 失敗。ステータスコード: ${HTTP_STATUS_2}${NC}"
fi

echo ""

# ──────────────────────────────────────────────
# テスト 3: ヘルスチェック
# ──────────────────────────────────────────────
echo -e "${YELLOW}📋 テスト 3: サーバーヘルスチェック${NC}"
echo ""

# APIエンドポイントからベースURLを取得
BASE_URL=$(echo "$API_URL" | sed 's|/api/collect||')
HEALTH_URL="${BASE_URL}/health"

echo -e "   エンドポイント: ${HEALTH_URL}"

HTTP_RESPONSE_3=$(curl -s -w "\n%{http_code}" \
  -X GET "${HEALTH_URL}" 2>&1) || true

HTTP_BODY_3=$(echo "$HTTP_RESPONSE_3" | sed '$d')
HTTP_STATUS_3=$(echo "$HTTP_RESPONSE_3" | tail -n 1)

echo -e "ステータスコード: ${HTTP_STATUS_3}"
echo -e "レスポンスボディ:"
echo "$HTTP_BODY_3" | python3 -m json.tool 2>/dev/null || echo "$HTTP_BODY_3"
echo ""

if [[ "$HTTP_STATUS_3" =~ ^2[0-9][0-9]$ ]]; then
  echo -e "${GREEN}✅ テスト 3 成功！サーバーは正常に稼働しています。${NC}"
else
  echo -e "${RED}❌ テスト 3 失敗。サーバーに接続できません。${NC}"
fi

echo ""

# ──────────────────────────────────────────────
# テスト結果のまとめ
# ──────────────────────────────────────────────
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  期待されるレスポンス（正常時）${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo -e "ステータスコード: ${GREEN}200${NC}"
echo -e "レスポンスボディ:"
cat << 'EOF'
{
  "success": true,
  "message": "文章已成功收集",
  "data": {
    "id": "article-uuid",
    "url": "https://mp.weixin.qq.com/s/example-wechat-article-id",
    "title": "文章标题",
    "source": "wechat",
    "tags": ["テスト", "微信"],
    "collected_at": "2026-06-27T00:00:00.000Z"
  }
}
EOF

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  使用方法${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo "  ./test-shortcut.sh                              # デフォルト設定で実行"
echo "  ./test-shortcut.sh http://localhost:3000/api/collect  # カスタム URL"
echo "  ./test-shortcut.sh https://example.com/api/collect my-key  # カスタム URL + キー"
echo ""
