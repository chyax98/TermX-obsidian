import { App, TFile, TFolder, TAbstractFile } from 'obsidian';
import type { Terminal } from '@xterm/xterm';
import { getVaultPath } from './types';

export class DragDropHandler {
  private terminal: Terminal;
  private app: App;
  private container: HTMLElement;
  private vaultPath: string;
  private writeToShell: (data: string) => void;
  private readonly handleDragOver = (e: DragEvent) => this.onDragOver(e);
  private readonly handleDrop = (e: DragEvent) => { void this.onDrop(e); };
  private readonly handleDragLeave = (e: DragEvent) => this.onDragLeave(e);

  constructor(terminal: Terminal, container: HTMLElement, app: App, writeToShell: (data: string) => void) {
    this.terminal = terminal;
    this.container = container;
    this.app = app;
    this.writeToShell = writeToShell;
    this.vaultPath = getVaultPath(app);
    this.setup();
  }

  private setup(): void {
    this.container.addEventListener('dragover', this.handleDragOver);
    this.container.addEventListener('drop', this.handleDrop);
    this.container.addEventListener('dragleave', this.handleDragLeave);
  }

  private onDragOver(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.container.classList.add('terminal-drag-over');
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  private onDragLeave(e: DragEvent): void {
    this.container.classList.remove('terminal-drag-over');
  }

  private async onDrop(e: DragEvent): Promise<void> {
    e.preventDefault();
    e.stopPropagation();
    this.container.classList.remove('terminal-drag-over');

    if (!e.dataTransfer) return;

    const paths: string[] = [];

    // 优先处理系统文件拖拽（从 Finder 等）
    if (e.dataTransfer.files.length > 0) {
      // 使用 Electron 官方 API 获取文件路径（更规范）
      let webUtils: any = null;
      try {
        const electron = require('electron');
        webUtils = electron.webUtils;
      } catch {
        // Electron API 不可用，回退到 file.path
      }

      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i];
        let filePath: string | null = null;

        // 优先使用 webUtils.getPathForFile()（Electron 官方 API）
        if (webUtils?.getPathForFile) {
          try {
            filePath = webUtils.getPathForFile(file);
          } catch {
            // 回退
          }
        }

        // 回退到 file.path（Electron 扩展属性）
        if (!filePath && (file as any).path) {
          filePath = (file as any).path;
        }

        if (filePath) {
          paths.push(filePath);
        }
      }
    }

    // 处理 Obsidian 内部拖拽（从文件树）
    if (paths.length === 0) {
      const data = e.dataTransfer.getData('text/plain');
      if (data) {
        const filePath = this.parseObsidianDrag(data);
        if (filePath) {
          paths.push(this.getFullPath(filePath));
        }
      }
    }

    // 插入路径到终端
    if (paths.length > 0) {
      const escaped = paths.map(p => this.escapePath(p)).join(' ');
      this.writeToShell(escaped);
    }
  }

  // 解析 Obsidian 拖拽数据
  private parseObsidianDrag(data: string): string | null {
    // 格式1: obsidian://open?vault=xxx&file=path%2Fto%2Ffile
    if (data.startsWith('obsidian://')) {
      try {
        const url = new URL(data);
        const filePath = url.searchParams.get('file');
        if (filePath) {
          const decoded = decodeURIComponent(filePath);
          return this.findFileByPath(decoded);
        }
      } catch {
        // 解析失败
      }
    }

    // 格式2: 直接是名称或路径
    return this.findFileByPath(data);
  }

  // 查找文件/文件夹，支持完整路径或仅名称
  private findFileByPath(nameOrPath: string): string | null {
    // 1. 直接路径查找
    let file = this.app.vault.getAbstractFileByPath(nameOrPath);
    if (file) return file.path;

    // 2. 尝试加 .md 后缀
    file = this.app.vault.getAbstractFileByPath(nameOrPath + '.md');
    if (file) return file.path;

    // 3. 仅名称时，搜索整个 vault
    const allFiles = this.app.vault.getAllLoadedFiles();
    for (const f of allFiles) {
      if (f.name === nameOrPath || f.name === nameOrPath + '.md') {
        return f.path;
      }
    }

    return null;
  }

  private getFullPath(relativePath: string): string {
    const path = require('path');
    return path.join(this.vaultPath, relativePath);
  }

  private escapePath(p: string): string {
    if (process.platform === 'win32') {
      // Windows: 用双引号包裹
      if (p.includes(' ') || p.includes('&') || p.includes('^')) {
        return `"${p}"`;
      }
      return p;
    } else {
      // Unix: 用单引号包裹（更简洁，只需转义单引号）
      if (p.includes("'")) {
        return `'${p.replace(/'/g, "'\\''")}'`;
      }
      return `'${p}'`;
    }
  }

  destroy(): void {
    this.container.removeEventListener('dragover', this.handleDragOver);
    this.container.removeEventListener('drop', this.handleDrop);
    this.container.removeEventListener('dragleave', this.handleDragLeave);
  }
}
