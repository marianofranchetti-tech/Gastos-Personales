@echo off
setlocal
cd /d "%~dp0"
echo ============================================
echo  Subir el proyecto a GitHub
echo ============================================
echo.
echo Antes de seguir necesitas dos cosas:
echo.
echo  1) Un repositorio PRIVADO y VACIO en github.com
echo     (sin README, sin .gitignore, sin licencia)
echo.
echo  2) Un token de acceso personal, que se usa en vez
echo     de la contrasena. Se saca en:
echo     github.com - Settings - Developer settings -
echo     Personal access tokens - Tokens (classic)
echo     Marcar el permiso "repo".
echo.
pause
echo.
set /p REPO="Pega la URL del repo (https://github.com/usuario/repo.git): "
if "%REPO%"=="" goto :fin
echo.
git remote remove origin 2>nul
git remote add origin %REPO%
echo Remoto configurado:
git remote -v
echo.
echo Subiendo... te va a pedir usuario y el TOKEN como contrasena.
echo.
git push -u origin feat/recurrentes
echo.
echo ============================================
echo  Si termino bien, ya podes ir a Render:
echo  New - Blueprint - elegir este repo
echo  Lee render.yaml solo, no configures nada.
echo ============================================
:fin
pause
