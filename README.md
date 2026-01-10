# TermX

Obsidian 集成终端插件，简洁实用。

## 特性

- **多标签终端** - 支持多个终端标签，快速切换
- **内容互传** - 编辑器 ↔ 终端双向内容传输
- **文件拖拽** - 从文件树拖拽文件/文件夹，自动插入路径
- **链接点击** - 终端内 URL、文件路径可点击跳转
- **主题跟随** - 自动跟随 Obsidian 深浅色主题
- **搜索** - 终端内容搜索

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Cmd+C` | 复制选中 / SIGINT |
| `Cmd+V` | 粘贴 |
| `Cmd+K` | 清屏 |
| `Cmd+Delete` | 删除整行 |

## 右键菜单

- 复制 / 粘贴
- 清屏 / 搜索
- 在当前文件目录新建终端
- 重启终端
- 选中内容 → 新笔记 / 当前笔记

## 设置

- **外观**：主题、字体、字体大小、光标样式
- **行为**：选中自动复制、滚动缓冲行数
- **启动**：Shell 程序、默认工作目录

## 安装

1. 下载 Release
2. 解压到 `.obsidian/plugins/termx/`，确保包含：
   - `main.js`
   - `manifest.json`
   - `styles.css`
   - `node-pty/` (原生模块目录)
3. 重启 Obsidian，启用插件

> **注意**: `node-pty` 是原生模块，需要与 Obsidian 的 Electron 版本匹配。当前构建适用于 macOS (Apple Silicon)。

## 技术栈

- [xterm.js](https://xtermjs.org/) - 终端模拟器
- [node-pty](https://github.com/microsoft/node-pty) - PTY 支持

## License

MIT
