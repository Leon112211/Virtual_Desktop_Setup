@echo off
setlocal
chcp 65001 >nul
title 桌构 DeskCraft
pushd "%~dp0"
if errorlevel 1 exit /b 1

where node >nul 2>&1
if errorlevel 1 if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>&1
if errorlevel 1 if exist "%LocalAppData%\Programs\nodejs\node.exe" set "PATH=%LocalAppData%\Programs\nodejs;%PATH%"
where node >nul 2>&1
if errorlevel 1 goto missing_node
where npm.cmd >nul 2>&1
if errorlevel 1 goto missing_node
if not exist "package.json" goto missing_project
if "%~1"=="--check" goto check

rem Reuse this app only, not an unrelated server occupying the same port.
node -e "const http=require('node:http');const req=http.get('http://localhost:5173',r=>{let html='';r.setEncoding('utf8');r.on('data',s=>html+=s);r.on('end',()=>process.exit(r.statusCode===200&&html.includes('DeskCraft')&&html.includes('/src/main.tsx')?0:1));});req.on('error',()=>process.exit(1));req.setTimeout(1500,()=>{req.destroy();process.exit(1);});" >nul 2>&1
if not errorlevel 1 (
  echo 桌构 DeskCraft 已经在运行，正在打开浏览器……
  start "" "http://localhost:5173"
  popd
  exit /b 0
)

if not exist "node_modules\vite\bin\vite.js" (
  echo 首次启动，正在安装项目依赖，需要联网。请稍候……
  call npm.cmd ci
  if errorlevel 1 goto failed
)

echo 正在启动桌构 DeskCraft，服务就绪后会自动打开浏览器。
echo 使用期间请保持此窗口打开；关闭窗口会停止服务。
echo.
rem Keep the origin stable so the browser can find the same saved layout.
call npm.cmd run dev -- --open --strictPort
if errorlevel 1 goto failed
popd
exit /b 0

:check
if not exist "node_modules\vite\bin\vite.js" goto missing_dependencies
node --version
call npm.cmd --version
echo 启动环境检查通过。
popd
exit /b 0

:missing_node
echo 未找到 Node.js 或 npm，请安装 Node.js 24 LTS 后重新打开此文件。
echo 如刚完成安装但尚未生效，请先关闭终端／重启资源管理器或重启电脑后再试。
goto failed

:missing_project
echo 未找到 package.json。请先完整解压整个 ZIP 压缩包再运行，不要在压缩包预览窗口中直接双击；也不要单独移走本启动文件。
goto failed

:missing_dependencies
echo 尚未安装依赖。正常双击启动时会自动安装。
goto failed

:failed
echo.
echo 启动未完成，请查看上方错误信息。
echo 如果提示端口 5173 被其他程序占用，请先关闭该程序后重试。
echo 如遇到依赖下载错误，请检查网络或代理设置后重新双击。
pause
popd
exit /b 1
