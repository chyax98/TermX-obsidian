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

  return {
    background: resolveCssVarColor('--background-primary', isDark ? '#1e1e1e' : '#fafafa', 'background'),
    foreground: resolveCssVarColor('--text-normal', isDark ? '#d4d4d4' : '#383a42', 'color'),
    cursor: resolveCssVarColor('--text-normal', isDark ? '#d4d4d4' : '#383a42', 'color'),
    selectionBackground: resolveCssVarColor('--text-selection', isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)', 'background'),
    selectionForeground: undefined, // Let xterm use the default foreground color
  };
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

      if (key === 'v') {
        void navigator.clipboard.readText()
          .then((text) => this.ptyManager.write(text))
          .catch(() => null);
        return false;
      }

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
    this.pathLinker.dispose();
    this.terminal.dispose();
    // 移除 DOM 容器
    this.container?.remove();
  }
}
