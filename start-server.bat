@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title DANEOBANG server
set "LOG=%~dp0start-server.log"
set "WEB=apps\web"
set "PNPM=pnpm --filter @daneobang/web"
echo [%date% %time%] start-server (monorepo) >"%LOG%"

echo ==========================================
echo   DANEOBANG - web server (apps/web)
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

rem ---- 2. pnpm check (corepack -> npm -g fallback) ----
where pnpm >nul 2>nul
if not errorlevel 1 goto :pnpm_ok
echo [SETUP] pnpm not found - enabling via corepack...
call corepack enable >>"%LOG%" 2>&1
call corepack prepare pnpm@10.28.0 --activate >>"%LOG%" 2>&1
where pnpm >nul 2>nul
if not errorlevel 1 goto :pnpm_ok
echo [SETUP] corepack failed - installing pnpm globally with npm...
call npm install -g pnpm@10 >>"%LOG%" 2>&1
where pnpm >nul 2>nul
if errorlevel 1 goto :no_pnpm
:pnpm_ok
echo [OK] pnpm
call pnpm -v

rem ---- 3. .env (apps/web) ----
if exist "%WEB%\.env" goto :env_ok
echo [SETUP] %WEB%\.env not found - copying .env.example
copy /y "%WEB%\.env.example" "%WEB%\.env" >nul
:env_ok

rem ---- 3b. leftovers from the pre-monorepo layout (npm node_modules, root prisma/) ----
if exist "node_modules\.package-lock.json" (
  echo [CLEANUP] removing old npm node_modules - a minute...
  rmdir /s /q "node_modules" >>"%LOG%" 2>&1
)
if exist "prisma\dev.db" if exist "%WEB%\prisma\schema.prisma" rmdir /s /q "prisma" >>"%LOG%" 2>&1
if exist "package-lock.json" del /q "package-lock.json" >>"%LOG%" 2>&1

rem ---- 4. pnpm install - first run, or when package.json / lockfile changed ----
set "PJ_SIZE="
for %%A in (package.json) do set "PJ_SIZE=%%~zA"
for %%A in (%WEB%\package.json) do set "PJ_SIZE=%PJ_SIZE%-%%~zA"
if exist "pnpm-lock.yaml" for %%A in (pnpm-lock.yaml) do set "PJ_SIZE=%PJ_SIZE%-%%~zA"
set "STAMP="
if exist "node_modules\.pkg-stamp" set /p STAMP=<"node_modules\.pkg-stamp"
if exist "node_modules\next\package.json" if "%STAMP%"=="%PJ_SIZE%" goto :deps_ok
echo [INSTALL] pnpm install - may take several minutes...
call pnpm install >>"%LOG%" 2>&1
if errorlevel 1 goto :fail_install
<nul set /p ="%PJ_SIZE%" >"node_modules\.pkg-stamp"
:deps_ok
echo [OK] packages

rem ---- 5. Prisma client - already included, generate only if missing ----
if exist "%WEB%\src\generated\prisma\client.ts" goto :prisma_ok
echo [DB] prisma generate...
call %PNPM% exec prisma generate >>"%LOG%" 2>&1
if errorlevel 1 goto :fail_prisma
:prisma_ok
echo [OK] prisma client

rem ---- 6. DB init + seed ----
echo [DB] preparing SQLite database - %WEB%\prisma\dev.db
call %PNPM% run db:push >>"%LOG%" 2>&1
if errorlevel 1 goto :fail_db
call %PNPM% run db:seed >>"%LOG%" 2>&1
if errorlevel 1 goto :fail_db
echo [OK] database

if /i "%~1"=="dev" goto :run_dev

rem ---- 7. build - first run, or when sources are newer than the last build ----
if not exist "%WEB%\.next\BUILD_ID" goto :do_build
if not exist "%WEB%\src\.build-stamp" goto :do_build
for /f %%i in ('powershell -NoProfile -Command "$b=(Get-Item apps\web\src\.build-stamp).LastWriteTimeUtc; $n=(Get-ChildItem apps\web\src,apps\web\prisma,apps\web\assets,packages -Recurse -File -Exclude .build-stamp | Where-Object { $_.FullName -notmatch 'node_modules' } | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).LastWriteTimeUtc; if($n -gt $b){1}else{0}"') do set "NEED_BUILD=%%i"
if "%NEED_BUILD%"=="0" goto :build_ok
:do_build
echo [BUILD] production build - 1-3 minutes...
call %PNPM% run build >>"%LOG%" 2>&1
if errorlevel 1 goto :fail_build
echo built>"%WEB%\src\.build-stamp"
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
echo   mobile app: pnpm dev:mobile  (apps/mobile, Expo)
echo   stop: Ctrl+C  /  log: start-server.log
echo ==========================================
echo.
start "" "http://localhost:3000"
call %PNPM% run start
echo.
echo [INFO] server stopped. If it stopped by itself, port 3000 may already be in use.
goto :end

:run_dev
echo [DEV] starting dev mode: http://localhost:3000
start "" "http://localhost:3000"
call %PNPM% run dev
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
:no_pnpm
echo [ERROR] pnpm could not be installed. Run manually:  npm install -g pnpm
goto :showlog
:fail_install
echo [ERROR] pnpm install failed. Check internet connection. Details: start-server.log
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
