@echo off
REM ============================================================
REM  Run Robot Run - FURNITURE DESTRUCTION DEMO
REM  Double-click this. No terminal needed.
REM ============================================================
REM  Builds, serves, and opens the game in the ballroom chair
REM  circle with the sledge already in your hands.
REM
REM  Same server/port as PLAY.bat (5179). Close PLAY.bat's window
REM  first if it is already running, or the port is taken.
REM ============================================================

cd /d "%~dp0"

echo.
echo   Run Robot Run - furniture destruction
echo   ====================================
echo.

echo   Building the latest code (about 3 seconds)...
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

echo   Opening the furniture demo...
echo.
REM ⚠️ NO CARETS INSIDE THE QUOTES. `start ""` takes the URL as one quoted argument;
REM a literal ^ becomes part of the address and breaks the view id (see PLAYGEN.bat).
start "" "http://localhost:5179/?view=game.play&seed=s4&quality=medium&furndemo=1"

echo   ------------------------------------------------------------
echo   WHAT YOU ARE LOOKING AT
echo.
echo     You spawn in the BALLROOM centre, inside a ring of 8 ornate
echo     chairs, with the SLEDGE already equipped.
echo.
echo     Swing at a chair  - it cracks, then shatters into timber.
echo     Walk through the gap where it was.
echo.
echo     Also breakable in this build:
echo       - desks + side chairs in both studies
echo       - console tables on the ballroom walls
echo       - a crate stack in the ballroom corner
echo       - a console in the gallery
echo.
echo     Ablate all furniture: add  ^&furn=0  to the URL.
echo   ------------------------------------------------------------
echo.
echo   CONTROLS
echo.
echo     LMB / swing   smash furniture ^(and dig walls^)
echo     WASD          move
echo     mouse         look
echo     E             interact ^(not needed - hammer is equipped^)
echo.
echo   Leave this window open while you play. Close it when done.
echo.
pause
