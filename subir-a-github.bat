@echo off
setlocal
cd /d "%~dp0"
echo ==================================================
echo  Subir el proyecto a GitHub
echo ==================================================
echo.
echo Repo:  marianofranchetti-tech/Gastos-Personales
echo Rama:  main   (17 commits)
echo.
echo ATENCION: esto REEMPLAZA lo que hay hoy en el repo.
echo El commit "Init" que esta alla ahora se pierde.
echo Ese codigo es otro proyecto, no el de esta carpeta.
echo.
echo Se va a abrir el navegador para autorizar con GitHub.
echo Asegurate de entrar con la cuenta marianofranchetti-tech,
echo NO con la de Bello Export, o el push va a fallar.
echo.
pause
echo.
git push --force -u origin main
echo.
if errorlevel 1 (
  echo ==================================================
  echo  FALLO. Copiá el error de arriba y pasamelo.
  echo ==================================================
) else (
  echo ==================================================
  echo  LISTO. Ahora en Render:
  echo   New - Blueprint - elegir Gastos-Personales
  echo  Lee render.yaml solo, no configures nada a mano.
  echo ==================================================
)
pause
