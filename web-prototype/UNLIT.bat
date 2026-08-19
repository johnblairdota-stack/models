@echo off
REM ============================================================
REM  Run Robot Run - THE UNLIT REFERENCE FOR MESHY
REM  Double-click this. No terminal needed.
REM ============================================================
REM  Opens the player with NO LIGHTING IN IT AT ALL - flat colour
REM  only. This is what you upload to Meshy so it does not bake
REM  our key light, our highlights or our contact shadows into
REM  the new model's texture.
REM
REM  Four tabs open: front, left side, right side, back.
REM
REM  The finished PNGs are already on disk, ready to upload:
REM    progress\shots\unlit\player_unlit_front.png
REM    progress\shots\unlit\player_unlit_side-left.png
REM    progress\shots\unlit\player_unlit_side-right.png
REM    progress\shots\unlit\player_unlit_back.png
REM
REM  Knobs you can type into the address bar:
REM    unlitocc=1   put the panel-seam grooves back as shading
REM    unlitemis=1  put the glowing face and mint sheen back
REM    shellwarm=0  cool near-white shell instead of the cream albedo
REM    bg=ffffff    white background instead of mid-grey
REM
REM  Leave the black window open while you look. Close it when done.
REM ============================================================

cd /d "%~dp0"

echo.
echo   Unlit reference - flat colour, no lighting
echo   =========================================
echo.

echo   Building (about 4 seconds)...
call npm run build
if errorlevel 1 (
  echo.
  echo   BUILD FAILED. Screenshot this window and send it to Claude.
  echo.
  pause
  exit /b 1
)

echo   Starting the server on port 5179...
start "RRR unlit viewer" /min cmd /c "npm run preview"

REM --- Let the port bind before the browser asks for it.
ping -n 5 127.0.0.1 >nul

echo   Opening the four elevations...
echo.
REM --- solo=1 is NOT optional: without it the rig sits off to one side with the
REM     procedural robot next to it. bind=1 holds the neutral bind pose.
set U=http://localhost:5179/?view=mesh.animated^&unlit=1^&solo=1^&clip=n30^&bind=1^&label=0^&quality=medium
start "" "%U%&azim=0"
ping -n 3 127.0.0.1 >nul
start "" "%U%&azim=90"
ping -n 3 127.0.0.1 >nul
start "" "%U%&azim=-90"
ping -n 3 127.0.0.1 >nul
start "" "%U%&azim=180"

echo.
echo   The four PNGs to upload are in progress\shots\unlit\
echo.
echo   Leave this window open while you look.
echo.
ping -n 8 127.0.0.1 >nul
