@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title DANEOBANG server
set "LOG=%~dp0start-server.log"
echo [%date% %time%] start-server >"%LOG%"

echo ==========================================
echo   DANEOBANG - 1st MVP server
echo ==========================================
echo.

rem ---- 1. Node.js check ----
where node >nul 2>nul
if errorlevel 1 goto :no_node
for /f "tokens=1 delims=v." %%a in ('node -v') do set "NODE_MAJOR=%%a"
if "%NODE_MAJOR%"=="" goto :no_node
if %NODE_MAJOR% LSS 20 goto :old_node
echo [OK] Node.js
node -v

rem ---- 2. .env ----
if exist ".env" goto :env_ok
echo [SETUP] .env not found - copying .env.example
copy /y ".env.example" ".env" >nul
:env_ok

rem ---- 3. npm install - first run, or when package.json changed ----
for %%A in (package.json) do set "PJ_SIZE=%%~zA"
set "STAMP="
if exist "node_modules\.pkg-stamp" set /p STAMP=<"node_modules\.pkg-stamp"
if exist "node_modules\next\package.json" if "%STAMP%"=="%PJ_SIZE%" goto :deps_ok
echo [INSTALL] npm install - may take several minutes...
call npm install >>"%LOG%" 2>&1
if errorlevel 1 goto :fail_install
<nul set /p ="%PJ_SIZE%" >"node_modules\.pkg-stamp"
:deps_ok
echo [OK] packages

rem ---- 4. Prisma client - already included, generate only if missing ----
if exist "src\generated\prisma\client.ts" goto :prisma_ok
echo [DB] prisma generate...
call npx prisma generate >>"%LOG%" 2>&1
if errorlevel 1 goto :fail_prisma
:prisma_ok
echo [OK] prisma client

rem ---- 5. DB init + seed ----
echo [DB] preparing SQLite database - prisma\dev.db
call npm run db:push >>"%LOG%" 2>&1
if errorlevel 1 goto :fail_db
call npm run db:seed >>"%LOG%" 2>&1
if errorlevel 1 goto :fail_db
echo [OK] database

if /i "%~1"=="dev" goto :run_dev

rem ---- 6. build - first run, or when sources are newer than the last build ----
if not exist ".next\BUILD_ID" goto :do_build
if not exist "src\.build-stamp" goto :do_build
for /f %%i in ('powershell -NoProfile -Command "$b=(Get-Item src\.build-stamp).LastWriteTimeUtc; $n=(Get-ChildItem src,prisma,assets -Recurse -File -Exclude .build-stamp | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).LastWriteTimeUtc; if($n -gt $b){1}else{0}"') do set "NEED_BUILD=%%i"
if "%NEED_BUILD%"=="0" goto :build_ok
:do_build
echo [BUILD] production build - 1-3 minutes...
call npm run build >>"%LOG%" 2>&1
if errorlevel 1 goto :fail_build
echo built>"src\.build-stamp"
:build_ok
echo [OK] build

echo.
echo ==========================================
echo   http://localhost:3000
echo   demo accounts - password: password
echo     owner@daneobang.dev    academy owner
echo     teacher@daneobang.dev  teacher
echo     student@daneobang.dev  student
echo     admin@daneobang.dev    platform admin
echo   stop: Ctrl+C  /  log: start-server.log
echo ==========================================
echo.
start "" "http://localhost:3000"
call npm run start
echo.
echo [INFO] server stopped. If it stopped by itself, port 3000 may already be in use.
goto :end

:run_dev
echo [DEV] starting dev mode: http://localhost:3000
start "" "http://localhost:3000"
call npm run dev
goto :end

:no_node
echo [ERROR] Node.js is not installed or not in PATH.
echo         Install Node.js LTS - version 20 or newer - from https://nodejs.org
echo         then close this window and run start-server.bat again.
goto :end
:old_node
echo [ERROR] Node.js 20 or newer is required. Current version:
node -v
goto :end
:fail_install
echo [ERROR] npm install failed. Check internet connection. Details: start-server.log
goto :showlog
:fail_prisma
echo [ERROR] prisma generate failed. Details: start-server.log
goto :showlog
:fail_db
echo [ERROR] database setup failed. Details: start-server.log
goto :showlog
:fail_build
echo [ERROR] build failed. Try: start-server.bat dev   Details: start-server.log
goto :showlog

:showlog
echo.
echo ---- last lines of start-server.log ----
powershell -NoProfile -Command "Get-Content -Path '%LOG%' -Tail 25" 2>nul
goto :end

:end
echo.
pause
endlocal
