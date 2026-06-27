# 📚 Knowledge Collector - 个人知识库管理系统

一站式的知识收集与管理系统，支持从微信公众号和Chrome浏览器快速收集文章，通过AI自动整理归档到思源笔记。

## 系统架构

```
iOS微信 → 快捷指令 → Web API Server ← Chrome插件
                          ↓
              Readability 正文提取
                          ↓
              Hermes Agent (Gemini API)
              → 自动分类/摘要/关键词
                          ↓
              思源笔记 (自动归档)
```

## 快速开始

### 1. 环境准备

```bash
# 克隆项目
git clone <repo-url>
cd weixin

# 配置环境变量
cp server/.env.example server/.env
# 编辑 .env 文件，填入你的 API Key
```

### 2. Docker 一键部署

```bash
docker compose up -d
```

这将启动：
- **Knowledge Collector API** (`http://localhost:3000`) - 文章收集服务
- **思源笔记** (`http://localhost:6806`) - 知识库

### 3. 本地开发

```bash
cd server
npm install
npm run dev
```

### 4. 安装 Chrome 插件

1. 打开 `chrome://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `chrome-extension/` 目录

### 5. 配置 iOS 快捷指令

参考 [ios-shortcut/README.md](ios-shortcut/README.md) 进行配置。

## API 接口

### POST /api/collect

提交文章到知识库。

```bash
curl -X POST http://localhost:3000/api/collect \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "url": "https://mp.weixin.qq.com/s/xxx",
    "source": "wechat",
    "tags": ["AI"]
  }'
```

### GET /api/health

健康检查。

## 项目结构

```
weixin/
├── docker-compose.yml          # Docker一键部署
├── server/                     # Web API Server
│   ├── src/
│   │   ├── index.js            # 服务器入口
│   │   ├── config.js           # 配置管理
│   │   ├── routes/
│   │   │   └── collect.js      # 收集API路由
│   │   └── services/
│   │       ├── extractor.js    # 文章正文提取
│   │       ├── hermes.js       # AI分析Agent
│   │       └── siyuan.js       # 思源笔记客户端
│   ├── test/
│   │   └── test-collect.js     # API测试
│   └── Dockerfile
├── chrome-extension/           # Chrome 插件
│   ├── manifest.json
│   ├── popup.html / popup.js
│   ├── background.js
│   └── content.js
├── ios-shortcut/               # iOS 快捷指令配置
│   ├── README.md
│   └── test-shortcut.sh
└── docs/
```

## 技术栈

| 组件 | 技术 |
|------|------|
| API Server | Node.js + Express |
| 正文提取 | Mozilla Readability + jsdom |
| AI Agent | Gemini 2.5 Pro API |
| 知识库 | 思源笔记 (SiYuan) |
| 浏览器插件 | Chrome Extension Manifest V3 |
| 部署 | Docker Compose |

## License

MIT
