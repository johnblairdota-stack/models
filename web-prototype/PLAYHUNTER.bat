@echo off
REM ============================================================
REM  Run Robot Run - PLAY with the MESHY CLIP HUNTER (?hunterm=1)
REM  Double-click this. No terminal needed.
REM ============================================================
REM  Same game as PLAY.bat, but the hunter wears the Meshy clip
REM  body instead of the procedural rig. OPT-IN ONLY - PLAY.bat
REM  is untouched and stays procedural.
REM
REM  HONESTY NOTE: the body is the Lumi Bot biped STAND-IN. The
REM  repo holds no generated stage-3 hunter mesh (no six arms,
REM  no rider). Judge the MOTION and the strike timing here; the
REM  silhouette verdict lives in hunter-door\README.md.
REM ============================================================

cd /d "%~dp0"

echo.
echo   Run Robot Run - Meshy clip hunter
echo   =================================
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

echo   Opening the game with the mesh hunter...
start "" "http://localhost:5179/?view=game.play&seed=s4&quality=medium&hunterm=1"

echo.
echo   The hunter's strikes are cut to MEASURED contact frames -
echo   the swing you see should land exactly when the limb comes
echo   off. If it looks early or late, that is a finding: say so.
echo.
echo   Close this window when you have finished playing.
echo.
pause
