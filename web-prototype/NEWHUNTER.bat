@echo off
REM ============================================================
REM  Run Robot Run - MESHY CLIP HUNTER VIEWER (hunter.animated)
REM  Double-click this. No terminal needed.
REM ============================================================
REM  The hunter body stood in a DOORWAY - because the sofa lock
REM  says the hunter IS a door, this is the one framing that
REM  matters. Left door: the Meshy clip body. Right door: the
REM  procedural stage-3, for the A/B. Space cycles the clips;
REM  the red flash fires at the MEASURED contact moment.
REM ============================================================

cd /d "%~dp0"

echo.
echo   Hunter in the door - viewer
echo   ===========================
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

echo   Opening the viewer...
start "" "http://localhost:5179/?view=hunter.animated"

echo.
echo   Space or click cycles: walk / run / attack / combo / idle / grow.
echo   ?clip=attack in the address bar starts on a strike.
echo   ?proc=0 hides the procedural hunter.
echo.
echo   Close this window when you are done looking.
echo.
pause
