# TermX

Obsidian 集成终端插件，简洁实用。

## 特性

- **多标签终端** - 支持多个终端标签，快速切换
- **会话恢复** - 重启 Obsidian 后自动恢复终端标签与工作目录
- **内容互传** - 编辑器 ↔ 终端双向内容传输
- **文件拖拽** - 从文件树拖拽文件/文件夹，自动插入路径
- **链接点击** - 终端内 URL、文件路径可点击跳转
- **主题跟随** - 自动跟随 Obsidian 深浅色主题，字体/行高与编辑器对齐
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

- **外观**：主题、字体、字体大小、行高比例、光标样式
- **行为**：选中自动复制、滚动缓冲行数
- **启动**：Shell 程序、默认工作目录

## 安装

### 从 Release 安装

1. 下载 Release
2. 解压到 `.obsidian/plugins/termx/`，确保包含：
    - `main.js`
    - `manifest.json`
    - `styles.css`
    - `node_modules/node-pty/` (原生模块目录)
    - `node_modules/@xterm/` (xterm 依赖)
3. 重启 Obsidian，启用插件

### 从源码构建

```bash
# 构建
npm run build

# 部署到本地 vault（设置 VAULT_PATH 环境变量）
VAULT_PATH="/path/to/vault" npm run deploy
```

### 开发

```bash
# 类型检查
npm run lint

# 构建
npm run build

# 重新编译原生模块（针对当前 Electron 版本）
npx @electron/rebuild
```


## 兼容性

| 平台 | 支持 |
|------|------|
| macOS (Apple Silicon) | ✅ |
| macOS (Intel) | ❌ |
| Windows | ❌ |
| Linux | ❌ |

> `node-pty` 是原生模块，需要针对特定平台和 Electron 版本编译。当前仅支持 macOS Apple Silicon + Obsidian 1.7+。

## 技术栈

- [xterm.js](https://xtermjs.org/) - 终端模拟器（externalized，避免打包问题）
- [node-pty](https://github.com/microsoft/node-pty) - PTY 支持（原生模块，需针对 Electron 版本编译）
- esbuild - 打包与压缩（禁用标识符压缩以避免运行时 ReferenceError）

## License

MIT
