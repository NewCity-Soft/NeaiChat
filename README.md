# NeaiChat

> 一款开源的跨平台 AI 对话应用，支持多模型、多协议、浏览器内代码执行与多媒体生成。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React 19](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://typescriptlang.org)
[![Vite 6](https://img.shields.io/badge/Vite-6-646cff?logo=vite)](https://vitejs.dev)

---

## 一句话介绍

NeaiChat 是一个可以在**浏览器中直接运行**的 AI 聊天应用，支持接入 OpenAI、Anthropic、Google Gemini 等多种模型，内置 Python/JS/PHP 代码执行、图文生成、虚拟文件管理等强大功能。

---

## 功能亮点

| 功能 | 说明 |
|------|------|
| 🤖 **多模型接入** | OpenAI / Anthropic / Gemini，支持自定义端点和 `auto` 自动协议识别 |
| 💻 **浏览器代码执行** | Python（Pyodide）、JavaScript（Sucrase）、PHP（php-wasm）无需后端 |
| 📁 **虚拟文件系统（VFS）** | 拖拽上传文件，注入对话上下文，支持文件读写与目录管理 |
| 🔄 **流式对话** | 实时显示文本、思考过程与工具调用结果 |
| 🧠 **智能对话压缩** | 冷热区拆分提炼，自动压缩历史以节省 Token |
| 🎨 **图像 / 视频生成** | 集成 DALL-E、Luma 等媒体生成 API |
| 📋 **提示词库** | 内置角色模板（程序员、翻译官、创意写手…），支持自定义 |
| 🌗 **多主题** | 亮色 / 暗色 / 跟随系统，Tailwind CSS v4 驱动 |
| 🎙️ **语音输入** | 浏览器原生语音识别，支持语音转文字对话 |
| 🔌 **MCP 支持** | 可配置 MCP 服务器扩展工具能力 |

---

## 支持的 LLM 协议

| 协议 | 示例模型 |
|------|---------|
| OpenAI 兼容 | gpt-4o, gpt-4o-mini, gpt-3.5-turbo, claude-3-5-sonnet (via 兼容端点) |
| Anthropic | claude-3-5-sonnet, claude-3-opus, claude-3-haiku |
| Google Gemini | gemini-2.0-flash, gemini-2.0-flash-thinking, gemini-2.5-pro |

> 支持任意 OpenAI 兼容格式的自定义 API 端点。

---

## 内置工具

| 工具 | 功能 |
|------|------|
| `python_repl` | 执行 Python 代码（Pyodide 运行时） |
| `javascript_repl` | 执行 JavaScript / TypeScript 代码 |
| `php_repl` | 执行 PHP 代码（php-wasm） |
| `read_file` / `write_file` | VFS 文件读写 |
| `list_files` / `delete_file` | VFS 目录管理 |
| `search_web` | 网络搜索（需配置 Search API Key） |
| `update_memory` | 演化系统提示词记忆 |
| `custom_input` | 向用户发起自定义输入请求 |

---

## 快速开始

### 环境要求

- **Node.js** 18+ 或 **Bun**（推荐）
- 一个 LLM API Key（OpenAI / Anthropic / Gemini）

### 安装依赖

```bash
git clone https://github.com/NewCity-Soft/NeaiChat.git
cd NeaiChat

# 使用 Bun（推荐）
bun install

# 或使用 npm / pnpm / yarn
npm install
# pnpm install
# yarn install
```

### 启动开发服务器

```bash
bun run dev
```

访问 http://localhost:3000，在设置面板中配置你的 API Key 即可开始对话。

### 构建生产版本

```bash
bun run build
```

产物输出至 `dist/` 目录，为单文件 HTML（所有资源内联），可直接部署到任意静态托管服务。

---

## 部署

### 本地运行

```bash
bun run preview   # 预览构建产物
```

### Vercel / Netlify / Cloudflare Pages

```bash
bun run build
# 将 dist/ 目录部署至任意静态托管平台
```

### Electron / Tauri 打包（桌面应用）

本项目可配合 [Tauri](https://tauri.app) 或 [Electron](https://www.electronjs.org) 打包为桌面客户端，生成 `.exe` / `.dmg` / `.AppImage` 等格式。

---

## 配置说明

所有配置在应用内「设置」面板完成，主要选项：

| 配置项 | 说明 |
|--------|------|
| `API Key` | 模型服务认证密钥 |
| `API URL` | 模型端点（默认 `https://api.openai.com/v1`） |
| `模型` | 使用的模型名称 |
| `系统提示词` | 自定义系统指令 |
| `Temperature` | 输出随机性（0~2） |
| `Max Tokens` | 单次响应最大 Token 数 |
| `协议` | `auto` 自动检测，或手动指定 OpenAI / Anthropic / Gemini |
| `主题模式` | 亮色 / 暗色 / 跟随系统 |
| `预热 Pyodide` | 启动时提前加载 Python 运行时（首次代码执行更快） |
| `导出模式` | 允许导出 / 需授权 / 禁用 |

---

## 目录结构

```
NeaiChat/
├── src/
│   ├── components/
│   │   ├── ChatArea.tsx          # 对话主区域（消息渲染、工具调用展示）
│   │   ├── ChatInput.tsx         # 输入框（文本 / 语音 / 附件）
│   │   ├── Sidebar.tsx           # 左侧会话列表
│   │   ├── SettingsModal.tsx     # 设置面板
│   │   ├── VFSModal.tsx          # 虚拟文件系统管理
│   │   ├── CodeRunnerModal.tsx   # 代码执行窗口
│   │   ├── MermaidRenderer.tsx   # Mermaid 图表渲染
│   │   ├── ExportModal.tsx       # 对话导出（Markdown / JSON）
│   │   └── ...
│   ├── services/
│   │   ├── llm-engine.ts         # 多协议 LLM 引擎（核心）
│   │   ├── llm.ts               # LLM 服务封装
│   │   ├── tools.ts             # 工具函数实现（代码执行 / VFS / 搜索等）
│   │   └── speech-service.ts    # 语音识别服务
│   ├── hooks/
│   │   ├── useLocalStorage.ts   # 持久化存储 Hook
│   │   └── useDeviceScreen.ts   # 设备屏幕适配 Hook
│   ├── utils/
│   │   ├── vfs.ts               # 虚拟文件系统
│   │   ├── token-utils.ts       # Token 估算
│   │   ├── compress-utils.ts    # 对话压缩逻辑
│   │   └── ...
│   ├── types.ts                 # TypeScript 类型定义
│   ├── App.tsx                  # 应用主组件
│   ├── main.tsx                 # 入口
│   └── index.css                # 全局样式
├── public/                      # 静态资源
├── package.json
├── vite.config.ts
├── tsconfig.json
├── .env.example
└── README.md
```

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite 6 |
| 包管理器 | Bun（兼容 npm / pnpm / yarn） |
| 样式 | Tailwind CSS v4 |
| 动画 | Motion（Framer Motion） |
| 代码高亮 | Prism.js / react-syntax-highlighter |
| 数学公式 | KaTeX + remark-math / rehype-katex |
| 图表 | Mermaid |
| 单文件构建 | vite-plugin-singlefile |

---

## 贡献指南

欢迎提交 Issue 和 Pull Request！

```bash
# 1. Fork 本仓库
# 2. 创建分支
git checkout -b feat/your-feature
# 3. 提交变更
git commit -m "feat: add xxx"
# 4. 推送并创建 PR
git push origin feat/your-feature
```

---

## 许可证

本项目采用 [MIT 许可证](LICENSE)。

---

## 联系方式

如有问题或建议，请在 [GitHub Issues](https://github.com/NewCity-Soft/NeaiChat/issues) 中提出。
