@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
set npm_config_registry=https://registry.npmmirror.com
echo      文档内容搜索器
where npm >nul 2>nul || (echo 未检测到 Node.js & pause & exit /b)
call npm install --ignore-scripts || (echo 依赖安装失败 & pause & exit /b)
node -e "const p=require('electron');const fs=require('fs');process.exit((typeof p==='string'&&fs.existsSync(p))?0:1)" 2>nul
if errorlevel 1 (
  for /f %%i in ('node -p "require('./node_modules/electron/package.json').version"') do set EVER=%%i
  if "!EVER!"=="" set EVER=44.1.1
  for /f %%a in ('node -p "process.arch"') do set ARCH=%%a
  set CACHE=%USERPROFILE%\.docsearch_cache\electron-!EVER!-!ARCH!
  rmdir /s /q node_modules\electron\dist 2>nul
  mkdir node_modules\electron\dist
  if exist "!CACHE!\electron.exe" (
    xcopy /e /i /q /y "!CACHE!" node_modules\electron\dist >nul
  ) else (
    echo 首次下载 Electron 内核 v!EVER!，请耐心等待...
    curl -L --fail -o "%TEMP%\_electron_core.zip" "https://registry.npmmirror.com/-/binary/electron/v!EVER!/electron-v!EVER!-win32-!ARCH!.zip"
    tar -xf "%TEMP%\_electron_core.zip" -C node_modules\electron\dist
    mkdir "!CACHE!" 2>nul & xcopy /e /i /q /y node_modules\electron\dist "!CACHE!" >nul
  )
  <nul set /p="electron.exe" > node_modules\electron\path.txt
)
call npm start
pause
