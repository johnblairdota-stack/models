@echo off
title Run Robot Run - audio
cd /d "%~dp0"
start "" http://127.0.0.1:5231/
node _listen-server.mjs
pause
