@echo off
REM ============================================================
REM  Run Robot Run - MESHY FURNITURE SMASH LINEUP
REM  Double-click this. No terminal needed.
REM ============================================================
REM  Ballroom row of 16 Meshy props + sledge. See
REM  docs/slices/task-meshy-furn-lineup.md
REM ============================================================

cd /d "%~dp0"

echo.
echo   Run Robot Run - Meshy furniture lineup
echo   =====================================
echo.

echo   Building the latest code...
call npm run build
if errorlevel 1 (
  echo.
  echo   BUILD FAILED. Screenshot this window and send it to Claude.
  echo.
  pause
  exit /b 1
)

echo   Starting the server on port 5179...
start "RRR server" /min cmd /c "npm run preview"

timeout /t 4 /nobreak >nul

echo   Opening the Meshy smash lineup...
echo.
start "" "http://localhost:5179/?view=game.play&seed=s4&quality=medium&estate=port&furnline=1"

echo   ------------------------------------------------------------
echo   WHAT YOU ARE LOOKING AT
echo.
echo     Ballroom: 16 Meshy props in a row. Sledge equipped.
echo     Smash each one - we tune Teardown feel after you play.
echo   ------------------------------------------------------------
echo.
pause
