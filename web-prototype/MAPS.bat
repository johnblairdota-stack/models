@echo off
REM ============================================================
REM  Run Robot Run - MAP DESIGNER. Double-click this. No terminal needed.
REM ============================================================
REM  Draws the procedural house plans as real floor plans instead of
REM  the ASCII I sent you last time, which was the wrong medium and
REM  my mistake. Step through seeds, drag the rooms about, and watch
REM  the numbers move.
REM
REM  It does NOT build the game and does NOT touch dist/, so it is
REM  safe to run while PLAY.bat is up. Different port (5181).
REM ============================================================

cd /d "%~dp0"

echo.
echo   Run Robot Run - MAP DESIGNER
echo   ============================
echo.
echo   Starting the map server on port 5181...

start "RRR map designer" /min cmd /c "node tools\mapdesigner\serve.mjs"

REM --- give the server a moment to bind the port before the browser asks
timeout /t 2 /nobreak >nul

echo   Opening the designer...
start "" "http://localhost:5181/tools/mapdesigner/"

echo.
echo   ------------------------------------------------------------
echo   WHAT THIS IS
echo.
echo     You asked for "a tool to design room layouts and corridors
echo     to show the progress ... a map spawner that the game can
echo     use to position the rooms". This is that, first pass.
echo.
echo     The page explains itself - there is a WHAT AM I LOOKING AT
echo     panel at the top right, open by default. Read that, not this
echo     window.
echo.
echo   YOUR FOUR QUESTIONS ARE ANSWERED ON THE PAGE NOW
echo.
echo     - THE BROWN is the rest of the same diggable wall, the bit
echo       no panel fitted on. Not a different kind of wall.
echo.
echo     - THE CYAN. You were right and the earlier answer here was
echo       wrong. Cyan was doing THREE jobs at once on that plan, so
echo       it is now doing exactly one.
echo.
echo       CYAN now means one thing only: A HARD STOP. A boundary
echo       with under 1.20 m of shared wall, no dig face fits, and
echo       there is no orange in front of it to try.
echo.
echo       THE ONE WAY THROUGH IS NOW LIME, and it is called the
echo       SOFT SPOT. One per shared wall, 1.55 m wide. Dig it and
echo       you are in the next room, and the first person to find
echo       one switches the unbreakable brick off for everybody.
echo       It used to be drawn cyan, which made the one way through
echo       look like the things that stop you dead. That was the
echo       fault you spotted.
echo.
echo       AND THE UNBREAKABLE BRICK IS NOT ON THE PLAN AT ALL. It
echo       stands BEHIND the orange and this is a view from above,
echo       so there is nowhere to draw it. The lime blob is the one
echo       GAP in it. That is the whole answer.
echo.
echo     - THE RED DOORS WERE DRAWN WRONG AND YOU WERE RIGHT TO ASK.
echo       Red = chained = nobody forces it, not even the hunter.
echo       The doors HE batters are the AMBER ones, and they now
echo       carry his mark in magenta. Full explanation in the panel
echo       "The three doors, and one of them was drawn wrong".
echo.
echo     - THE ZERO-DIG POCKET is the part of the house you can walk
echo       to from your spawn without swinging the hammer once.
echo.
echo     Also fixed: the green door that clipped into the hallway.
echo     It was real. It was in the generator, not just the drawing.
echo.
echo   THREE THINGS TO TRY FIRST
echo.
echo     1. Hold the right arrow key and watch fifty houses go past.
echo        You are looking for ones that read as a HOUSE.
echo        Press 1 / 2 / 3 to call one GOOD / MEH / BAD - one key,
echo        it saves to a file, and it jumps to the next seed.
echo.
echo     2. Tick "SLAB ARM" in the Show list. Every wall redraws as
echo        the single faces it would actually become. Red ticks are
echo        seams - and every one of them is a door, because a slab
echo        cannot have a doorway in it yet. That one is not solved
echo        and the page says so.
echo.
echo     3. Press E for edit mode and drag a room somewhere else.
echo        Every number on the right updates as you drag, because
echo        the tool hands your layout back to the same generator.
echo.
echo   ------------------------------------------------------------
echo   THE ONE THING I WOULD ACTUALLY ASK YOU TO DO NEXT
echo.
echo     PRESS H. The purple dashed route disappears, and so does
echo     every number that tells you how long it is.
echo.
echo     Here is why, and it is your own point back at you. You
echo     said you could think about the room layout and the paths
echo     but not the door functions, and that you do not know what
echo     a good one looks like yet. Your first forty labels agree
echo     with you: the ONLY thing that separated your GOOD from
echo     your BAD was how far the route is from the start to the
echo     way out - and that route is the brightest line on the
echo     drawing, with its length printed in big numbers beside it.
echo.
echo     So I cannot yet tell the difference between "John has an
echo     eye for houses with a journey in them" and "John read the
echo     number I printed". Those are the same data.
echo.
echo     PRESS H AND LABEL FORTY MORE. If your verdicts come out
echo     the same way with the line gone, it was your eye and we
echo     can build on it. If they scatter, it was my drawing, and
echo     I would have built the wrong thing on top of it.
echo.
echo     You will know you are in it: there is a purple ROUTE
echo     HIDDEN bar across the top of the plan the whole time, and
echo     the button in the header reads "route: HIDDEN". The
echo     verdicts save exactly the same way, tagged with which
echo     arm they came from. Press H again to go back.
echo.
echo   ------------------------------------------------------------
echo.
echo   If the page is blank or says 404, screenshot this window AND
echo   the browser and send both to Claude.
echo.
echo   Close this window when you are finished.
echo.
pause
