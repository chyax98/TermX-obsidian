import { App, TFile, MarkdownView } from 'obsidian';
import type { Terminal, ITerminalAddon } from '@xterm/xterm';
import { adapters, LinkMatch } from './path-adapters';
import { getVaultPath } from './types';

export class PathLinker implements ITerminalAddon {
  private terminal: Terminal | null = null;
  private app: App;
  private vaultPath: string;

  constructor(app: App) {
    this.app = app;
    this.vaultPath = getVaultPath(app);
  }

  activate(terminal: Terminal): void {
    this.terminal = terminal;

    terminal.registerLinkProvider({
      provideLinks: (bufferLineNumber, callback) => {
        const line = terminal.buffer.active.getLine(bufferLineNumber);
        if (!line) {
          callback(undefined);
          return;
        }

        const text = line.translateToString();
        const links = this.findLinks(text, bufferLineNumber);
        callback(links.length > 0 ? links : undefined);
      }
    });
  }

  private findLinks(text: string, lineNumber: number): any[] {
    const matches: LinkMatch[] = [];

    for (const adapter of adapters) {
      adapter.pattern.lastIndex = 0;
      let match;
      while ((match = adapter.pattern.exec(text)) !== null) {
        const result = adapter.extract(match, 0);
        if (result) {
          matches.push(result);
        }
      }
    }

    const unique = this.dedupeMatches(matches);

    return unique.map((m) => ({
      range: {
        start: { x: m.start + 1, y: lineNumber + 1 },
        end: { x: m.end + 1, y: lineNumber + 1 },
      },
      text: m.value,
      activate: () => this.handleClick(m),
    }));
  }

  private dedupeMatches(matches: LinkMatch[]): LinkMatch[] {
    const sorted = matches.sort((a, b) => a.start - b.start);
    const result: LinkMatch[] = [];

    for (const m of sorted) {
      const last = result[result.length - 1];
      if (!last || m.start >= last.end) {
        result.push(m);
      }
    }
    return result;
  }

  private async handleClick(match: LinkMatch): Promise<void> {
    const { shell } = require('electron');

    switch (match.type) {
      case 'url':
        shell.openExternal(match.value);
        break;

      case 'email':
        shell.openExternal(`mailto:${match.value}`);
        break;

      case 'obsidian':
        if (match.value.startsWith('obsidian://')) {
          window.open(match.value);
        } else {
          // wikilink
          await this.app.workspace.openLinkText(match.value, '', false);
        }
        break;

      case 'file':
        await this.handleFileClick(match);
        break;
    }
  }

  private async handleFileClick(match: LinkMatch): Promise<void> {
    const vaultFile = this.resolveToVaultFile(match.value);

    if (vaultFile) {
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(vaultFile);

      if (match.line) {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view?.editor) {
          const line = match.line - 1;
          const col = (match.column || 1) - 1;
          view.editor.setCursor({ line, ch: col });
          view.editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
        }
      }
    } else {
      const { shell } = require('electron');
      shell.openPath(match.value);
    }
  }

  private resolveToVaultFile(path: string): TFile | null {
    // 移除 vault 路径前缀
    let relativePath = path;
    if (path.startsWith(this.vaultPath)) {
      relativePath = path.slice(this.vaultPath.length).replace(/^[\/\\]/, '');
    }

    // 尝试在 vault 中查找
    const file = this.app.vault.getAbstractFileByPath(relativePath);
    if (file instanceof TFile) {
      return file;
    }

    // 尝试不带扩展名查找 .md 文件
    const mdFile = this.app.vault.getAbstractFileByPath(relativePath + '.md');
    if (mdFile instanceof TFile) {
      return mdFile;
    }

    return null;
  }

  dispose(): void {
    this.terminal = null;
  }
}
