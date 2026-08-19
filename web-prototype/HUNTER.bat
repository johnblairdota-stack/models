@echo off
REM ============================================================
REM  Run Robot Run - HUNTER STAGE 2 & 3 CRITIQUE BENCH
REM  Double-click this. No terminal needed.
REM ============================================================
REM  Renders hunter stage 2 and 3 fresh, crops the matching rows
REM  out of the art sheet, measures the silhouettes, and opens
REM  one page with render and art side by side.
REM
REM  Takes about two minutes. Leave the black window open until
REM  the page opens in your browser, then you can close it.
REM ============================================================

cd /d "%~dp0"

echo.
echo   Hunter - stage 2 and 3 critique bench
echo   =====================================
echo.

REM --- Build first. Not to produce dist/ - the bench renders through
REM --- vite's dev server - but because `npm run build` runs the GLSL
REM --- lint, and a backtick in a shader comment takes every capture
REM --- down at once. Better to fail here than to judge a black frame.
echo   Checking the shaders build (about 3 seconds)...
call npm run build
if errorlevel 1 (
  echo.
  echo   BUILD FAILED. Screenshot this window and send it to Claude.
  echo.
  pause
  exit /b 1
)

echo.
echo   Rendering four frames. This is the slow part - about two minutes.
echo   Each one boots a browser and waits for the shaders to compile.
echo.
node harness\hunter-critique.mjs
if errorlevel 1 (
  echo.
  echo   RENDER FAILED. Screenshot this window and send it to Claude.
  echo.
  pause
  exit /b 1
)

echo.
echo   Opening the page...
start "" "%~dp0progress\critique\index.html"

echo.
echo   Done. The page is open in your browser.
echo   You can close this window.
echo.

REM --- Hold the window open a few seconds so the "Done" is readable on a
REM --- double-click, where the console closes the instant the script ends.
REM --- `ping` and not `timeout`: timeout reads the console for a keypress, so
REM --- it dies with "Input redirection is not supported" whenever this script
REM --- is run with stdin redirected - which made a completely successful run
REM --- exit with code 1 and look like a failure.
ping -n 6 127.0.0.1 >nul
