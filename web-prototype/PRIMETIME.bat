@echo off
REM ============================================================
REM  PRIME TIME - double-click this to run the party night.
REM ============================================================
REM  Starts the room server AND the game server, then opens the
REM  TV screen. Everyone else joins from their phone.
REM  Leave the two black windows open all night. Close when done.
REM ============================================================

cd /d "%~dp0"

echo.
echo   PRIME TIME
echo   ==========
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

REM --- TWO servers, and both are needed. 5181 is the party ROOM (websockets,
REM --- who is in the lobby, the votes, the cues). 5179 serves the game itself,
REM --- including the mansion the TV shows. Missing the first gives you a TV
REM --- stuck on "joining the room"; missing the second gives you a room code
REM --- and a black screen where the house should be.
echo   Starting the party room server on port 5181...
start "PRIME TIME room" /min cmd /c "npm run party:local"

echo   Starting the game server on port 5179...
start "PRIME TIME server" /min cmd /c "npm run preview"

REM --- Both servers need to bind before the browser asks for them.
timeout /t 5 /nobreak >nul

echo   Opening the TV screen...
echo.
start "" "http://localhost:5179/?view=party.host"

echo   ------------------------------------------------------------
echo   HOW THE NIGHT RUNS
echo.
echo     1. The TV screen shows a ROOM CODE and a QR code.
echo.
echo     2. Everyone points their phone camera at the QR, or types
echo        the address by hand. They all need to be on the SAME
echo        WI-FI as this machine.
echo.
echo     3. When everybody is in, start it from the TV.
echo.
echo   THE MANSION IS THE MANSION. The house the TV follows the
echo   runner through is the same one PLAY.bat walks you around -
echo   the same rooms, the same materials, the same lighting. The
echo   BALLROOM is where the night opens: the camera starts in the
echo   middle of it, and it is the room the lobby sits in all night
echo   while people are still arriving.
echo   ------------------------------------------------------------
echo.
echo   IF THE PHONES CANNOT FIND IT
echo.
echo   The QR points at this machine's address on your network. If a
echo   phone will not connect, it is almost always one of:
echo.
echo     * the phone is on mobile data, not the house wi-fi
echo     * the phone is on a GUEST network that blocks local devices
echo     * Windows Firewall is asking about node.exe behind a window
echo       you have not seen yet - allow it on PRIVATE networks
echo.
echo   ------------------------------------------------------------
echo   THE OTHER SCREENS, if you want to look at one directly
echo.
echo     TV / host      http://localhost:5179/?view=party.host
echo     a phone        http://localhost:5179/?view=party.phone
echo.
echo   Close both black windows when the night is over.
echo.
pause
