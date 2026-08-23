@echo off
REM ============================================================
REM  Run Robot Run - MESHY HUNTER RIG + ANIMATION VIEWER
REM  Double-click this. No terminal needed.
REM ============================================================
REM  Opens hunter.animated: the new Meshy stage-3 hunter,
REM  auto-rigged and skinned, playing one clip at a time.
REM
REM  Along the bottom is a DROP DOWN with every hunter clip in it.
REM  Pick one and the hunter plays it. Arrow keys step the list.
REM
REM  Swap the clip in the address bar if you prefer:
REM    clip=walking running frankenstein orc jump-attack
REM    left-slash attack double-combo
REM
REM  Drag to rotate. Scroll to zoom.
REM
REM  ⚠️ FIRST LOAD TAKES 25-30 SECONDS. The surfaces are baked on
REM  the GPU when the page opens. It is not stuck.
REM
REM  ⚠️ Click INTO the tab. Browsers freeze animation in tabs you
REM  are not looking at, and a frozen hunter looks like a broken one.
REM
REM  Leave the black window open while you look. Close it when done.
REM ============================================================

cd /d "%~dp0"

echo.
echo   Meshy hunter - rig + clip viewer
echo   ================================
echo.

if not exist "public\models\anim\hunter\walking.glb" (
  echo   MISSING the Meshy hunter pack.
  echo.
  echo   Place the auto-rigged GLBs in:
  echo     public\models\anim\hunter\
  echo.
  echo   Expected files come from the local Meshy pack:
  echo     assets\hunter-meshy\03-rig
  echo     assets\hunter-meshy\04-anims
  echo.
  echo   Need at least walking.glb before this tool will open.
  echo   See public\models\anim\hunter\README.md for the full list.
  echo.
  pause
  exit /b 1
)

echo   Building (about 5 seconds)...
call npm run build
if errorlevel 1 (
  echo.
  echo   BUILD FAILED. Screenshot this window and send it to Claude.
  echo.
  pause
  exit /b 1
)

echo   Starting the server on port 5182...
start "RRR hunter clips" /min cmd /c "npm run preview -- --port 5182 --strictPort"

REM --- Let the port bind before the browser asks for it. Asking too early
REM --- opens a dead tab, which is what "the link isn't taking me to anything"
REM --- looked like the first time.
ping -n 8 127.0.0.1 >nul

echo   Opening the hunter viewer...
echo.
REM --- `orbit=1` is what constructs OrbitControls at all; without it the camera
REM --- is fixed. No `capture=1` here on purpose - capture mode PARKS the render
REM --- loop between settles, so the animation would sit still and look broken.
REM ⚠️ NO CARETS INSIDE THE QUOTES. `start ""` takes the URL as one quoted
REM argument, so `&` needs no escaping there - but it DOES in `echo` lines below.
start "" "http://localhost:5182/?view=hunter.animated&clip=walking&orbit=1&quality=medium"

echo.
echo   Pick a clip from the drop down at the bottom of the page.
echo   Clips: walking running frankenstein orc jump-attack
echo          left-slash attack double-combo
echo.
echo   First load is 25-30 seconds. Click into the tab so it animates.
echo.
echo   Leave this window open while you look.
echo.
ping -n 10 127.0.0.1 >nul
