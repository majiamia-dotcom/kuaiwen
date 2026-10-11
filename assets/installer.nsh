; 自定义 NSIS 安装脚本（electron-builder 通过 nsis.include 注入）。
; 原因：electron-builder 默认建的桌面快捷方式在部分机器上无效/图标空白（疑似其附带的
; AppUserModelID 等处理所致）。这里在 package.json 关掉默认桌面快捷方式
; (createDesktopShortcut:false)，改用最基础的 CreateShortCut 显式创建——
; 与"从开始菜单手动发送到桌面"等效，最朴素、最兼容。
; 用 electron-builder 预定义变量(${PRODUCT_NAME}/${APP_EXECUTABLE_FILENAME})避免脚本里写中文。

!macro customInstall
  ; 链接, 目标exe, 启动参数(无), 图标文件(用exe自带图标), 图标索引0
  CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
!macroend

!macro customUnInstall
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
!macroend
