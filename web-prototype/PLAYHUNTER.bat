@echo off
REM ============================================================
REM  Run Robot Run - PLAY WITH THE MESHY HUNTER
REM  Double-click this. No terminal needed.
REM ============================================================
REM  Same game as PLAY.bat, but the hunter is the Meshy stage-3
REM  skinned mesh instead of the procedural buildHunter body.
REM
REM  Clips in-game (only these four):
REM    walking / running          locomotion
REM    attack / double-combo      take / slam / door bang
REM
REM  frankenstein, orc, jump-attack, left-slash stay in the
REM  NEWHUNTER.bat viewer. They are not wired into the AI.
REM
REM  THIS IS AN UNFINISHED ART PATH. Extra arms were auto-rigged
REM  as a biped, so skin weights on the grafted limbs will look
REM  wrong. Damage timing is still the procedural windup, not a
REM  measured contact frame. Default play (PLAY.bat) is unchanged.
REM
REM  To compare, delete "&hunterm=1" from the address bar and
REM  reload. That is the old hunter, unchanged.
REM
REM  Leave the black window open while you play.
REM ============================================================

cd /d "%~dp0"

echo.
echo   Play with the Meshy hunter
echo   ==========================
echo.

if not exist "public\models\anim\hunter\walking.glb" (
  echo   MISSING the Meshy hunter pack.
  echo.
  echo   Place the auto-rigged GLBs in:
  echo     public\models\anim\hunter\
  echo.
  echo   Need at least:
  echo     walking.glb
  echo     running.glb
  echo     attack.glb
  echo     double-combo-attack.glb
  echo.
  echo   See public\models\anim\hunter\README.md
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

echo   Starting the server on port 5179...
start "RRR play hunter mesh" /min cmd /c "npm run preview"

REM --- Let the port bind before the browser asks for it.
ping -n 6 127.0.0.1 >nul

echo   Opening the game...
echo.
REM ⚠️ NO CARETS INSIDE THE QUOTES. `start ""` takes the URL as one quoted
REM argument, so `&` needs no escaping there - but it DOES in `echo` lines below.
start "" "http://localhost:5179/?view=game.play&hunterm=1&quality=medium"

echo.
echo   ------------------------------------------------------------
echo   WHAT I NEED YOUR EYE ON
echo.
echo   1. Does the hunter READ as the Meshy stage-3 creature in
echo      the halls - walking on patrol, running when it commits?
echo.
echo   2. The take / wall slam / door bang should flip between
echo      attack and double-combo. Variety, not one loop.
echo.
echo   3. Extra arms will look wrong. That is the Meshy biped
echo      auto-rig, not a code bug. Say if the SILHOUETTE is
echo      still readable.
echo.
echo   4. The hunter is still the AI. It should hunt you, not
echo      stand there as a costume.
echo   ------------------------------------------------------------
echo.
echo   The PROCEDURAL hunter, for comparison:
echo.
echo     http://localhost:5179/?view=game.play^&quality=medium
echo.
echo   Other seeds:
echo.
echo     http://localhost:5179/?view=game.play^&hunterm=1^&seed=s7^&quality=medium
echo     http://localhost:5179/?view=game.play^&hunterm=1^&seed=s4^&quality=medium
echo.
echo   Clip viewer (not the game): NEWHUNTER.bat
echo.
echo   Close this window when you have finished playing.
echo.
pause
