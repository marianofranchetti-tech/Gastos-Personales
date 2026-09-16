@echo off
REM Corre la app en el iPhone (o en Android) via Expo Go, por tunel.
REM El tunel va por internet: no importa que la PC este en la red de la
REM oficina y el telefono en otra. Es mas lento que la red local, pero anda.
REM
REM En el iPhone: escanear el QR con la camara del sistema.
REM En Android: escanear desde adentro de la app Expo Go.
REM
REM La ventana queda ocupada mientras corre. Ctrl+C para cortar.
cd /d "%~dp0"
echo Carpeta: %CD%
echo.
echo Levantando el tunel. La primera vez tarda un poco mas.
echo.
call npx expo start --tunnel
pause
