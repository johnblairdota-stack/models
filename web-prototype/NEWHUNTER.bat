@echo off
REM ============================================================
REM  Run Robot Run - MESHY STAGE-3 HUNTER VIEWER (hunter.animated)
REM  Double-click this. No terminal needed.
REM ============================================================
REM  The hunter body stood in a DOORWAY - because the sofa lock
REM  says the hunter IS a door, this is the one framing that
REM  matters. Left door: the Meshy stage-3 pack. Right door: the
REM  procedural stage-3, for the A/B. Space cycles the clips;
REM  the red flash fires at the MEASURED contact moment.
REM
REM  Copy the pack first (gitignored, do not commit):
REM    C:\Users\John\Documents\Run Robot Run\web-prototype\public\models\anim\hunter\
REM    -> web-prototype\public\models\anim\hunter\
REM ============================================================

cd /d "%~dp0"

echo.
echo   Hunter in the door - viewer
echo   ===========================
echo.

if not exist "public\models\anim\hunter\walking.glb" (
  echo   MISSING the Meshy hunter pack.
  echo.
  echo   Copy the GLBs from:
  echo     C:\Users\John\Documents\Run Robot Run\web-prototype\public\models\anim\hunter\
  echo   into:
  echo     public\models\anim\hunter\
  echo.
  echo   Need walking.glb running.glb attack.glb double-combo-attack.glb
  echo   They are gitignored. Do not commit them.
  echo   See public\models\anim\hunter\README.md
  echo.
  pause
  exit /b 1
)

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

echo   Opening the viewer...
start "" "http://localhost:5179/?view=hunter.animated"

echo.
echo   Space or click cycles: walk / run / attack / combo.
echo   ?clip=attack in the address bar starts on a strike.
echo   ?proc=0 hides the procedural hunter.
echo.
echo   Close this window when you are done looking.
echo.
pause
