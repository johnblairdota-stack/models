@echo off
REM ============================================================
REM  Run Robot Run - GENERATE THE THREE HUNTER BODIES ON MESHY
REM  Double-click this. No terminal needed.
REM ============================================================
REM  Runs the same pipeline the player's robot came out of, pointed
REM  at the hunter: text -> 3D on smart-topology, then Meshy's
REM  auto-rig, for stages 1, 2 and 3. About ten minutes and a few
REM  dollars of Meshy credit.
REM
REM  ⚠️ YOU NEED YOUR MESHY API KEY IN THIS WINDOW. Nothing is
REM  written to disk. Get it from meshy.ai -> Settings -> API.
REM
REM  ⚠️ RESUMABLE, AND IT NEVER RE-QUEUES. Every task id is recorded
REM  in assets\raw\meshy_hunter\tasks.json as it is created, so if
REM  this dies half way, run it again - it picks up where it stopped
REM  and does not pay for the same task twice.
REM
REM  WHEN IT FINISHES it copies the bodies into public\models\hunter\
REM  and the game picks them up with no code change. Then:
REM
REM      HUNTERMESH.bat      look at them beside the player
REM      PLAY.bat            add ^&meshhunter=1 to the address bar
REM
REM  LOOK AT THE PREVIEW THUMBNAILS IT PRINTS. That is the moment
REM  the whole thing is decided - if a shape is wrong, stop, fix the
REM  words in tools\meshy-hunter-batch.mjs, and generate again. It
REM  costs pennies. Fixing it downstream costs rounds.
REM ============================================================

cd /d "%~dp0"

echo.
echo   Generate the hunter bodies on Meshy
echo   ===================================
echo.

if "%MESHY_API_KEY%"=="" (
  set /p MESHY_API_KEY="  Paste your Meshy API key and press Enter: "
)
if "%MESHY_API_KEY%"=="" (
  echo.
  echo   No key, nothing to do.
  echo.
  pause
  exit /b 1
)

echo.
echo   Working. Preview, then texture, then rig - three assets.
echo   Leave this window open; it prints a thumbnail link per stage.
echo.
node tools\meshy-hunter-batch.mjs
if errorlevel 1 (
  echo.
  echo   FAILED. Screenshot this window and send it to Claude.
  echo   Nothing is lost - run this again and it resumes.
  echo.
  pause
  exit /b 1
)

echo.
echo   Checking what the game now loads...
echo.
node harness\meshhunter-probe.mjs --no-game

echo.
echo   Done. Open HUNTERMESH.bat to look at them.
echo.
pause
