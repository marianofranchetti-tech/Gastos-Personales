@echo off
REM Abre la app en el navegador (dev server de Expo).
cd /d "%~dp0"
call npm run web
pause
