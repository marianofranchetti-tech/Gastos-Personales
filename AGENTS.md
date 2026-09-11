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

# Build web

`npx expo export --platform web` sobre la carpeta montada es lentísimo (>5 min)
porque metro lee miles de archivos a través del montaje. Nativo en Windows, o en
un contenedor con el código en su propio disco, tarda menos de un minuto.

Ver `DEPLOY.md` para el deploy en Render.

# Tests

`npm test` (vitest). Los tests de base de datos corren contra SQLite de verdad
vía `node:sqlite` — ver `src/test/dbFake.ts`. No cubren el runtime de Expo.
