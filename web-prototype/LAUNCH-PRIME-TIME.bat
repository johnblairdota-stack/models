@echo off
set ROOT=%~dp0
set CHROME=
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe
if "%CHROME%"=="" (
  echo Chrome not found
  exit /b 1
)
start "" "%CHROME%" --new-window --window-size=1280,800 --window-position=40,40 "http://localhost:5178/?view=party.host"
timeout /t 1 /nobreak >nul
start "" "%CHROME%" --new-window --window-size=390,844 --window-position=40,60 "http://localhost:5178/?view=party.phone"
timeout /t 1 /nobreak >nul
start "" "%CHROME%" --new-window --window-size=390,844 --window-position=450,60 "http://localhost:5178/?view=party.phone"
