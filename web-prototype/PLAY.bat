@echo off
REM ============================================================
REM  Run Robot Run - double-click this to play. No terminal needed.
REM ============================================================
REM  Builds the latest code, starts the local server, opens the game.
REM  Leave the black window open while you play. Close it when done.
REM ============================================================

cd /d "%~dp0"

echo.
echo   Run Robot Run
echo   =============
echo.

REM --- ALWAYS rebuild. It takes about 3 seconds, and the old "skip if dist
REM --- exists" check meant you could play a build from days ago without
REM --- knowing it. Never worth the risk of judging stale work.
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

REM --- Give the server a moment to bind the port before the browser asks for it.
timeout /t 4 /nobreak >nul

echo   Opening the game...
echo.
REM --- quality=medium cuts the number of shader permutations the loading
REM --- screen has to compile. That compile is what makes the first load slow.
start "" "http://localhost:5179/?view=game.play&seed=s4&quality=medium"

echo   ------------------------------------------------------------
echo   WHAT IS NEW SINCE YOU LAST PLAYED
echo.
echo     * The DIG IS ON BY DEFAULT now - no ^&dig=1 needed. Swing
echo       anywhere on a wall and chunks come off where you hit it.
echo.
echo     * THE ESTATE ROOMS ARE IN THE GAME. The gallery, the studies
echo       and the ballroom at its full height are the rooms you are
echo       walking through - the same modules the art showcase uses,
echo       so the real lighting and materials come with them.
echo.
echo     * The gallery's doors are gone except the one to the spawn room.
echo.
echo   TWO TESTING KEYS - both print a line on screen when pressed
echo.
echo     B   toggle the cyan barriers off / back on. Turning them back
echo         on rolls a FRESH interconnect, so it is a new puzzle each
echo         time without reloading.
echo.
echo     G   cycle the BLACK POINT: SHIPPED - LIFTED - OPEN.
echo         This is the "is the game too dark / too crushed" question
echo         and it is yours to answer, not mine. Play a dark corner of
echo         the gallery, press G twice, and tell me which one you want.
echo         SHIPPED is exactly what you have been playing.
echo   ------------------------------------------------------------
echo.
echo   LOADING IS SLOW RIGHT NOW - about 3 minutes, and that is a known
echo   regression being fixed. Adding the three estate rooms multiplied
echo   the shader compiles. The tab stays responsive; the loading screen
echo   shows a real percentage. It is not hung.
echo.
echo   RETRY DOES NOT RELOAD. Dying or escaping and pressing Retry
echo   restarts instantly - you pay the long load ONCE per session.
echo.
echo   Do NOT use Ctrl+Shift+R (hard reload) - it throws away the shader
echo   cache and you pay the full load again. Just press F5.
echo.
echo   ------------------------------------------------------------
echo   AND THERE IS SOMETHING TO LISTEN TO - no game needed
echo.
echo     refs\audio\LISTEN.html   double-click it
echo.
echo   12 clips of the game's own audio, labelled, in order. Nobody
echo   has ever actually HEARD the sledgehammer - the test harness
echo   runs muted and you last listened before the hammer existed.
echo.
echo   Clip 08 is the one I need your ear on: a real 60-second dig,
echo   every blow. It should feel like it is GOING somewhere. If it
echo   just feels samey, say so - that is fixable. If it feels
echo   mechanical, like a metronome, say that instead - that is a
echo   different fix, in the swing rather than the sound.
echo   ------------------------------------------------------------
echo.
echo   THE MESHY HUNTER is opt-in and unfinished. Double-click
echo   PLAYHUNTER.bat, or add ^&hunterm=1 to the address bar.
echo   Default play here stays the procedural hunter on purpose.
echo.
echo   Other seeds - copy into the address bar:
echo.
echo     http://localhost:5179/?view=game.play^&seed=s7^&quality=medium
echo     http://localhost:5179/?view=game.play^&seed=s4^&black=1^&quality=medium
echo     http://localhost:5179/?view=game.play^&hunterm=1^&quality=medium
echo.
echo   Close this window when you have finished playing.
echo.
pause
