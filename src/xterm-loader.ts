import type { Terminal as XtermTerminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { SearchAddon } from '@xterm/addon-search';

type XtermModule = typeof import('@xterm/xterm');
type FitAddonModule = typeof import('@xterm/addon-fit');
type SearchAddonModule = typeof import('@xterm/addon-search');

function resolveModule(pluginDir: string, modulePath: string): string {
  const path = require('path');
  return path.join(pluginDir, 'node_modules', modulePath);
}

export function loadXterm(pluginDir: string): XtermModule {
  return require(resolveModule(pluginDir, '@xterm/xterm')) as XtermModule;
}

export function loadFitAddon(pluginDir: string): FitAddonModule {
  return require(resolveModule(pluginDir, '@xterm/addon-fit')) as FitAddonModule;
}

export function loadSearchAddon(pluginDir: string): SearchAddonModule {
  return require(resolveModule(pluginDir, '@xterm/addon-search')) as SearchAddonModule;
}

export type { XtermTerminal, FitAddon, SearchAddon };
