@echo off
REM ============================================================
REM  Run Robot Run - PLAY AS THE GENERATED ROBOT
REM  Double-click this. No terminal needed.
REM ============================================================
REM  Same game as PLAY.bat, but YOU are the generated,
REM  auto-rigged, skinned character instead of the old
REM  hand-built one. Face, ear rings, mint shoulder caps and
REM  chest wordmark all come with it.
REM
REM  The old skeleton is GONE from the visuals. Everything
REM  you see is the Meshy animation - walk, run, and the
REM  sledgehammer swing is the Meshy attack clip.
REM
REM  The hammer hangs off the hand and goes where the
REM  animation takes it. The damage follows the hammer, so
REM  the hit lands where you see it land.
REM
REM  To compare, delete "&mesh=1" from the address bar and
REM  reload. That is the old robot, unchanged.
REM
REM  Leave the black window open while you play.
REM ============================================================

cd /d "%~dp0"

echo.
echo   Play as the generated robot
echo   ===========================
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

echo   Starting the server on port 5179...
start "RRR play mesh" /min cmd /c "npm run preview"

REM --- Let the port bind before the browser asks for it.
ping -n 6 127.0.0.1 >nul

echo   Opening the game...
echo.
REM ⚠️ NO CARETS INSIDE THE QUOTES. `start ""` takes the URL as one quoted
REM argument, so `&` needs no escaping there - but it DOES in `echo` lines below.
start "" "http://localhost:5179/?view=game.play&mesh=1&quality=medium"

echo.
echo   ------------------------------------------------------------
echo   WHAT I NEED YOUR EYE ON
echo.
echo   1. Does it FEEL like the same game? The body is animated
echo      differently now - walk and run are real cycles, not
echo      computed poses.
echo.
echo   2. The swing is the Meshy attack clip now. Does it read
echo      as a sledgehammer blow, or as a punch with a hammer
echo      taped to it?
echo.
echo   3. How the hammer SITS in the fist is the one thing I
echo      could not measure - the hand has no landmark for it.
echo      Two knobs, add them to the address bar:
echo.
echo        ^&grip=-0.35      twist of the handle in the fist
echo        ^&griplen=0.205   how far down the handle he grips
echo.
echo      Try grip=0, grip=0.8, grip=-1.2 and tell me which.
echo.
echo   4. Knock a limb off and check the stump.
echo   ------------------------------------------------------------
echo.
echo   The OLD robot, for comparison - copy into the address bar:
echo.
echo     http://localhost:5179/?view=game.play^&quality=medium
echo.
echo   Other seeds:
echo.
echo     http://localhost:5179/?view=game.play^&mesh=1^&seed=s7^&quality=medium
echo     http://localhost:5179/?view=game.play^&mesh=1^&seed=s4^&quality=medium
echo.
echo   Close this window when you have finished playing.
echo.
pause
