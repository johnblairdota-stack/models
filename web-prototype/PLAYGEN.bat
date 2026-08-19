@echo off
REM ============================================================
REM  Run Robot Run - THE GENERATED HOUSE. Double-click this.
REM ============================================================
REM  A different mansion every seed, packed by the generator
REM  instead of the six hand-placed rooms. First time this has
REM  ever been walkable.
REM
REM  Same server and port as PLAY.bat. If PLAY.bat's black
REM  window is already open, CLOSE IT FIRST or the port is taken.
REM ============================================================

cd /d "%~dp0"

echo.
echo   Run Robot Run - THE GENERATED HOUSE
echo   ===================================
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

echo   Opening seed 5...
echo.
REM ⚠️ NO CARETS INSIDE THE QUOTES. `start ""` takes the URL as one quoted
REM argument, so `&` needs no escaping here and a `^` becomes a LITERAL
REM character in the address bar — which sent John to view "game.play^" and
REM painted VIEW FAILED. The `^&` escaping below is correct and necessary,
REM because `echo` text is UNQUOTED. Two different rules, one file.
REM ⚠️ SEED 5, NOT 0. A house gets 3 rooms drawn from the library, and only the
REM gallery / study / ballroom HAVE dressing — the chapel and the service passage
REM have never had an `order`, in the authored house either. Seed 0 rolls
REM study+service+chapel, i.e. 1 of 3 rooms with any art on it, which is the worst
REM showcase in the first ten. Seed 5 is ballroom+gallery+study: one of each
REM dressed type, 3 of 3.
start "" "http://localhost:5179/?view=game.play&plan=gen&planseed=5&quality=medium"

echo   ------------------------------------------------------------
echo   WHAT THIS IS
echo.
echo     You said you could not judge a house from a map, and you
echo     were right - so here is one you can walk instead. The
echo     rooms, the corridors between them and the doors are all
echo     packed from the seed number.
echo.
echo     Change the seed, get a different house. Nothing is
echo     hand-placed.
echo.
echo   NEW ON 2026-08-19 - IT IS ALL IN ONE HOUSE NOW
echo   ------------------------------------------------------------
echo     * You ARE the new robot. The rigged one you approved,
echo       carrying its own 38 animations.
echo     * The furniture is in the generated rooms and the
echo       sledgehammer breaks it.
echo     * The sledgehammer is ON THE FLOOR in your first room.
echo       Walk to it and press E.
echo     * The hunter patrols THIS house. He used to walk a route
echo       written for the old hand-built one, which is why he
echo       seemed to wander through walls.
echo.
echo   THE DIG IS IN NOW - one slab per wall, doors punched
echo   through it, exactly the way you chose.
echo.
echo     Earlier this file said "every diggable wall" when there
echo     were none, then said the dig was missing. Both are out
echo     of date: it landed. 17 to 36 diggable walls per house
echo     against the authored house's 7, and 394 to 709 metres
echo     of wall you can break against its 47.
echo.
echo   *** WHAT CHANGED AFTER YOUR PLAYTEST - all four are yours ***
echo.
echo     1. THE DOORS ARE SHUT. Every door between rooms starts
echo        breachable, so you are sealed in the room you spawn
echo        in. Measured: you can now walk to 1 space out of 18,
echo        where before you could walk to all of them.
echo.
echo        Corridors are the exception and on purpose - one
echo        corridor is emitted as several rectangles, so sealing
echo        those joints would saw every corridor into a row of
echo        boxes. Only doors BETWEEN rooms are shut.
echo.
echo     2. THE INTERCONNECT IS PER ROOM NOW. Each room has ONE
echo        soft spot, and finding it drops the cyan barrier on
echo        that room's walls only. Every other room keeps its
echo        own. Measured on the authored house: digging out of
echo        the service passage opened 3 of 7 walls and left 14
echo        faces still barriered.
echo.
echo        It also unlocks THE ROOM YOU ARE STANDING IN - the
echo        soft spot is one spot in one wall and works from
echo        either side, so it opens whichever room you dug from.
echo.
echo     3. THE SLEDGEHAMMER IS ACTUALLY IN THE HOUSE. It was
echo        being placed at a hand-authored spot that does not
echo        exist in a generated map, so it was never spawned at
echo        all. That is why you had no hammer. It now drops
echo        where you spawn.
echo.
echo     4. Every seed's soft spot has MOVED, because it is
echo        placed per room now. Old seed notes are void.
echo.
echo   *** PRESS F - THE FLY-OVER ***
echo.
echo     This file has been asking you "does it read as a PLACE or
echo     a layout?" and giving you no way to see the place. Press
echo     F and you rise above the house with every ceiling hidden.
echo     Press F again to drop back in.
echo.
echo     It is the real built house from above - your walls, your
echo     coat, the dig faces, the doorways - not the map tool's
echo     diagram. That is the view that answers the question.
echo.
echo   *** THE HOUSES ARE HALF THE SIZE NOW ***
echo.
echo     You asked for 3 rooms instead of 6, so that is the
echo     default. About 4 to 5 spaces per house instead of 9.
echo     Add ^&planrooms=6 to get the big ones back.
echo.
echo     WARNING: every seed is a different house now. A seed
echo     number from earlier today does not mean the same thing.
echo.
echo   *** WHAT I WANT YOUR EYE ON ***
echo.
echo     Is being sealed in one room the right amount of stuck?
echo     Right now it is the strongest version - every door shut.
echo     If it is too much, add ^&gendoors=open to the address to
echo     get the old wander-anywhere arm back and tell me which
echo     one feels like the game.
echo.
echo   WALK THESE THREE - copy into the address bar
echo.
echo     http://localhost:5179/?view=game.play^&plan=gen^&planseed=5^&quality=medium
echo     http://localhost:5179/?view=game.play^&plan=gen^&planseed=4^&quality=medium
echo     http://localhost:5179/?view=game.play^&plan=gen^&planseed=6^&quality=medium
echo.
echo     ALL THREE ROOMS ARE DRESSED on these. Seed 5 is
echo     ballroom + gallery + study, one of each kind.
echo.
echo     A house draws 3 rooms and only the GALLERY, STUDY and
echo     BALLROOM have art. The CHAPEL and SERVICE PASSAGE have
echo     never had any - not here, and not in your authored
echo     house. They carry pilasters and nothing else.
echo.
echo     Seed 0 rolls study + service + chapel, so 1 room in 3
echo     has anything on its walls. That is what you saw, and it
echo     is the worst draw in the first ten.
echo.
echo   ------------------------------------------------------------
echo   WHAT IS ROUGH, SO YOU ARE NOT JUDGING THE WRONG THING
echo.
echo     * YOUR ART IS IN NOW. The gallery, study and ballroom
echo       carry their own order, pilasters and columns, turned
echo       with the room. Judge the SURFACE as well as the shape.
echo.
echo     * THE CHAPEL AND THE SERVICE PASSAGE ARE STILL BARE, and
echo       that is not a generator problem - they have never had
echo       an order, in your authored house either. They are the
echo       next real art job.
echo.
echo     * THE HUNTER IS IN IT. You spotted that and I had it
echo       wrong. He walks a patrol route inherited from the old
echo       hand-built mansion, so in a small house he mostly
echo       stands still. You said leave him; he is left.
echo.
echo     * SOME SEEDS still have a pocket you cannot reach, from a
echo       decomposition artifact in the generator. The old list
echo       of bad seeds is VOID - changing the room count re-rolled
echo       every one of them.
echo.
echo   ------------------------------------------------------------
echo   WHAT I WANT TO KNOW
echo.
echo     1. Does it read as a PLACE, or as a layout? That is the
echo        whole question and it is the one you could not answer
echo        from the map.
echo.
echo     2. I warned you every house might come out a long shoebox
echo        pointing the same way. It did NOT happen - the packing
echo        kept its variety even with rooms unturned. Tell me if
echo        that matches what you see, because it is the one
echo        prediction I made that the build disagreed with.
echo.
echo     3. Is a corridor a corridor, or a gap between boxes?
echo.
echo   THREE DIALS YOU CAN TURN - add to the address bar
echo.
echo     ^&planwaste=0.10     how much leftover space is allowed
echo     ^&plangap=3.0        how far apart rooms sit
echo     ^&planalign=0.6      how hard rooms snap to each other
echo.
echo     Defaults are 0.04 / 2.2 / 0.35. These are the knobs I
echo     would otherwise have guessed for you. Turn them, walk it,
echo     tell me which house you liked.
echo.
echo   ------------------------------------------------------------
echo   The B and G keys still work. So does C now - it cycles the
echo   DIG COAT: every diggable wall wearing its own room's
echo   panelling instead of the same wallpaper everywhere. Arm 0
echo   is what you have been playing.
echo   ------------------------------------------------------------
echo.
echo   Close this window when you have finished.
echo.
pause
