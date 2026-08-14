import { VFSItem } from './vfs';

export interface ProjectTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  defaultTitle: string;
  initialPrompt: string;
  getFiles: (projectName: string) => VFSItem[];
}

export const CODING_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'vanilla-spa',
    name: '经典 HTML5/JS/CSS SPA',
    category: '基础模版',
    description: '从空白 VFS 架构出结构清晰的原生 HTML5、CSS 样式与 JavaScript 驱动的单页面应用。',
    defaultTitle: '我的 HTML/JS SPA',
    initialPrompt: '请帮我在空的 VFS 中编写一个包含结构、样式与动态交互的任务管理 SPA 应用。',
    getFiles: () => [] // 从空 VFS 开始，由 AI 自动生成代码
  },
  {
    id: 'data-studio',
    name: '数据处理与图表分析 Studio',
    category: '数据分析',
    description: '从空白 VFS 开始，让 AI 接入 Chart.js 与 CSV/JSON 解析生成数据仪表盘。',
    defaultTitle: '数据可视与分析工作室',
    initialPrompt: '请帮我在空的 VFS 中实现一个可粘贴 CSV 数据并在线生成交互图表的 SPA 应用。',
    getFiles: () => [] // 从空 VFS 开始，由 AI 自动生成代码
  },
  {
    id: 'canvas-game',
    name: '2D Canvas 交互与图形引擎',
    category: '游戏 & 创作',
    description: '空白 VFS 架构 2D Canvas 动画与物理按键交互小游戏。',
    defaultTitle: 'Canvas 互动小游戏',
    initialPrompt: '请帮我在空的 VFS 中编写一个 2D Canvas 弹球碰撞小游戏，包含计分与响应式控制。',
    getFiles: () => [] // 从空 VFS 开始，由 AI 自动生成代码
  }
];
