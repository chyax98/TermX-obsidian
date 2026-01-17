import { App, Notice } from 'obsidian';
import { TerminalSettings, getDefaultCwd, getDefaultShell } from './types';

export class PtyManager {
  private pty: any = null;
  private lastNoticeAt = 0;
  private app: App;
  private settings: TerminalSettings;
  private pluginDir: string;

  constructor(app: App, settings: TerminalSettings, pluginDir: string) {
    this.app = app;
    this.settings = settings;
    this.pluginDir = pluginDir;
  }

  async spawn(
    onData: (data: string) => void,
    onExit: (code: number) => void,
    cols: number,
    rows: number,
    cwdOverride?: string,
  ): Promise<void> {
    try {
      let exited = false;
      const safeExit = (code: number): void => {
        if (exited) return;
        exited = true;
        onExit(code);
      };

      // 获取 node-pty (从插件目录加载)
      let nodePty: any;
      try {
        const path = require('path');
        const nodePtyPath = path.join(this.pluginDir, 'node_modules', 'node-pty');
        nodePty = require(nodePtyPath);
      } catch (e) {
        console.error('[TermX] 无法加载 node-pty:', e);
        this.noticeOnce('TermX：无法加载 node-pty 模块');
        onData('\r\n[x] 无法加载 node-pty 模块\r\n');
        onData(`    插件目录: ${this.pluginDir}\r\n`);
        onData('    可能需要针对当前 Electron 版本重新编译: npx @electron/rebuild\r\n');
        safeExit(1);
        return;
      }

      // 获取 fs 模块
      let fs: any;
      try {
        fs = require('fs');
      } catch {
        // ignore
      }

      const shell = (this.settings.shell || '').trim() || getDefaultShell();
      let cwd = (cwdOverride || '').trim() || getDefaultCwd(this.app, this.settings);

      // 验证工作目录
      if (fs?.existsSync) {
        try {
          if (!fs.existsSync(cwd)) {
            const fallback = process.env.HOME || process.cwd();
            onData(`\r\n[!] 工作目录不存在，已回退: ${fallback}\r\n`);
            cwd = fallback;
          }
        } catch {
          // ignore
        }
      }

      const shellArgs = (this.settings.shellArgs && this.settings.shellArgs.length > 0)
        ? this.settings.shellArgs
        : this.getDefaultShellArgs(shell);

      // 使用 node-pty 创建 PTY
      this.pty = nodePty.spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env: { ...process.env, TERM: 'xterm-256color' },
      });

      this.pty.onData((data: string) => {
        onData(data);
      });

      this.pty.onExit(({ exitCode }: { exitCode: number }) => {
        console.log('[TermX] 进程退出，代码:', exitCode);
        safeExit(exitCode);
      });

    } catch (error) {
      console.error('[TermX] 启动失败:', error);
      this.noticeOnce('TermX：无法启动终端，请打开开发者控制台查看日志');
      onData(`\r\n[x] 无法启动 shell: ${error}\r\n`);
      onData(`\r\n提示: TermX 需要 Obsidian 桌面版，不支持移动端\r\n`);
      onExit(1);
    }
  }

  write(data: string): void {
    if (this.pty) {
      this.pty.write(data);
    }
  }

  resize(cols: number, rows: number): void {
    if (this.pty) {
      try {
        this.pty.resize(cols, rows);
      } catch {
        // ignore
      }
    }
  }

  kill(): void {
    if (this.pty) {
      this.pty.kill();
      this.pty = null;
    }
  }

  get pid(): number | null {
    return this.pty?.pid ?? null;
  }

  private getDefaultShellArgs(shell: string): string[] {
    const shellBasename = shell.split(/[\\/]/).pop()?.toLowerCase() ?? '';
    if (shellBasename === 'zsh' || shellBasename === 'bash' || shellBasename === 'fish') {
      return ['-l'];
    }
    return [];
  }

  private noticeOnce(message: string): void {
    const now = Date.now();
    if (now - this.lastNoticeAt < 2000) return;
    this.lastNoticeAt = now;
    try {
      new Notice(message);
    } catch {
      // ignore
    }
  }
}
