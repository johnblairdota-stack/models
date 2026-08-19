@echo off
REM ============================================================
REM  Run Robot Run - RIG + ANIMATION COMPARISON TOOL
REM  Double-click this. No terminal needed.
REM ============================================================
REM  Opens char.lineup: every robot we have built, standing on
REM  one ground line, ALL PLAYING THE SAME CLIP ON THE SAME FRAME.
REM
REM  Along the bottom is a DROP DOWN with every animation in it.
REM  Pick one and every rig that has it plays it, together.
REM  Arrow keys step the list. Esc returns them all to rest.
REM
REM  An entry reading  name (1/2)  means only one of the two
REM  rigs carries that clip. The line beside the drop down
REM  says which rig has it and which does not.
REM
REM  WHY SIDE BY SIDE. A collapsed robot watched on its own looks
REM  like a broken rig. Watched next to the OLD robot on the same
REM  frame, you can see instantly whether the clip is at fault or
REM  the rig is. That is how we found the Attack clip is bad on
REM  BOTH bodies, not just the new one.
REM
REM  Drag to rotate. Scroll to zoom.
REM
REM  ⚠️ FIRST LOAD TAKES 25-30 SECONDS. The surfaces are baked on
REM  the GPU when the page opens. It is not stuck.
REM
REM  ⚠️ Click INTO the tab. Browsers freeze animation in tabs you
REM  are not looking at, and a frozen robot looks like a broken one.
REM
REM  Leave the black window open while you look. Close it when done.
REM ============================================================

cd /d "%~dp0"

echo.
echo   Rig + animation comparison tool
echo   ==============================
echo.

echo   Building (about 5 seconds)...
call npm run build
if errorlevel 1 (
  echo.
  echo   BUILD FAILED. Screenshot this window and send it to Claude.
  echo.
  pause
  exit /b 1
)

echo   Starting the server on port 5181...
start "RRR rig compare" /min cmd /c "npm run preview -- --port 5181 --strictPort"

REM --- Let the port bind before the browser asks for it. Asking too early
REM --- opens a dead tab, which is what "the link isn't taking me to anything"
REM --- looked like the first time.
ping -n 8 127.0.0.1 >nul

echo   Opening the comparison tool...
echo.
REM --- `orbit=1` is what constructs OrbitControls at all; without it the camera
REM --- is fixed. `names=1` labels the robots. No `capture=1` here on purpose -
REM --- capture mode PARKS the render loop between settles, so the animation
REM --- would sit still and look broken.
start "" "http://localhost:5181/?view=char.lineup&names=1&orbit=1&quality=medium"

echo.
echo   Pick a clip from the drop down at the bottom of the page.
echo   All rigs play it together, on the same frame.
echo.
echo   First load is 25-30 seconds. Click into the tab so it animates.
echo.
echo   Add ^&all=1 to the address bar to include the older
echo   Lumi Bot variants (unwrapped, smooth, bf65).
echo.
echo   Leave this window open while you look.
echo.
ping -n 10 127.0.0.1 >nul
