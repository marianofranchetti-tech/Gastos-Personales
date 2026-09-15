@echo off
REM Corre la suite de tests. Tiene que ser desde Windows: ver AGENTS.md.
cd /d "%~dp0"
call npm test
pause
