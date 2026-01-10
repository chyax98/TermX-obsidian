export type LinkType = 'file' | 'url' | 'obsidian' | 'email';

export interface LinkMatch {
  type: LinkType;
  value: string;
  line?: number;
  column?: number;
  start: number;
  end: number;
}

export interface LinkAdapter {
  name: string;
  type: LinkType;
  pattern: RegExp;
  extract: (match: RegExpExecArray, offset: number) => LinkMatch | null;
}

// 通用路径字符
const PATH_CHAR = '[\\w./-]';

export const adapters: LinkAdapter[] = [
  // === URL 链接 ===
  {
    name: 'http-url',
    type: 'url',
    pattern: /https?:\/\/[^\s<>"')\]]+/g,
    extract: (m, offset) => ({
      type: 'url',
      value: m[0],
      start: offset + m.index,
      end: offset + m.index + m[0].length,
    }),
  },

  // === Obsidian 链接 ===
  {
    name: 'obsidian-protocol',
    type: 'obsidian',
    pattern: /obsidian:\/\/[^\s<>"')\]]+/g,
    extract: (m, offset) => ({
      type: 'obsidian',
      value: m[0],
      start: offset + m.index,
      end: offset + m.index + m[0].length,
    }),
  },
  {
    name: 'wikilink',
    type: 'obsidian',
    pattern: /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g,
    extract: (m, offset) => ({
      type: 'obsidian',
      value: m[1],
      start: offset + m.index,
      end: offset + m.index + m[0].length,
    }),
  },

  // === 邮箱 ===
  {
    name: 'email',
    type: 'email',
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    extract: (m, offset) => ({
      type: 'email',
      value: m[0],
      start: offset + m.index,
      end: offset + m.index + m[0].length,
    }),
  },

  // === 文件路径 ===
  // 1. 文件:行:列 (ESLint, ripgrep, TypeScript)
  {
    name: 'file:line:col',
    type: 'file',
    pattern: new RegExp(`(${PATH_CHAR}+\\.\\w+):(\\d+)(?::(\\d+))?`, 'g'),
    extract: (m, offset) => ({
      type: 'file',
      value: m[1],
      line: parseInt(m[2]),
      column: m[3] ? parseInt(m[3]) : undefined,
      start: offset + m.index,
      end: offset + m.index + m[0].length,
    }),
  },

  // 2. TypeScript 格式: file(line,col)
  {
    name: 'typescript',
    type: 'file',
    pattern: new RegExp(`(${PATH_CHAR}+\\.\\w+)\\((\\d+),(\\d+)\\)`, 'g'),
    extract: (m, offset) => ({
      type: 'file',
      value: m[1],
      line: parseInt(m[2]),
      column: parseInt(m[3]),
      start: offset + m.index,
      end: offset + m.index + m[0].length,
    }),
  },

  // 3. Python 格式: File "path", line N
  {
    name: 'python',
    type: 'file',
    pattern: /File "([^"]+)", line (\d+)/g,
    extract: (m, offset) => ({
      type: 'file',
      value: m[1],
      line: parseInt(m[2]),
      start: offset + m.index,
      end: offset + m.index + m[0].length,
    }),
  },

  // 4. Node 堆栈: at /path/file.ts:line:col
  {
    name: 'node-stack',
    type: 'file',
    pattern: /at (?:\S+ \()?([/\\][\w./\\-]+):(\d+):(\d+)\)?/g,
    extract: (m, offset) => ({
      type: 'file',
      value: m[1],
      line: parseInt(m[2]),
      column: parseInt(m[3]),
      start: offset + m.index + 3,
      end: offset + m.index + m[0].length,
    }),
  },

  // 5. Git modified/deleted
  {
    name: 'git-status',
    type: 'file',
    pattern: /(?:modified|deleted|new file):\s+(\S+)/g,
    extract: (m, offset) => ({
      type: 'file',
      value: m[1],
      start: offset + m.index + m[0].indexOf(m[1]),
      end: offset + m.index + m[0].length,
    }),
  },

  // 6. 相对路径 ./path 或 ../path
  {
    name: 'relative',
    type: 'file',
    pattern: new RegExp(`(\\.\\.?/${PATH_CHAR}+)`, 'g'),
    extract: (m, offset) => ({
      type: 'file',
      value: m[1],
      start: offset + m.index,
      end: offset + m.index + m[0].length,
    }),
  },

  // 7. 绝对路径 (Unix)
  {
    name: 'absolute-unix',
    type: 'file',
    pattern: new RegExp(`(/(?:Users|home|tmp|var|etc)/${PATH_CHAR}+\\.\\w+)`, 'g'),
    extract: (m, offset) => ({
      type: 'file',
      value: m[1],
      start: offset + m.index,
      end: offset + m.index + m[0].length,
    }),
  },

  // 8. Windows 路径
  {
    name: 'windows',
    type: 'file',
    pattern: /([A-Za-z]:\\[\w.\\-]+)/g,
    extract: (m, offset) => ({
      type: 'file',
      value: m[1],
      start: offset + m.index,
      end: offset + m.index + m[0].length,
    }),
  },
];
