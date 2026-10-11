#!/bin/bash
cd "$(dirname "$0")"
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
export npm_config_registry="https://registry.npmmirror.com"
clear
echo "=================================="
echo "      文档内容搜索器"
echo "=================================="
echo ""
if ! command -v npm >/dev/null 2>&1; then
  echo "未检测到 Node.js，请先到 nodejs.org 安装 LTS 版本。"
  read -p "按回车键关闭"; exit 1
fi

check_electron() {
  node -e "const fs=require('fs'),path=require('path');try{const p=require('electron');if(typeof p!=='string'||!fs.existsSync(p))process.exit(1);const fw=path.join(path.dirname(p),'..','Frameworks','Electron Framework.framework','Electron Framework');process.exit(fs.existsSync(fw)?0:1)}catch(e){process.exit(1)}" 2>/dev/null
}

# 关键：--ignore-scripts 让 electron 那个会崩的安装脚本不执行，同时补齐所有缺失依赖
echo "正在安装/检查依赖（国内镜像，不运行安装脚本）..."
npm install --ignore-scripts || { echo "❌ 依赖安装失败，请把本窗口文字截图发回。"; read -p "回车关闭"; exit 1; }

if ! check_electron; then
  EVER=$(node -p "require('./node_modules/electron/package.json').version" 2>/dev/null)
  [ -z "$EVER" ] && EVER="44.1.1"
  ARCH=$(node -p "process.arch" 2>/dev/null)
  CACHE="$HOME/.docsearch_cache/electron-${EVER}-darwin-${ARCH}"
  rm -rf node_modules/electron/dist node_modules/electron/path.txt
  mkdir -p node_modules/electron/dist
  if [ -f "$CACHE/Electron.app/Contents/MacOS/Electron" ]; then
    echo "从本地缓存恢复 Electron 内核（秒级，无需下载）..."
    ditto "$CACHE" node_modules/electron/dist
  else
    URL="https://registry.npmmirror.com/-/binary/electron/v${EVER}/electron-v${EVER}-darwin-${ARCH}.zip"
    echo ""
    echo "首次下载 Electron 内核 v${EVER} (${ARCH})，约150MB，请耐心等待..."
    curl -L --fail --progress-bar -o /tmp/_electron_core.zip "$URL" || { echo; echo "❌ 下载失败，请截图发回。"; read -p "回车关闭"; exit 1; }
    echo "解压安装..."
    ditto -x -k /tmp/_electron_core.zip node_modules/electron/dist
    rm -f /tmp/_electron_core.zip
    mkdir -p "$CACHE"; ditto node_modules/electron/dist "$CACHE"
  fi
  printf '%s' "Electron.app/Contents/MacOS/Electron" > node_modules/electron/path.txt
fi

if ! check_electron; then
  echo ""; echo "❌ 内核仍不完整。请把本窗口全部文字截图发回。"
  read -p "按回车键关闭"; exit 1
fi

echo ""
echo "✅ 就绪，正在打开应用窗口..."
npm start
