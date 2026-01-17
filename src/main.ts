import { Plugin, WorkspaceLeaf, MarkdownView, EventRef } from 'obsidian';
import { TerminalView, TERMINAL_VIEW_TYPE } from './terminal-view';
import { TerminalSettingTab } from './settings';
import { TerminalSettings, DEFAULT_SETTINGS, getVaultPath, TerminalSession } from './types';
import { EditorCursorState } from './content-bridge';

export default class IntegratedTerminalPlugin extends Plugin {
  settings: TerminalSettings = DEFAULT_SETTINGS;
  private session: TerminalSession | null = null;  // 待恢复的会话
  private pendingInitialCwd: string | null = null;
  private lastCursorState: EditorCursorState | null = null;
  private cursorTrackEvents: EventRef[] = [];

  private getPluginDir(): string {
    const path = require('path');
    return path.join(getVaultPath(this.app), '.obsidian', 'plugins', this.manifest.id);
  }

  async onload(): Promise<void> {
    await this.loadSettings();

    const pluginDir = this.getPluginDir();

    // 光标追踪（只注册一次）
    this.setupCursorTracking();

    // 注册视图
    this.registerView(TERMINAL_VIEW_TYPE, (leaf) => {
      const pendingSession = this.settings.restoreSession ? this.consumeSession() : null;
      return new TerminalView(
        leaf,
        this.settings,
        pluginDir,
        () => this.lastCursorState,
        () => this.consumePendingInitialCwd(),
        pendingSession,
        (session) => this.saveSession(session),
      );
    });

    // 添加命令
    this.addCommand({
      id: 'open-terminal',
      name: '打开终端',
      callback: () => this.activateView(),
    });

    this.addCommand({
      id: 'toggle-terminal',
      name: '切换终端 (显示/隐藏)',
      callback: () => this.toggleTerminal(),
    });

    this.addCommand({
      id: 'open-terminal-here',
      name: '在当前文件目录打开终端',
      callback: () => this.openTerminalAtCurrentFile(),
    });

    this.addCommand({
      id: 'send-selection-to-terminal',
      name: '发送选中内容到终端',
      editorCallback: (editor) => {
        const selection = editor.getSelection();
        if (selection) {
          this.sendToTerminal(selection);
        }
      },
    });

    // 终端操作命令
    this.addCommand({
      id: 'new-terminal-tab',
      name: '新建终端标签',
      callback: () => this.getTerminalView()?.createNewTab(),
    });

    this.addCommand({
      id: 'close-terminal-tab',
      name: '关闭当前终端标签',
      callback: () => this.getTerminalView()?.closeCurrentTab(),
    });

    this.addCommand({
      id: 'clear-terminal',
      name: '清屏',
      callback: () => this.getTerminalView()?.clearTerminal(),
    });

    this.addCommand({
      id: 'terminal-search',
      name: '终端搜索',
      callback: () => this.getTerminalView()?.showSearch(),
    });

    this.addCommand({
      id: 'terminal-selection-to-note',
      name: '终端选中内容 → 当前笔记',
      callback: () => this.getTerminalView()?.sendSelectionToNote(),
    });

    // 添加右键菜单
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, editor) => {
        const selection = editor.getSelection();
        if (selection) {
          menu.addItem((item) => {
            item.setTitle('发送到终端')
              .setIcon('terminal')
              .onClick(() => this.sendToTerminal(selection));
          });
        }
      })
    );

    // 添加设置面板
    this.addSettingTab(new TerminalSettingTab(this.app, this));

    // 添加 Ribbon 图标
    // 添加侧边栏图标（使用 terminal-square 图标，方形终端设计）
    this.addRibbonIcon('terminal-square', '打开终端', () => this.activateView());
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;

    let leaf = workspace.getLeavesOfType(TERMINAL_VIEW_TYPE)[0];

    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        leaf = rightLeaf;
        await leaf.setViewState({ type: TERMINAL_VIEW_TYPE, active: true });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  private async openTerminalAtCurrentFile(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      await this.activateView();
      return;
    }

    const folder = file.parent?.path || '';
    const fullPath = require('path').join(getVaultPath(this.app), folder);

    const view = this.getTerminalView();
    if (view) {
      await this.activateView();
      await view.createNewTab(fullPath);
      return;
    }

    this.pendingInitialCwd = fullPath;
    await this.activateView();
  }

  private sendToTerminal(text: string): void {
    const view = this.getTerminalView();
    if (view) {
      view.sendToTerminal(text);
    }
  }

  private getTerminalView(): TerminalView | null {
    const leaves = this.app.workspace.getLeavesOfType(TERMINAL_VIEW_TYPE);
    if (leaves.length > 0) {
      return leaves[0].view as TerminalView;
    }
    return null;
  }

  private async toggleTerminal(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(TERMINAL_VIEW_TYPE);

    if (leaves.length > 0) {
      // 终端已存在，检查是否可见
      const leaf = leaves[0];
      const isVisible = this.app.workspace.getActiveViewOfType(TerminalView) !== null;

      if (isVisible) {
        // 当前可见，关闭它
        leaf.detach();
      } else {
        // 存在但不可见，显示它
        this.app.workspace.revealLeaf(leaf);
      }
    } else {
      // 不存在，创建新的
      await this.activateView();
    }
  }

  async loadSettings(): Promise<void> {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    if (!this.settings.lineHeightScale) {
      this.settings.lineHeightScale = DEFAULT_SETTINGS.lineHeightScale;
    }
    // 加载会话（与设置分开存储）
    if (data?.session) {
      this.session = data.session;
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData({ ...this.settings, session: this.session });
    this.applySettingsToViews();
  }

  applySettingsToViews(): void {
    const leaves = this.app.workspace.getLeavesOfType(TERMINAL_VIEW_TYPE);
    for (const leaf of leaves) {
      const view = leaf.view as TerminalView;
      view.updateSettings(this.settings);
    }
  }

  async restartActiveTerminal(): Promise<void> {
    await this.getTerminalView()?.restartCurrentTab();
  }

  private consumePendingInitialCwd(): string | null {
    const cwd = this.pendingInitialCwd;
    this.pendingInitialCwd = null;
    return cwd;
  }

  // 消费待恢复的会话（只恢复一次）
  private consumeSession(): TerminalSession | null {
    const session = this.session;
    this.session = null;
    return session;
  }

  // 保存会话
  private saveSession(session: TerminalSession): void {
    this.session = session;
    // 异步保存到磁盘（防抖已由调用方处理）
    void this.saveData({ ...this.settings, session });
  }

  // 清除已保存的会话（用户关闭"恢复会话"开关时调用）
  clearSavedSession(): void {
    this.session = null;
  }

  private setupCursorTracking(): void {
    // 保存当前编辑器光标位置
    const saveCursor = () => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view?.file) return;
      this.lastCursorState = {
        filePath: view.file.path,
        cursor: view.editor.getCursor(),
      };
    };

    // 切换视图时保存
    this.cursorTrackEvents.push(
      this.app.workspace.on('active-leaf-change', () => {
        setTimeout(saveCursor, 10);
      })
    );

    // 编辑器内容变化时保存
    this.cursorTrackEvents.push(
      this.app.workspace.on('editor-change', saveCursor)
    );
  }

  onunload(): void {
    // 清理事件监听
    this.cursorTrackEvents.forEach((ref) => this.app.workspace.offref(ref));
    this.cursorTrackEvents = [];
  }
}
