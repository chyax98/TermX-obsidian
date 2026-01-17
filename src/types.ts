import { App, FileSystemAdapter } from 'obsidian';
import type { ITheme } from '@xterm/xterm';

// 获取 vault 根目录路径
export function getVaultPath(app: App): string {
  if (app.vault.adapter instanceof FileSystemAdapter) {
    return app.vault.adapter.getBasePath();
  }
  return '';
}

export type ThemeName = 'auto' | 'dark' | 'light' | 'dracula' | 'monokai';

export const THEMES: Record<string, ITheme> = {
  auto: {}, // 运行时从 Obsidian 主题读取
  dark: {
    background: '#1e1e1e',
    foreground: '#d4d4d4',
    cursor: '#d4d4d4',
    black: '#000000',
    red: '#cd3131',
    green: '#0dbc79',
    yellow: '#e5e510',
    blue: '#2472c8',
    magenta: '#bc3fbc',
    cyan: '#11a8cd',
    white: '#e5e5e5',
  },
  light: {
    background: '#ffffff',
    foreground: '#383a42',
    cursor: '#383a42',
    black: '#000000',
    red: '#e45649',
    green: '#50a14f',
    yellow: '#c18401',
    blue: '#4078f2',
    magenta: '#a626a4',
    cyan: '#0184bc',
    white: '#fafafa',
  },
  dracula: {
    background: '#282a36',
    foreground: '#f8f8f2',
    cursor: '#f8f8f2',
    black: '#21222c',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2',
  },
  monokai: {
    background: '#272822',
    foreground: '#f8f8f2',
    cursor: '#f8f8f2',
    black: '#272822',
    red: '#f92672',
    green: '#a6e22e',
    yellow: '#f4bf75',
    blue: '#66d9ef',
    magenta: '#ae81ff',
    cyan: '#a1efe4',
    white: '#f8f8f2',
  },
};

// ===== 会话恢复类型 =====

export interface TabSession {
  id: number;
  cwd: string;  // 初始工作目录
}

export interface TerminalSession {
  version: 1;
  tabs: TabSession[];
  activeTabId: number;
}

// ===== 设置类型 =====

export interface TerminalSettings {
  shell: string;
  shellArgs: string[];
  fontSize: number;
  fontFamily: string;
  cursorStyle: 'block' | 'underline' | 'bar';
  scrollback: number;
  copyOnSelect: boolean;
  lineHeightScale: number;
  defaultCwd: 'vault' | 'home' | 'custom';
  customCwd: string;
  theme: ThemeName;
  restoreSession: boolean;  // 是否恢复会话
}

export const DEFAULT_SETTINGS: TerminalSettings = {
  shell: '',
  shellArgs: [],
  fontSize: 14,
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  cursorStyle: 'block',
  scrollback: 5000,
  copyOnSelect: true,
  lineHeightScale: 0.95,
  defaultCwd: 'vault',
  customCwd: '',
  theme: 'auto',
  restoreSession: true,  // 默认启用会话恢复
};

export function getDefaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe';
  }
  return process.env.SHELL || '/bin/bash';
}

export function getDefaultCwd(app: App, settings: TerminalSettings): string {
  switch (settings.defaultCwd) {
    case 'vault':
      return getVaultPath(app) || process.cwd();
    case 'home':
      return process.env.HOME || process.env.USERPROFILE || '/';
    case 'custom':
      return settings.customCwd || process.cwd();
    default:
      return process.cwd();
  }
}
