@echo off
REM ============================================================
REM  PRIME TIME - double-click to play.
REM  Starts both servers if they are not already up, then opens
REM  the TV window and two phone-sized windows.
REM
REM  page server : http://localhost:5192  (serves dist/, the BUILT game)
REM  room server : ws://localhost:5181    (net/party/local.mjs)
REM
REM  If you changed code, run BUILD.bat first - this serves dist/,
REM  not the source.
REM ============================================================

cd /d "%~dp0"

REM Room code MUST use CODE_ABC (src/party/look.js) - no i, l, o, 0, 1.
REM Those look alike read off a TV across a room, so the phone strips them.
set ROOM=dusk
set PAGE=http://localhost:5192

REM ============================================================
REM  RESTART THE SERVERS BY DEFAULT.
REM
REM  The room server holds ALL the night logic and it is a plain node process - it
REM  keeps running the code it was started with, forever. Reusing it after a code
REM  change means playing against yesterday's rules with today's screens, and NOTHING
REM  says so: the TV paints, the phones join, the beats advance, and the new thing
REM  simply is not there. That cost a full debugging session on 2026-08-25, chasing a
REM  missing button through four layers of client code that were all correct.
REM
REM  So: kill and restart, every time. A room does not outlive a night anyway.
REM
REM    PRIMETIME.bat          restart the servers, then open the windows  (what you want)
REM    PRIMETIME.bat keep     leave running servers alone - ONLY to add a window
REM                           to a game that is already in progress
REM ============================================================
if /I "%~1"=="keep" (
  echo keeping any servers that are already running ^(you asked for it^)
  call :ensure 5181 "PRIME TIME room server" "node _start-room-5181.mjs"
  call :ensure 5192 "PRIME TIME page server" "node harness\serve.mjs"
) else (
  call :restart 5181 "PRIME TIME room server" "node _start-room-5181.mjs"
  call :restart 5192 "PRIME TIME page server" "node harness\serve.mjs"
)

REM --- prove they are actually up before opening any window ---
call :require 5181 "room server"
if errorlevel 1 exit /b 1
call :require 5192 "page server"
if errorlevel 1 exit /b 1

REM --- find Chrome ---
set CHROME=
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe
if "%CHROME%"=="" (
  echo Chrome not found - open these by hand:
  echo   TV    %PAGE%/?view=party.host^&room=%ROOM%
  echo   phone %PAGE%/?view=party.phone^&room=%ROOM%
  pause
  exit /b 1
)

echo.
echo   ROOM CODE: %ROOM%
echo.

REM --- TV ---
start "" "%CHROME%" --new-window --window-size=1100,780 --window-position=0,0 "%PAGE%/?view=party.host&room=%ROOM%&dev=1"
ping -n 2 127.0.0.1 >nul

REM --- two phones ---
REM NOTE: deliberately NO &room= on the phone URLs.
REM party-phone.js skips the whole join sheet when the code is already in the URL
REM (`if (!state.code) { paintJoin(); return; }`) - that is the QR-scan path and it is
REM correct. But it means a prefilled launcher hides the code entry, the name entry, and
REM any bug in either. Phones here start where a real guest starts: typing the code.
start "" "%CHROME%" --new-window --window-size=390,860 --window-position=1110,0 "%PAGE%/?view=party.phone"
ping -n 1 127.0.0.1 >nul
start "" "%CHROME%" --new-window --window-size=390,860 --window-position=1510,0 "%PAGE%/?view=party.phone"

echo done. Room code is %ROOM%.
ping -n 3 127.0.0.1 >nul
exit /b 0

REM ============================================================
REM  :ensure <port> <window title> <command>
REM  Start the command in its own window if nothing is LISTENING on <port>.
REM  cmd /k keeps that window open when node dies, so the error stays readable
REM  instead of the window vanishing and the failure looking like nothing at all.
REM ============================================================
:ensure
netstat -ano | findstr "LISTENING" | findstr ":%~1 " >nul
if errorlevel 1 (
  echo starting %~2 on %~1 ...
  start %2 /min cmd /k %3
  ping -n 3 127.0.0.1 >nul
) else (
  echo %~2 already up on %~1
)
exit /b 0

REM ============================================================
REM  :restart <port> <window title> <command>
REM  Stop whatever is LISTENING on <port>, then start it fresh.
REM  The LISTENING filter matters twice here: without it the PID column is read off a
REM  TIME_WAIT row and this would kill an unrelated process.
REM ============================================================
:restart
set "OLDPID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":%~1 "') do set "OLDPID=%%P"
if defined OLDPID (
  echo stopping the old %~2 ^(pid %OLDPID%^) ...
  taskkill /PID %OLDPID% /F >nul 2>&1
  ping -n 2 127.0.0.1 >nul
)
echo starting %~2 on %~1 ...
start %2 /min cmd /k %3
ping -n 3 127.0.0.1 >nul
exit /b 0

REM ============================================================
REM  :require <port> <name>  - hard stop if it never came up.
REM  Opening browser windows against a dead server is the failure that wastes
REM  the most time: three windows appear, look right, and silently do nothing.
REM ============================================================
:require
netstat -ano | findstr "LISTENING" | findstr ":%~1 " >nul
if errorlevel 1 (
  echo.
  echo   ERROR: %~2 did NOT come up on port %~1.
  echo   Look at the minimised "%~2" window for the reason.
  echo.
  pause
  exit /b 1
)
exit /b 0
