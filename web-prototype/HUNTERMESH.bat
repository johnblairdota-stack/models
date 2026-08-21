@echo off
REM ============================================================
REM  Run Robot Run - THE GENERATED HUNTER, BESIDE THE GENERATED PLAYER
REM  Double-click this. No terminal needed.
REM ============================================================
REM  Opens hunter.mesh: the player you actually play as in game.play,
REM  then the three hunter stages, on one ground line under one light
REM  rig. The question this view exists to answer is one question:
REM
REM      DO THEY LOOK LIKE THE SAME MACHINE?
REM
REM  That is the whole horror of the hunter - it is your own chassis,
REM  corrupted - and since the player became the generated robot on
REM  2026-08-19 the procedural hunter has not been the same chassis
REM  as anything.
REM
REM  ⚠️ THE CAPTION IN THE FRAME IS THE IMPORTANT PART. Until the
REM  hunter bodies have been generated (MESHYHUNT.bat), all three
REM  stages are the PLAYER'S body wearing the stage's grime, and the
REM  page says so across the top. Three copies of the player is not
REM  a hunter; what it does show is the family resemblance and the
REM  grime ramp, both of which are real.
REM
REM  Address bar knobs:
REM    ^&proc=1        put the PROCEDURAL stages in the same row - the
REM                   A/B that decides whether this is an improvement
REM    ^&huntereyes=1  force the red slit eyes on (off on the stand-in,
REM                   whose face already has eyes painted on it)
REM    ^&huntergrime=0 no stage tint, to see the bare bodies
REM    ^&hunterrider=0 no stolen torso on stage 3
REM    ^&label=0       no caption, for a measurement crop
REM
REM  Drag to rotate. Scroll to zoom.
REM
REM  Leave the black window open while you look. Close it when done.
REM ============================================================

cd /d "%~dp0"

echo.
echo   The generated hunter ramp
echo   =========================
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

echo   Starting the server on port 5182...
start "RRR hunter mesh" /min cmd /c "npm run preview -- --port 5182 --strictPort"

REM --- Let the port bind before the browser asks for it. Asking too early opens a dead tab.
ping -n 8 127.0.0.1 >nul

echo   Opening the view...
echo.
start "" "http://localhost:5182/?view=hunter.mesh&orbit=1&quality=medium"

echo.
echo   ------------------------------------------------------------
echo   WHAT I NEED YOUR EYE ON
echo.
echo   1. Player, then stage 1, 2, 3, left to right. Does the ramp
echo      ESCALATE? It is measured as monotonic - 1.000, 0.920,
echo      0.877, 0.828 of the player's brightness - but a number
echo      cannot tell you whether it reads.
echo.
echo   2. Do the hunters look like the player's machine, or like
echo      three copies of the player? Right now they ARE three
echo      copies, so the honest question is what the generated
echo      bodies have to change.
echo.
echo   3. Stage 3 carries the stolen torso on its shoulders. Does
echo      it read as ABSORPTION, or as two robots?
echo   ------------------------------------------------------------
echo.
echo   Leave this window open while you look.
echo.
ping -n 10 127.0.0.1 >nul
