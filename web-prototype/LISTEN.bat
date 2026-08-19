@echo off
REM ============================================================
REM  Run Robot Run - hear the game's sounds. Double-click this.
REM ============================================================
REM  Opens 15 clips of the game's real audio in your browser.
REM  No game, no waiting. Just press play on each.
REM
REM  THIS ROUND: the cyan barrier is a FORCE FIELD, not a clank.
REM  Clips 04a / 04b / 04c are three versions of it - pick one.
REM  Clip 08 is still the one that matters - a real 60-second
REM  dig, every blow, in order.
REM ============================================================
REM  It hands off to refs\audio\LISTEN.bat, which serves the
REM  files over localhost. Opening the .html directly used to
REM  work only sometimes: Chrome will not always fetch sibling
REM  .wav files off a file:// page, and when it refuses you get
REM  fifteen dead players and no explanation.
REM  Close the little black window when you are done listening.
REM ============================================================

call "%~dp0refs\audio\LISTEN.bat"
