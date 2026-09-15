# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Este proyecto vive en Windows

El repo está en un disco Windows. Si trabajás sobre él desde un puente Linux
(Cowork, WSL, un contenedor con la carpeta montada), vale para leer y editar
archivos, pero **nunca corras `npm install` / `npm ci` desde el lado Linux**.

npm crea las entradas de `node_modules/.bin` según el SO: en Windows escribe
shims `.cmd` y `.ps1`; desde Linux escribe symlinks de Unix. Windows no puede
hacer `lstat` sobre esos symlinks, y el watcher de Metro revienta al arrancar:

```
Error: EACCES: permission denied, lstat 'node_modules\.bin\nanoid'
```

El error apunta a un paquete cualquiera (el primero que el walker toca), no al
que instalaste — despista.

Si ya pasó: borrá los symlinks y regenerá los shims desde Windows.

```bash
find node_modules -path "*/.bin/*" -type l -delete   # desde el lado Linux
```
```
npm install                                          # desde Windows
```

Instalá siempre desde una terminal de Windows, en `Desktop\CLAUDE`.

## La contracara: `node_modules` sirve a un solo SO a la vez

Varios paquetes traen binarios nativos y npm instala el de la plataforma donde
corre. Instalando desde Windows —que es lo correcto— `rolldown` (dentro de
vitest) queda con el binding de Windows, y entonces `npm test` **falla desde el
lado Linux** con:

```
Cannot find native binding ... @rolldown/binding-wasm32-wasi
```

No está roto: está bien instalado, para Windows. `npm test` se corre desde
Windows. Un agente que trabaje desde el puente y necesite correr la suite, que
copie el código a su propio entorno e instale ahí, sin tocar este `node_modules`.

No intentes que funcione en los dos lados a la vez: reinstalar desde Linux para
arreglar los tests vuelve a romper Metro, y da vueltas en círculo.

# Build web

`npx expo export --platform web` sobre la carpeta montada es lentísimo (>5 min)
porque metro lee miles de archivos a través del montaje. Nativo en Windows, o en
un contenedor con el código en su propio disco, tarda menos de un minuto.

Ver `DEPLOY.md` para el deploy en Render.

# Tests

`npm test` (vitest). Los tests de base de datos corren contra SQLite de verdad
vía `node:sqlite` — ver `src/test/dbFake.ts`. No cubren el runtime de Expo.
