const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const vaultPath = process.env.VAULT_PATH;
if (!vaultPath) {
  console.error('Missing VAULT_PATH env var (vault root path)');
  process.exit(1);
}

const pluginDir = path.join(vaultPath, '.obsidian', 'plugins', 'termx');
const requiredFiles = ['main.js', 'manifest.json', 'styles.css'];

function ensureBuildOutput() {
  const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(projectRoot, file)));
  if (missing.length > 0) {
    execSync('npm run build', { cwd: projectRoot, stdio: 'inherit' });
  }
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(src, dest);
    } else if (entry.isFile()) {
      fs.copyFileSync(src, dest);
    }
  }
}

ensureBuildOutput();

for (const file of requiredFiles) {
  copyFile(path.join(projectRoot, file), path.join(pluginDir, file));
}

copyDir(path.join(projectRoot, 'node_modules', 'node-pty'), path.join(pluginDir, 'node_modules', 'node-pty'));

const xtermRoot = path.join(pluginDir, 'node_modules', '@xterm');
const xtermModules = ['xterm', 'addon-fit', 'addon-search', 'addon-web-links'];
for (const mod of xtermModules) {
  copyDir(
    path.join(projectRoot, 'node_modules', '@xterm', mod),
    path.join(xtermRoot, mod)
  );
}

console.log(`Deployed TermX to ${pluginDir}`);
