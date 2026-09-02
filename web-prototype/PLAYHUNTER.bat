@echo off
REM ============================================================
REM  Run Robot Run - PLAY with the MESHY STAGE-3 HUNTER (?hunterm=1)
REM  Double-click this. No terminal needed.
REM ============================================================
REM  Same game as PLAY.bat, but the hunter wears the Meshy stage-3
REM  pack instead of the procedural rig. OPT-IN ONLY - PLAY.bat
REM  is untouched and stays procedural.
REM
REM  Copy the pack first (gitignored, do not commit):
REM    C:\Users\John\Documents\Run Robot Run\web-prototype\public\models\anim\hunter\
REM    -> web-prototype\public\models\anim\hunter\
REM  Need walking.glb running.glb attack.glb double-combo-attack.glb
REM ============================================================

cd /d "%~dp0"

echo.
echo   Run Robot Run - Meshy stage-3 hunter
echo   ===================================
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

echo   Opening the game with the mesh hunter...
start "" "http://localhost:5179/?view=game.play&seed=s4&quality=medium&hunterm=1"

echo.
echo   The hunter's strikes are cut to MEASURED contact frames -
echo   the swing you see should land exactly when the limb comes
echo   off. Extra-arm weights are a FINDING, not a paint job.
echo.
echo   Close this window when you have finished playing.
echo.
pause
