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

1. **El repo ya está en GitHub** (`marianofranchetti-tech/Gastos-Personales`).
   Render buildea desde ahí. La integración Odoo ↔ Mercado Libre de Embalog
   vive en su propio repo privado (`embalog-mercadolibre`): no la vuelvas a
   meter acá.

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


---

# APK de Android (EAS Build)

Genera un APK instalable en cualquier Android, sin Expo Go y sin depender de la
red local. Es un build release con el JS empaquetado: prueba el SQLite **nativo**,
que es otra implementación distinta a la del navegador y a la de los tests.

## Una sola vez

```
npx eas-cli login
```

Necesita una cuenta de Expo (gratis, https://expo.dev/signup). La primera vez que
buildees te va a preguntar si crea el proyecto en tu cuenta: decile que sí. Eso
escribe un `extra.eas.projectId` en `app.json`.

También te va a ofrecer generar un **keystore** y guardarlo en su servidor.
Aceptá. Ese keystore es lo que firma la app: si algún día publicás en Play y lo
perdés, no podés volver a subir actualizaciones de esa app nunca más. EAS lo
guarda y lo podés descargar con `npx eas-cli credentials`.

## Cada build

```
npx eas-cli build --platform android --profile preview
```

Buildea en los servidores de Expo, no en tu máquina — no hace falta Android
Studio ni el SDK. En el plan gratuito la cola puede tardar de 10 a 40 minutos.
Cuando termina te da un link de descarga y un QR: abrilo desde el teléfono,
descargá el APK y tocalo para instalar.

Android va a avisar que es de un "origen desconocido". Es esperable: la app no
viene de Play. Hay que permitir la instalación para el navegador o el gestor de
archivos que uses.

## Los perfiles

- `preview` → APK instalable a mano. Es el de todos los días para probar.
- `development` → APK con dev client; recarga el código desde tu máquina como
  Expo Go, pero con los módulos nativos del proyecto. Útil cuando agreguemos
  algo que Expo Go no soporta.
- `production` → AAB para subir a Google Play. No lo uses todavía.

## El identificador

`android.package` es `com.franchetti.gastos`. No se le muestra al usuario —eso es
`expo.name`, hoy "Gastos"— pero **queda fijo para siempre al primer envío a Play**.
Está elegido a propósito sin la marca provisoria: si "Fluxo" cambia de nombre, el
identificador sigue sirviendo y no obliga a publicar una app nueva.

Mientras no subas a Play, se puede cambiar. Después, no.


---

# Probar en iPhone

## Gratis, sin cuenta de Apple: Expo Go

Doble clic en `expo-go.bat`, o desde la terminal en la carpeta del proyecto:

```
npx expo start --tunnel
```

Instalá **Expo Go** desde el App Store y escaneá el QR **con la cámara del
sistema** (en Android es al revés: se escanea desde adentro de Expo Go).

El túnel va por internet, así que no importa en qué red esté cada dispositivo.
Es lo que resuelve el caso típico de la PC en la red de la oficina y el teléfono
en otra.

Corre el SQLite nativo de iOS, o sea que la prueba es real. Lo que no tenés es
un ícono propio en la pantalla de inicio, y necesitás la PC prendida con el
túnel corriendo.

## Una app instalada de verdad: US$99 por año

Apple exige cuenta de desarrollador paga incluso para poner la app en tu propio
teléfono, incluso por TestFlight. No hay camino gratis, a diferencia de Android.

Cuando tengas la cuenta, ya está todo preparado:

- `app.json` tiene `ios.bundleIdentifier` = `com.franchetti.gastos`, el mismo
  criterio neutro que el package de Android: **queda fijo para siempre al primer
  envío a la App Store**, así que no lleva la marca provisoria adentro.
- `eas.json` tiene los perfiles con `ios.simulator: false`, o sea build para
  teléfono real.

El comando pasa a ser:

```
npx eas-cli build --platform ios --profile preview
```

Te va a pedir las credenciales de Apple y registrar el UDID del teléfono. Para
distribuir a otras personas conviene TestFlight, que sale del mismo build.

## Qué obliga a rebuildear y qué no

Con `expo-updates` instalado, los cambios de código (pantallas, textos,
cálculos, gráficos) se mandan por aire con `eas update` y llegan al abrir la
app. Solo hace falta compilar de nuevo si cambia algo nativo: una librería con
código propio, permisos del sistema, el ícono o el nombre de la app.
