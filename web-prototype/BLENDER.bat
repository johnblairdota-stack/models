@echo off
REM ============================================================
REM  Run Robot Run - INSTALL BLENDER
REM  Double-click this. No terminal needed.
REM ============================================================
REM  Blender is what the asset conditioning script runs inside.
REM  Nothing in the new asset pipeline works without it.
REM
REM  Installs the Long Term Support build (4.5), not the newest.
REM  LTS is the right choice here because the conditioning script
REM  is automation: a Blender point release changing a Python API
REM  under it would break the pipeline silently, and LTS gets two
REM  years of fixes without that.
REM
REM  Windows may pop up a permission box. Say yes.
REM  Takes a few minutes. It is a big download.
REM ============================================================

cd /d "%~dp0"

echo.
echo   Installing Blender (Long Term Support 4.5)
echo   ==========================================
echo.

where winget >nul 2>&1
if errorlevel 1 (
  echo   winget is not available on this PC, so this script cannot
  echo   install anything. Download Blender manually instead:
  echo.
  echo     https://www.blender.org/download/lts/
  echo.
  pause
  exit /b 1
)

winget install --id BlenderFoundation.Blender.LTS.4.5 --accept-source-agreements --accept-package-agreements
if errorlevel 1 (
  echo.
  echo   INSTALL FAILED. Screenshot this window and send it to Claude.
  echo.
  pause
  exit /b 1
)

echo.
echo   Done. Checking Blender can actually be run...
echo.

REM --- Verify, do not assume. winget reporting success is not the same
REM --- as blender.exe existing somewhere the pipeline can call it.
set "BL="
for %%D in ("%ProgramFiles%\Blender Foundation\Blender 4.5\blender.exe") do if exist %%D set "BL=%%~D"
if not defined BL (
  echo   Installed, but blender.exe was not found where expected.
  echo   Tell Claude - the conditioning script needs the real path.
) else (
  echo   Found: %BL%
  "%BL%" --version
)

echo.
echo   You can close this window.
echo.
ping -n 6 127.0.0.1 >nul
