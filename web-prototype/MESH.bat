@echo off
REM ============================================================
REM  Run Robot Run - LOOK AT THE GENERATED MESH
REM  Double-click this. No terminal needed.
REM ============================================================
REM  Opens the generated-mesh views in your browser so you can
REM  ORBIT them yourself. Drag to rotate, scroll to zoom.
REM
REM  Three tabs open:
REM    Walking, Running and Attack - the skinned auto-rigged character,
REM    playing live, beside the procedural player for comparison.
REM
REM    Swap the clip in the address bar: clip=walking running run3 alert
REM
REM  Leave the black window open while you look. Close it when done.
REM ============================================================

cd /d "%~dp0"

echo.
echo   Generated mesh - interactive viewer
echo   ==================================
echo.

echo   Building (about 3 seconds)...
call npm run build
if errorlevel 1 (
  echo.
  echo   BUILD FAILED. Screenshot this window and send it to Claude.
  echo.
  pause
  exit /b 1
)

echo   Starting the server on port 5179...
start "RRR mesh viewer" /min cmd /c "npm run preview"

REM --- Let the port bind before the browser asks for it.
ping -n 5 127.0.0.1 >nul

echo   Opening three views...
echo.
REM --- `orbit=1` is what constructs OrbitControls at all; without it the camera is fixed.
start "" "http://localhost:5179/?view=mesh.animated&clip=walking&orbit=1&quality=medium"
ping -n 3 127.0.0.1 >nul
start "" "http://localhost:5179/?view=mesh.animated&clip=running&orbit=1&quality=medium"
ping -n 3 127.0.0.1 >nul
start "" "http://localhost:5179/?view=mesh.animated&clip=attack&orbit=1&quality=medium"

echo.
echo   Drag to rotate. Scroll to zoom.
echo   Clips: walking running run3 alert attack arise dance groove cheer
echo.
echo   Leave this window open while you look.
echo.
ping -n 8 127.0.0.1 >nul
