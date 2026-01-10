import { ItemView, WorkspaceLeaf, Menu, Modal, App } from 'obsidian';
import { TerminalTab } from './terminal-tab';
import { TerminalSettings, getVaultPath } from './types';
import { EditorCursorState } from './content-bridge';

export const TERMINAL_VIEW_TYPE = 'integrated-terminal';

class SearchModal extends Modal {
  private onSearch: (value: string, direction: 'next' | 'prev') => void;
  private inputEl: HTMLInputElement;

  constructor(app: App, onSearch: (value: string, direction: 'next' | 'prev') => void) {
    super(app);
    this.onSearch = onSearch;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('terminal-search-modal');

    const inputContainer = contentEl.createDiv({ cls: 'terminal-search-input-container' });
    this.inputEl = inputContainer.createEl('input', {
      type: 'text',
      placeholder: '搜索终端内容...',
      cls: 'terminal-search-input',
    });
    this.inputEl.style.width = '100%';
    this.inputEl.style.padding = '8px';
    this.inputEl.style.marginBottom = '10px';

    const btnContainer = contentEl.createDiv({ cls: 'terminal-search-btns' });
    btnContainer.style.display = 'flex';
    btnContainer.style.gap = '8px';

    const prevBtn = btnContainer.createEl('button', { text: '上一个' });
    const nextBtn = btnContainer.createEl('button', { text: '下一个', cls: 'mod-cta' });

    prevBtn.onclick = () => this.doSearch('prev');
    nextBtn.onclick = () => this.doSearch('next');

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.doSearch(e.shiftKey ? 'prev' : 'next');
      }
    });

    this.inputEl.focus();
  }

  private doSearch(direction: 'next' | 'prev'): void {
    const value = this.inputEl.value.trim();
    if (value) {
      this.onSearch(value, direction);
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class TerminalView extends ItemView {
  private tabs: TerminalTab[] = [];
  private activeTab: TerminalTab | null = null;
  private settings: TerminalSettings;
  private pluginDir: string;
  private getCursorState: () => EditorCursorState | null;
  private tabBar: HTMLElement | null = null;
  private terminalArea: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private getInitialCwd: (() => string | null) | null = null;
  private bodyClassObserver: MutationObserver | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    settings: TerminalSettings,
    pluginDir: string,
    getCursorState: () => EditorCursorState | null,
    getInitialCwd?: () => string | null,
  ) {
    super(leaf);
    this.settings = settings;
    this.pluginDir = pluginDir;
    this.getCursorState = getCursorState;
    this.getInitialCwd = getInitialCwd ?? null;
  }

  // Get next available tab number
  private getNextTabId(): number {
    const usedIds = new Set(this.tabs.map(t => t.id));
    let id = 1;
    while (usedIds.has(id)) {
      id++;
    }
    return id;
  }

  getViewType(): string {
    return TERMINAL_VIEW_TYPE;
  }

  getDisplayText(): string {
    return '终端';
  }

  getIcon(): string {
    return 'terminal-square';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('terminal-view-container');

    // 标签栏（包含标签 + 加号 + 搜索）
    this.tabBar = container.createDiv({ cls: 'terminal-tab-bar' });

    // 终端区域
    this.terminalArea = container.createDiv({ cls: 'terminal-area' });

    // 监听大小变化
    this.resizeObserver = new ResizeObserver(() => this.activeTab?.fit());
    this.resizeObserver.observe(this.terminalArea);

    // 跟随 Obsidian 深浅色切换（仅 auto 主题时）
    this.bodyClassObserver = new MutationObserver(() => {
      if (this.settings.theme !== 'auto') return;
      this.tabs.forEach((t) => t.applySettings(this.settings));
    });
    this.bodyClassObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // 创建第一个标签
    const initialCwd = this.getInitialCwd?.() ?? null;
    await this.createTab(initialCwd ?? undefined);
  }

  private getCurrentFileCwd(): string | null {
    const file = this.app.workspace.getActiveFile();
    if (!file) return null;
    const folder = file.parent?.path || '';
    const vaultPath = getVaultPath(this.app);
    if (!vaultPath) return null;
    return require('path').join(vaultPath, folder);
  }

  private async createTab(cwdOverride?: string): Promise<void> {
    if (!this.terminalArea) return;

    const tabId = this.getNextTabId();
    const tab = new TerminalTab(this.app, this.settings, this.pluginDir, this.getCursorState, tabId, cwdOverride ?? null);
    this.tabs.push(tab);

    // 创建终端容器
    const container = this.terminalArea.createDiv({ cls: 'terminal-wrapper' });
    await tab.mount(container);

    // 右键菜单
    this.setupContextMenu(tab, container);

    this.switchTab(tab);
    this.renderTabBar();
  }

  private switchTab(tab: TerminalTab): void {
    this.tabs.forEach(t => t.hide());
    tab.show();
    this.activeTab = tab;
  }

  private renderTabBar(): void {
    if (!this.tabBar) return;
    this.tabBar.empty();

    // 左侧：标签容器
    const tabsContainer = this.tabBar.createDiv({ cls: 'terminal-tabs' });
    const canClose = this.tabs.length > 1;

    this.tabs.forEach((tab) => {
      const tabEl = tabsContainer.createDiv({ cls: 'terminal-tab' });
      if (tab === this.activeTab) tabEl.addClass('active');

      const label = tabEl.createSpan({ text: `终端 ${tab.id}` });
      if (tab.isExited()) label.addClass('exited');

      tabEl.onclick = () => {
        this.switchTab(tab);
        this.renderTabBar();
      };

      if (canClose) {
        const closeBtn = tabEl.createSpan({ text: '×', cls: 'tab-close' });
        closeBtn.onclick = (e) => {
          e.stopPropagation();
          this.closeTab(tab);
        };
      }
    });

    // 加号按钮（紧跟标签）
    const addBtn = tabsContainer.createDiv({ cls: 'terminal-tab-add' });
    addBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
    addBtn.title = '新建标签';
    addBtn.onclick = () => void this.createTab();

    // 右侧：搜索按钮
    const searchBtn = this.tabBar.createDiv({ cls: 'terminal-tab-search' });
    searchBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
    searchBtn.title = '搜索';
    searchBtn.onclick = () => this.showSearch();
  }

  private closeTab(tab: TerminalTab): void {
    // 只有一个标签时不允许关闭
    if (this.tabs.length <= 1) return;

    const idx = this.tabs.indexOf(tab);
    if (idx === -1) return;

    tab.dispose();
    this.tabs.splice(idx, 1);

    if (tab === this.activeTab) {
      this.switchTab(this.tabs[Math.min(idx, this.tabs.length - 1)]);
    }
    this.renderTabBar();
  }

  private setupContextMenu(tab: TerminalTab, container: HTMLElement): void {
    container.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const menu = new Menu();

      // 基础操作
      menu.addItem((item) =>
        item.setTitle('复制').setIcon('copy').onClick(() => {
          const sel = tab.terminal.getSelection();
          if (sel) navigator.clipboard.writeText(sel);
        })
      );

      menu.addItem((item) =>
        item.setTitle('粘贴').setIcon('clipboard-paste').onClick(async () => {
          const text = await navigator.clipboard.readText();
          tab.writeToShell(text);
        })
      );

      menu.addSeparator();

      // 终端操作
      menu.addItem((item) =>
        item.setTitle('清屏').setIcon('trash-2').onClick(() => {
          tab.terminal.clear();
        })
      );

      menu.addItem((item) =>
        item.setTitle('搜索').setIcon('search').onClick(() => {
          this.showSearch();
        })
      );

      menu.addSeparator();

      // 标签操作
      menu.addItem((item) =>
        item.setTitle('在当前文件目录新建').setIcon('folder-plus').onClick(() => {
          const cwd = this.getCurrentFileCwd();
          void this.createTab(cwd ?? undefined);
        })
      );

      menu.addItem((item) =>
        item.setTitle('重启终端').setIcon('refresh-cw').onClick(() => {
          void this.restartCurrentTab();
        })
      );

      menu.addSeparator();

      // 内容发送
      menu.addItem((item) =>
        item.setTitle('选中→新笔记').setIcon('file-plus').onClick(() => {
          tab.contentBridge.sendToNewNote();
        })
      );

      menu.addItem((item) =>
        item.setTitle('选中→当前笔记').setIcon('file-input').onClick(() => {
          tab.contentBridge.appendToCurrentNote();
        })
      );

      menu.showAtMouseEvent(e);
    });
  }

  // === 公开方法 ===

  showSearch(): void {
    new SearchModal(this.app, (value, direction) => {
      if (direction === 'next') {
        this.activeTab?.searchAddon.findNext(value);
      } else {
        this.activeTab?.searchAddon.findPrevious(value);
      }
    }).open();
  }

  async createNewTab(cwdOverride?: string): Promise<void> {
    await this.createTab(cwdOverride);
  }

  async restartCurrentTab(): Promise<void> {
    if (!this.activeTab) return;
    await this.activeTab.restart();
  }

  updateSettings(settings: TerminalSettings): void {
    this.settings = settings;
    this.tabs.forEach((t) => t.applySettings(settings));
  }

  closeCurrentTab(): void {
    if (this.activeTab) {
      this.closeTab(this.activeTab);
    }
  }

  clearTerminal(): void {
    this.activeTab?.terminal.clear();
  }

  sendToTerminal(text: string): void {
    if (!text || !this.activeTab) return;
    this.activeTab.writeToShell(text);
  }

  // 终端选中内容发送到当前笔记
  sendSelectionToNote(): void {
    this.activeTab?.contentBridge.appendToCurrentNote();
  }

  async onClose(): Promise<void> {
    this.resizeObserver?.disconnect();
    this.bodyClassObserver?.disconnect();
    this.tabs.forEach(t => t.dispose());
  }
}
