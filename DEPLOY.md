# Deploy de la app web

## Qué es esto

`render.yaml` publica la app como **sitio estático** en Render: el build de Expo
para web, con SQLite corriendo dentro del navegador (wa-sqlite / WASM).

No hay backend. La base de datos vive en el navegador de cada visitante, así que:

- cada persona que entra arranca con su propia base y el seed de ejemplo;
- los datos **no** se sincronizan entre dispositivos ni entre navegadores;
- si el usuario borra los datos del sitio, se pierde todo.

Sirve para mostrar la app, probarla y compartir un link. No es la versión usable
en serio: para eso hace falta el backend de la Etapa 3.

## Pasos

1. **Subir el repo a GitHub o GitLab.** Render buildea desde un repo Git; hoy
   este repositorio no tiene remoto. Conviene que sea **privado**: los workflows
   de n8n que están en `embalog-mercadolibre/` exponen las URLs de tu Odoo y de
   tu instancia de n8n. No hay tokens hardcodeados (lo verifiqué), pero no hace
   falta publicar tu infraestructura.

2. En Render: **New > Blueprint**, apuntando al repo. Render lee `render.yaml` y
   crea el sitio solo. Si preferís hacerlo a mano (New > Static Site):

   - Build command: `npm ci && npx expo export --platform web`
   - Publish directory: `dist`
   - Variable de entorno: `NODE_VERSION` = `22.22.2`

3. El primer build tarda unos minutos (instala dependencias y bundlea ~2.500
   módulos). Los siguientes reusan caché.

## Cosas que ya están resueltas, para no re-descubrirlas

- **No hacen falta headers COOP/COEP.** El VFS que usa expo-sqlite en web no
  necesita `SharedArrayBuffer`. Está verificado corriendo el build en un browser
  headless sin esos headers: la base abre, migra y consulta sin errores.
  Agregar `Cross-Origin-Embedder-Policy: require-corp` bloquea recursos
  cross-origin y rompe más de lo que arregla.
- **El `.wasm` se sirve solo.** `metro.config.js` ya incluye `wasm` en
  `assetExts`, así que el archivo entra en `dist/assets/` y Render lo sirve con
  el `Content-Type` correcto.
- **`dist/` está en `.gitignore`** a propósito: lo construye Render, no se
  commitea.

## Verificar un build sin desplegar

```bash
npm ci
npx expo export --platform web
npx serve dist        # o cualquier servidor estático
```

Si la app carga y ves datos en "Por pagar", SQLite arrancó bien en el navegador.
