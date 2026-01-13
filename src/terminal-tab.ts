import { App } from 'obsidian';
import { Terminal, IDisposable, ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { PtyManager } from './pty-manager';
import { PathLinker } from './path-linker';
import { DragDropHandler } from './drag-drop';
import { ContentBridge, EditorCursorState } from './content-bridge';
import { TerminalSettings, THEMES } from './types';

function resolveCssVarColor(varName: string, fallback: string, kind: 'color' | 'background'): string {
  try {
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.left = '-99999px';
    el.style.top = '0';
    el.style.pointerEvents = 'none';

    if (kind === 'background') {
      el.style.backgroundColor = `var(${varName}, ${fallback})`;
    } else {
      el.style.color = `var(${varName}, ${fallback})`;
    }

    document.body.appendChild(el);
    const style = getComputedStyle(el);
    const value = kind === 'background' ? style.backgroundColor : style.color;
    el.remove();
    return (value || '').trim() || fallback;
  } catch {
    return fallback;
  }
}

function getAutoTheme(): ITheme {
  const isDark = document.body.classList.contains('theme-dark');

  // 完整的 ANSI 颜色定义，确保所有终端颜色都能正确显示
  if (isDark) {
    return {
      background: resolveCssVarColor('--background-primary', '#1e1e1e', 'background'),
      foreground: resolveCssVarColor('--text-normal', '#d4d4d4', 'color'),
      cursor: resolveCssVarColor('--text-normal', '#d4d4d4', 'color'),
      selectionBackground: resolveCssVarColor('--text-selection', 'rgba(255,255,255,0.3)', 'background'),
      selectionForeground: undefined,
      // 标准 ANSI 颜色 (深色主题)
      black: '#000000',
      red: '#cd3131',
      green: '#0dbc79',
      yellow: '#e5e510',
      blue: '#2472c8',
      magenta: '#bc3fbc',
      cyan: '#11a8cd',
      white: '#e5e5e5',
      // Bright ANSI 颜色
      brightBlack: '#666666',   // 关键：dim 文本，必须足够亮
      brightRed: '#f14c4c',
      brightGreen: '#23d18b',
      brightYellow: '#f5f543',
      brightBlue: '#3b8eea',
      brightMagenta: '#d670d6',
      brightCyan: '#29b8db',
      brightWhite: '#ffffff',
    };
  } else {
    return {
      background: resolveCssVarColor('--background-primary', '#fafafa', 'background'),
      foreground: resolveCssVarColor('--text-normal', '#383a42', 'color'),
      cursor: resolveCssVarColor('--text-normal', '#383a42', 'color'),
      selectionBackground: resolveCssVarColor('--text-selection', 'rgba(0,0,0,0.3)', 'background'),
      selectionForeground: undefined,
      // 标准 ANSI 颜色 (浅色主题 - 需要更深的颜色)
      black: '#000000',
      red: '#e45649',
      green: '#50a14f',
      yellow: '#c18401',
      blue: '#4078f2',
      magenta: '#a626a4',
      cyan: '#0184bc',
      white: '#fafafa',
      // Bright ANSI 颜色 (浅色主题)
      brightBlack: '#4a4a4a',   // 关键：在浅色背景下必须足够深
      brightRed: '#e06c75',
      brightGreen: '#98c379',
      brightYellow: '#d19a66',
      brightBlue: '#61afef',
      brightMagenta: '#c678dd',
      brightCyan: '#56b6c2',
      brightWhite: '#ffffff',
    };
  }
}

export class TerminalTab {
  readonly id: number;
  readonly terminal: Terminal;
  readonly fitAddon: FitAddon;
  readonly searchAddon: SearchAddon;
  readonly contentBridge: ContentBridge;

  private ptyManager: PtyManager;
  private pathLinker: PathLinker;
  private dragDropHandler: DragDropHandler | null = null;
  private onDataDisposable: IDisposable | null = null;
  private onResizeDisposable: IDisposable | null = null;
  private onSelectionDisposable: IDisposable | null = null;
  private pasteHandler: ((e: ClipboardEvent) => void) | null = null;
  private container: HTMLElement;
  private app: App;
  private settings: TerminalSettings;
  private exited = false;
  private cwdOverride: string | null = null;
  private pluginDir: string;
  private getCursorState: () => EditorCursorState | null;

  constructor(
    app: App,
    settings: TerminalSettings,
    pluginDir: string,
    getCursorState: () => EditorCursorState | null,
    id: number,
    cwdOverride?: string | null,
  ) {
    this.id = id;
    this.app = app;
    this.settings = settings;
    this.pluginDir = pluginDir;
    this.getCursorState = getCursorState;
    this.cwdOverride = cwdOverride ?? null;

    const theme = settings.theme === 'auto'
      ? getAutoTheme()
      : (THEMES[settings.theme] || THEMES.dark);

    this.terminal = new Terminal({
      fontSize: settings.fontSize,
      fontFamily: settings.fontFamily,
      cursorStyle: settings.cursorStyle,
      cursorBlink: true,
      scrollback: settings.scrollback,
      theme,
      letterSpacing: 0,  // 明确设置字符间距为 0
      lineHeight: 1.0,   // 设置行高为 1.0（紧凑模式）
    });

    this.fitAddon = new FitAddon();
    this.searchAddon = new SearchAddon();
    this.pathLinker = new PathLinker(app);
    this.ptyManager = new PtyManager(app, settings, pluginDir);

    this.terminal.loadAddon(this.fitAddon);
    this.terminal.loadAddon(this.searchAddon);
    this.terminal.loadAddon(this.pathLinker);

    this.contentBridge = new ContentBridge(this.terminal, app, this.getCursorState);

    // 常用快捷键（macOS）
    this.terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      if (event.type !== 'keydown') return true;

      // Cmd+Delete: 删除整行 (Ctrl+U)
      if (event.metaKey && event.key === 'Backspace') {
        this.ptyManager.write('\x15'); // Ctrl+U
        return false;
      }

      if (!event.metaKey) return true;

      const key = event.key.toLowerCase();
      if (key === 'c') {
        const sel = this.terminal.getSelection();
        if (sel) {
          void navigator.clipboard.writeText(sel).catch(() => null);
          return false;
        }
        return true;
      }

      // 注意：不处理 Cmd+V，让 xterm.js 内置粘贴处理
      // 避免重复粘贴

      if (key === 'k') {
        this.ptyManager.write('\x0c'); // Ctrl+L 清屏
        return false;
      }

      return true;
    });

    // 选中自动复制（可动态开关）
    this.onSelectionDisposable = this.terminal.onSelectionChange(() => {
      if (!this.settings.copyOnSelect) return;
      const sel = this.terminal.getSelection();
      if (!sel) return;
      void navigator.clipboard.writeText(sel).catch(() => null);
    });
  }

  async mount(container: HTMLElement): Promise<void> {
    this.container = container;
    this.terminal.open(container);
    this.fitAddon.fit();

    // mouseup 时才 focus，不打断文本选择
    container.addEventListener('mouseup', (e) => {
      // 如果有选中文本，不 focus（让用户可以复制）
      const selection = this.terminal.getSelection();
      if (selection) return;

      // 没有选中时才 focus
      if (e.target === container || container.contains(e.target as Node)) {
        this.terminal.focus();
      }
    });

    // 阻止浏览器默认的 paste 事件，防止粘贴两次
    this.pasteHandler = (e: ClipboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    container.addEventListener('paste', this.pasteHandler);

    this.dragDropHandler = new DragDropHandler(
      this.terminal, container, this.app, (data) => this.ptyManager.write(data)
    );

    await this.startPty();
  }

  private async startPty(): Promise<void> {
    const { cols, rows } = this.terminal;

    // IMPORTANT: Dispose old listeners FIRST to prevent duplicate event handlers
    if (this.onDataDisposable) {
      this.onDataDisposable.dispose();
      this.onDataDisposable = null;
    }
    if (this.onResizeDisposable) {
      this.onResizeDisposable.dispose();
      this.onResizeDisposable = null;
    }

    await this.ptyManager.spawn(
      (data) => this.terminal.write(data),
      (code) => {
        this.exited = true;
        this.terminal.writeln(`\r\n[进程已退出: ${code}]`);
      },
      cols,
      rows,
      this.cwdOverride ?? undefined
    );

    // Set up new listeners AFTER spawn completes
    this.onDataDisposable = this.terminal.onData((data) => this.ptyManager.write(data));
    this.onResizeDisposable = this.terminal.onResize(({ cols, rows }) => this.ptyManager.resize(cols, rows));
  }

  applySettings(settings: TerminalSettings): void {
    this.settings = settings;

    this.terminal.options.fontSize = settings.fontSize;
    this.terminal.options.fontFamily = settings.fontFamily;
    this.terminal.options.cursorStyle = settings.cursorStyle;
    this.terminal.options.scrollback = settings.scrollback;

    const theme = settings.theme === 'auto'
      ? getAutoTheme()
      : (THEMES[settings.theme] || THEMES.dark);
    this.terminal.options.theme = theme;

    this.fitAddon.fit();
  }

  async restart(cwdOverride?: string | null): Promise<void> {
    if (typeof cwdOverride !== 'undefined') {
      this.cwdOverride = cwdOverride;
    }

    this.exited = false;
    this.ptyManager.kill();
    this.terminal.reset();
    await this.startPty();
    this.terminal.focus();
  }

  fit(): void {
    this.fitAddon.fit();
  }

  // 直接写入 PTY（用于从编辑器发送内容）
  writeToShell(data: string): void {
    this.ptyManager.write(data);
  }

  show(): void {
    this.container?.classList.remove('hidden');
    this.fit();
    this.terminal.focus();
  }

  hide(): void {
    this.container?.classList.add('hidden');
  }

  isExited(): boolean {
    return this.exited;
  }

  dispose(): void {
    this.ptyManager.kill();
    this.dragDropHandler?.destroy();
    this.onDataDisposable?.dispose();
    this.onResizeDisposable?.dispose();
    this.onSelectionDisposable?.dispose();
    // 清理 paste 事件监听器
    if (this.pasteHandler && this.container) {
      this.container.removeEventListener('paste', this.pasteHandler);
    }
    this.pathLinker.dispose();
    this.terminal.dispose();
    // 移除 DOM 容器
    this.container?.remove();
  }
}
