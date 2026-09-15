@echo off
REM Compila el APK de Android en los servidores de EAS.
REM Doble clic y listo: se para solo en la carpeta correcta.
REM La cola gratuita puede tardar de 10 a 40 minutos.
cd /d "%~dp0"
echo Carpeta: %CD%
echo.
call npx eas-cli build --platform android --profile preview
echo.
echo ---
echo Si termino bien, el link del APK esta arriba y en expo.dev
pause
