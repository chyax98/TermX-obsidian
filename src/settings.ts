import { App, PluginSettingTab, Setting } from 'obsidian';
import type IntegratedTerminalPlugin from './main';
import { getDefaultShell, ThemeName } from './types';

const SYSTEM_MONO_STACK = 'var(--font-monospace, monospace)';

const FONT_PRESETS: Record<string, { label: string; stack: string }> = {
  system: { label: '跟随 Obsidian (等宽字体)', stack: SYSTEM_MONO_STACK },
  sfmono: { label: 'SF Mono (macOS)', stack: `'SF Mono', ${SYSTEM_MONO_STACK}` },
  menlo: { label: 'Menlo', stack: `'Menlo', ${SYSTEM_MONO_STACK}` },
  monaco: { label: 'Monaco', stack: `'Monaco', ${SYSTEM_MONO_STACK}` },
  jetbrains: { label: 'JetBrains Mono', stack: `'JetBrains Mono', ${SYSTEM_MONO_STACK}` },
  firacode: { label: 'Fira Code', stack: `'Fira Code', ${SYSTEM_MONO_STACK}` },
  cascadia: { label: 'Cascadia Code', stack: `'Cascadia Code', ${SYSTEM_MONO_STACK}` },
  sourcecodepro: { label: 'Source Code Pro', stack: `'Source Code Pro', ${SYSTEM_MONO_STACK}` },
};

function getFontPresetKey(stack: string): string {
  const normalized = (stack || '').trim();
  for (const [key, preset] of Object.entries(FONT_PRESETS)) {
    if (preset.stack === normalized) return key;
  }
  // 兼容旧默认值 - Menlo 字体栈
  if (normalized === 'Menlo, Monaco, "Courier New", monospace') return 'menlo';
  // 兼容其他旧默认值
  if (normalized === '' || normalized === 'monospace') return 'system';
  return 'menlo';  // 默认显示为 Menlo
}

export class TerminalSettingTab extends PluginSettingTab {
  plugin: IntegratedTerminalPlugin;

  constructor(app: App, plugin: IntegratedTerminalPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ===== 外观 =====
    containerEl.createEl('h3', { text: '外观' });

    new Setting(containerEl)
      .setName('配色主题')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('auto', '跟随 Obsidian')
          .addOption('dark', '深色')
          .addOption('light', '浅色')
          .addOption('dracula', 'Dracula')
          .addOption('monokai', 'Monokai')
          .setValue(this.plugin.settings.theme)
          .onChange(async (value: ThemeName) => {
            this.plugin.settings.theme = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('字体')
      .addDropdown((dropdown) => {
        for (const [key, preset] of Object.entries(FONT_PRESETS)) {
          dropdown.addOption(key, preset.label);
        }
        dropdown
          .setValue(getFontPresetKey(this.plugin.settings.fontFamily))
          .onChange(async (value) => {
            const preset = FONT_PRESETS[value];
            if (!preset) return;
            this.plugin.settings.fontFamily = preset.stack;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('字体大小')
      .addSlider((slider) =>
        slider
          .setLimits(10, 24, 1)
          .setValue(this.plugin.settings.fontSize)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.fontSize = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('光标样式')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('block', '方块')
          .addOption('underline', '下划线')
          .addOption('bar', '竖线')
          .setValue(this.plugin.settings.cursorStyle)
          .onChange(async (value: 'block' | 'underline' | 'bar') => {
            this.plugin.settings.cursorStyle = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('行高比例')
      .setDesc('基于 Obsidian 行高的缩放系数，建议范围 0.90-1.05')
      .addSlider((slider) =>
        slider
          .setLimits(0.85, 1.2, 0.01)
          .setValue(this.plugin.settings.lineHeightScale)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.lineHeightScale = value;
            await this.plugin.saveSettings();
          })
      );

    // ===== 行为 =====
    containerEl.createEl('h3', { text: '行为' });

    new Setting(containerEl)
      .setName('选中自动复制')
      .setDesc('选中文本时自动复制到剪贴板')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.copyOnSelect)
          .onChange(async (value) => {
            this.plugin.settings.copyOnSelect = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('恢复会话')
      .setDesc('重启 Obsidian 后恢复终端标签和工作目录')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.restoreSession)
          .onChange(async (value) => {
            this.plugin.settings.restoreSession = value;
            // 关闭时清除已保存的会话
            if (!value) {
              this.plugin.clearSavedSession();
            }
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('滚动缓冲行数')
      .setDesc('终端保留的历史行数')
      .addSlider((slider) =>
        slider
          .setLimits(1000, 50000, 1000)
          .setValue(this.plugin.settings.scrollback)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.scrollback = value;
            await this.plugin.saveSettings();
          })
      );

    // ===== 启动 =====
    containerEl.createEl('h3', { text: '启动' });
    containerEl.createEl('p', {
      text: '以下设置需要重启终端或新建标签才会生效',
      cls: 'setting-item-description'
    });

    new Setting(containerEl)
      .setName('Shell 程序')
      .setDesc(`留空使用系统默认: ${getDefaultShell()}`)
      .addText((text) => {
        text.inputEl.style.width = '200px';
        text
          .setPlaceholder(getDefaultShell())
          .setValue(this.plugin.settings.shell)
          .onChange(async (value) => {
            this.plugin.settings.shell = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('默认工作目录')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('vault', 'Vault 根目录')
          .addOption('home', '用户主目录')
          .addOption('custom', '自定义路径')
          .setValue(this.plugin.settings.defaultCwd)
          .onChange(async (value: 'vault' | 'home' | 'custom') => {
            this.plugin.settings.defaultCwd = value;
            await this.plugin.saveSettings();
            this.display(); // 刷新以显示/隐藏自定义路径
          })
      );

    // 仅当选择"自定义"时显示
    if (this.plugin.settings.defaultCwd === 'custom') {
      new Setting(containerEl)
        .setName('自定义路径')
        .addText((text) =>
          text
            .setPlaceholder('/path/to/directory')
            .setValue(this.plugin.settings.customCwd)
            .onChange(async (value) => {
              this.plugin.settings.customCwd = value;
              await this.plugin.saveSettings();
            })
        );
    }

    new Setting(containerEl)
      .addButton((btn) =>
        btn
          .setButtonText('重启当前终端')
          .onClick(async () => {
            await this.plugin.restartActiveTerminal();
          })
      );
  }
}
