@echo off
REM ============================================================
REM  Run Robot Run - STANDALONE MESHY SMASH LAB
REM  Double-click. Blank room, every Meshy prop in two rows.
REM ============================================================

cd /d "%~dp0"

echo.
echo   Run Robot Run - furniture smash lab
echo   ==================================
echo.

call npm run build
if errorlevel 1 (
  echo BUILD FAILED.
  pause
  exit /b 1
)

echo   Starting the server on port 5179...
start "RRR server" /min cmd /c "npm run preview"
timeout /t 4 /nobreak >nul

start "" "http://localhost:5179/?view=furn.smash&quality=medium"

echo   Blank room. Two rows of Meshy furniture. Mesh robot + sledge.
echo   WASD move, LMB smash.
echo.
pause
