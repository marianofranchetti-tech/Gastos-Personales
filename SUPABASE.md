# Cuentas y sincronización con Supabase

## Cómo funciona

- Cada persona entra con **Google** o con **mail y contraseña**. Cada una ve
  solo sus datos: lo garantizan las políticas RLS de Postgres, no la app.
- La app sigue guardando todo en SQLite y **funciona sin conexión**. Unos
  triggers anotan cada alta, cambio o baja en `sync_cola`, y
  `src/sync/motor.ts` sube y baja cambios: al abrir la app, poco después de
  cada cambio, al volver la app al frente y una vez por minuto.
- **Conflictos:** gana el cambio más reciente, registro por registro, y lo
  hace cumplir también el servidor (`fluxo_ultimo_gana`).
- **Movimientos recurrentes:** su id sale de la regla y del vencimiento, así
  que si dos dispositivos generan la misma cuota, se juntan en una sola. Una
  cuota recién generada nunca le gana a una que ya se pagó en otro lado.
- **Primer ingreso** con datos ya cargados (incluidos los de ejemplo): la app
  pregunta si se suman a la cuenta o se descartan.
- **Cerrar sesión** borra los datos del dispositivo, que siguen en la cuenta.
  Si quedan cambios sin subir, la app avisa antes.
- Sin las variables de entorno, la app funciona como antes: solo en el
  dispositivo y sin cuentas.

## Puesta en marcha (una sola vez)

### 1. Proyecto de Supabase

Creá un proyecto en https://supabase.com/dashboard. Para Argentina conviene
la región **South America (São Paulo)**.

### 2. Tablas, seguridad y vistas

En **SQL Editor**, pegá y corré
`supabase/migrations/20261005000000_fluxo_sync.sql`. Se puede correr de nuevo
sin romper nada.

Después corré `supabase/migrations/20261008000000_fluxo_pagos.sql` (pagos y
cobros parciales). Si la app nueva llega antes que este SQL, sincroniza todo lo
demás y deja los pagos en su cola local hasta que la tabla exista.

El SQL está probado contra Postgres (PGlite), con `auth.users`, `auth.uid()`
y los roles simulados. Se comprobó lo siguiente:

- el perfil se crea solo;
- un cambio viejo no pisa uno nuevo;
- las bajas son marcas;
- un usuario no ve ni escribe lo de otro;
- sin sesión no se accede a nada;
- el esquema `admin` queda cerrado;
- las cinco vistas dan bien.

### 3. Ingreso con Google

1. En https://console.cloud.google.com, entrá a **APIs y servicios →
   Credenciales → Crear credenciales → ID de cliente de OAuth**, tipo
   **Aplicación web**.
2. En **URI de redireccionamiento autorizados** poné
   `https://TU-PROYECTO.supabase.co/auth/v1/callback`.
3. Copiá el **ID de cliente** y el **secreto**.
4. En Supabase, entrá a **Authentication → Sign In / Providers → Google**,
   activalo y pegá los dos valores.

La pantalla de consentimiento de Google pide nombre de la app, mail de soporte
y, para salir del modo prueba, una política de privacidad publicada.

### 4. Mail y contraseña

En **Authentication → Sign In / Providers → Email**:

- Dejá activado **Confirm email**. El que se registra recibe un link para
  confirmar.
- El servidor de mail de Supabase sirve para probar, pero tiene un límite muy
  bajo de mails por hora. Para usuarios reales, configurá un SMTP propio en
  **Authentication → Emails → SMTP Settings** (Resend, Brevo, etc.).

### 5. URLs de retorno

En **Authentication → URL Configuration**:

- **Site URL:** la URL del sitio en Render (por ejemplo
  `https://fluxo-app.onrender.com`).
- **Redirect URLs:** agregá estas cuatro:
  - `fluxo://**` (la app instalada: APK)
  - `exp://**` (Expo Go durante el desarrollo)
  - `http://localhost:8081` (web en desarrollo)
  - la URL de Render

### 6. Claves en la app

Están en **Project Settings → API Keys**: la **URL** y la clave **anon /
publishable**. Esa clave es pública por diseño y va dentro de la app; los
datos los protege RLS. **Nunca uses la `service_role`** en la app.

- **Desarrollo:** copiá `.env.example` a `.env.local` y completalo. Después
  reiniciá `npx expo start`.
- **Web (Render):** en el servicio, entrá a **Environment** y cargá
  `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Después hacé
  un deploy manual: Expo mete los valores en el bundle al buildear.
- **APK (EAS):** cargá las dos variables en el entorno del perfil:

  ```
  eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value https://TU-PROYECTO.supabase.co --visibility plaintext
  ```
  ```
  eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value TU-CLAVE --visibility plaintext
  ```

  Repetí con `--environment production` cuando haya build de producción.

### 7. APK nuevo

La app ahora tiene un esquema de URL propio (`fluxo://`) y módulos nativos
nuevos (`expo-web-browser`, `expo-device`). Por eso una actualización por OTA
no alcanza: hace falta un build nuevo con `build-apk.bat`.

## Ver a los usuarios (administrador)

Las vistas están en el esquema `admin`, que no está expuesto en la API: ningún
usuario de la app puede leerlo. Se consultan desde el **SQL Editor** o desde
el **Table Editor**, eligiendo el esquema `admin`.

| Vista | Qué muestra |
|---|---|
| `admin.usuarios` | Mail, nombre, proveedor, alta, último uso, país, idioma, zona horaria, plataforma, versión, consentimiento, dispositivos, movimientos, recurrentes activos, días activos y aperturas en 30 días |
| `admin.finanzas_mensuales` | Por usuario, mes y moneda: ingresos (y cobrados), gastos (pagados, pendientes, vencidos, fijos), resultado y tasa de ahorro |
| `admin.gastos_por_categoria` | Por mes: total y % de cada categoría |
| `admin.comportamiento` | Promedio de los últimos 3 meses cerrados: ingreso, gasto, tasa de ahorro, % de gasto fijo, meses en rojo, deuda pendiente y vencida, categoría principal y un perfil (`ahorrador` / `equilibrado` / `en rojo` / `sin ingresos`) |
| `admin.actividad_diaria` | Usuarios activos, aperturas y movimientos cargados por día |

Tablas crudas:

- `public.perfiles` y `public.dispositivos`: marca, modelo, sistema y versión.
- `public.eventos`: cada acción, con sus datos en `props`.

```sql
select * from admin.usuarios order by ultimo_uso desc;
select * from admin.comportamiento order by tasa_ahorro_pct;
```

### Qué se registra y qué no

**Sí se registra:**

- identidad de la cuenta (mail, nombre y foto de Google);
- región configurada en el equipo (no la ubicación);
- datos del dispositivo (marca, modelo, sistema);
- uso de la app (aperturas, altas, pagos, ediciones, con categoría y monto);
- los datos financieros que el usuario carga, que se sincronizan de todos
  modos.

**No se registra:** ubicación GPS, contactos, identificadores publicitarios ni
nada fuera de la app.

## Privacidad (Argentina, Ley 25.326)

Para que otras personas usen la app:

- El usuario acepta al entrar (casilla en la pantalla de ingreso). Queda
  registrado en `perfiles.acepto_terminos_en` y `version_terminos`. Si cambiás
  el texto, subí `VERSION_TERMINOS` en `src/sync/remotoSupabase.ts`.
- Publicá una **política de privacidad** que diga qué datos se guardan, para
  qué, dónde (Supabase) y cómo pedir la baja. Google la exige para el login en
  producción.
- **Borrar una cuenta:** en Supabase, **Authentication → Users → Delete
  user**. El `on delete cascade` borra su perfil, sus dispositivos, sus
  eventos y todos sus datos.
- Si la app se ofrece al público, la base debe inscribirse en el Registro
  Nacional de Bases de Datos (AAIP).
