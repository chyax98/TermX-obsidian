import { App, Notice, MarkdownView, EditorPosition } from 'obsidian';
import type { Terminal } from '@xterm/xterm';

// 编辑器光标状态（由 EditorCursorTracker 管理）
export interface EditorCursorState {
  filePath: string;
  cursor: EditorPosition;
}

export class ContentBridge {
  private terminal: Terminal;
  private app: App;
  private getCursorState: () => EditorCursorState | null;

  constructor(terminal: Terminal, app: App, getCursorState: () => EditorCursorState | null) {
    this.terminal = terminal;
    this.app = app;
    this.getCursorState = getCursorState;
    // Removed captureOutput() - we don't need to capture user input
  }

  // 获取终端选中的文本
  getSelection(): string {
    return this.terminal.getSelection();
  }

  // 获取终端全部输出
  getAllOutput(): string {
    const buffer = this.terminal.buffer.active;
    const lines: string[] = [];
    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (line) {
        lines.push(line.translateToString());
      }
    }
    return lines.join('\n');
  }

  // 发送选中内容到新笔记
  async sendToNewNote(content?: string): Promise<void> {
    const text = content || this.getSelection();
    if (!text) {
      new Notice('No content selected');
      return;
    }

    const fileName = `Terminal Output ${Date.now()}.md`;
    const fileContent = this.wrapAsCodeBlock(text);

    const file = await this.app.vault.create(fileName, fileContent);
    await this.app.workspace.openLinkText(file.path, '', true);
    new Notice(`Created: ${fileName}`);
  }

  // 追加到当前笔记（支持标记位置 + 记住的光标位置）
  async appendToCurrentNote(content?: string): Promise<void> {
    const text = content || this.getSelection();
    if (!text) {
      new Notice('没有选中内容');
      return;
    }

    let view: MarkdownView | null = null;
    let targetCursor: EditorPosition | null = null;

    // 优先使用记住的编辑器位置
    const cursorState = this.getCursorState();
    if (cursorState) {
      const leaves = this.app.workspace.getLeavesOfType('markdown');
      for (const leaf of leaves) {
        const v = leaf.view as MarkdownView;
        if (v.file?.path === cursorState.filePath) {
          view = v;
          targetCursor = cursorState.cursor;
          break;
        }
      }
    }

    // 没有记住的位置，尝试当前活跃的
    if (!view) {
      view = this.app.workspace.getActiveViewOfType(MarkdownView);
    }

    // 还是没有，找任意一个
    if (!view) {
      const leaves = this.app.workspace.getLeavesOfType('markdown');
      if (leaves.length > 0) {
        view = leaves[0].view as MarkdownView;
      }
    }

    if (!view) {
      new Notice('没有打开的笔记');
      return;
    }

    const editor = view.editor;
    const fileContent = editor.getValue();

    // 查找标记 <!-- terminal-output -->
    const marker = '<!-- terminal-output -->';
    const markerIndex = fileContent.indexOf(marker);

    const codeBlock = this.wrapAsCodeBlock(text);

    if (markerIndex !== -1) {
      // 在标记后插入
      const insertPos = editor.offsetToPos(markerIndex + marker.length);
      editor.replaceRange('\n' + codeBlock + '\n', insertPos);
      new Notice('已插入到标记位置');
    } else {
      // 使用记住的光标位置，或当前光标位置
      const cursor = targetCursor || editor.getCursor();
      editor.replaceRange('\n' + codeBlock + '\n', cursor);
      new Notice('已插入到光标位置');
    }

    // 让编辑器获得焦点
    this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
  }

  private wrapAsCodeBlock(text: string): string {
    return '```\n' + text.trim() + '\n```';
  }
}
