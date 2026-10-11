const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const cliArgs = process.argv.slice(2);
const platformDir = cliArgs.includes('--win') ? 'windows-x64'
  : (cliArgs.includes('--mac') ? 'macos' : (cliArgs.includes('--linux') ? 'linux' : 'all'));
const distRoot = path.join(root, 'dist');
const finalDir = path.join(distRoot, platformDir);
const unsafeForBuilder = /[&()'";<>|`“”‘’\r\n]/.test(finalDir);
const stageDir = unsafeForBuilder
  ? path.join(os.tmpdir(), `quickdocs-build-${process.pid}-${Date.now()}`)
  : finalDir;

if (path.dirname(finalDir) !== distRoot || !['windows-x64', 'macos', 'linux', 'all'].includes(path.basename(finalDir))) {
  throw new Error(`拒绝使用异常输出目录：${finalDir}`);
}

// macOS 跨构建 Windows 时 npm 只会安装宿主平台的 canvas 可选包；缺少 Win32 DLL 时
// 安装包能生成但图片/PDF OCR 会在用户机器上失败，因此构建前直接拦截。
if (platformDir === 'windows-x64') {
  const winCanvas = path.join(root, 'node_modules', '@napi-rs', 'canvas-win32-x64-msvc', 'skia.win32-x64-msvc.node');
  if (!fs.existsSync(winCanvas)) {
    console.error('缺少 Windows x64 OCR 运行时：@napi-rs/canvas-win32-x64-msvc');
    console.error('请先执行：npm install --no-save --package-lock=false --ignore-scripts --force @napi-rs/canvas-win32-x64-msvc@0.1.100');
    process.exit(1);
  }
}

fs.mkdirSync(stageDir, { recursive: true });
const cli = require.resolve('electron-builder/out/cli/cli.js');
const args = [cli, ...cliArgs, `-c.directories.output=${stageDir}`];
const result = spawnSync(process.execPath, args, { cwd: root, env: process.env, stdio: 'inherit' });

if (result.error || result.status !== 0) {
  if (unsafeForBuilder) fs.rmSync(stageDir, { recursive: true, force: true });
  if (result.error) console.error(result.error.message);
  process.exit(result.status || 1);
}

if (unsafeForBuilder) {
  assertNoBrokenSymlinks(stageDir);
  fs.rmSync(finalDir, { recursive: true, force: true });
  // macOS .framework 大量使用相对符号链接；必须原样保留，否则 Node 会把它们改写为
  // 指向临时构建目录的绝对链接，临时目录删除后 .app 将无法加载 Electron Framework。
  fs.cpSync(stageDir, finalDir, { recursive: true, verbatimSymlinks: true });
  assertNoBrokenSymlinks(finalDir);
  fs.rmSync(stageDir, { recursive: true, force: true });
}

function assertNoBrokenSymlinks(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, ent.name);
    if (ent.isSymbolicLink()) {
      const target = fs.readlinkSync(file);
      const resolved = path.isAbsolute(target) ? target : path.resolve(path.dirname(file), target);
      if (!fs.existsSync(resolved)) throw new Error(`构建产物含失效符号链接：${file} -> ${target}`);
    } else if (ent.isDirectory()) {
      assertNoBrokenSymlinks(file);
    }
  }
}

if (!unsafeForBuilder) assertNoBrokenSymlinks(finalDir);

console.log(`构建产物：${finalDir}`);
