# Espejo Odoo → Mercado Libre (MLA) — Embalog Packaging

Integración n8n que refleja un subconjunto curado de productos de Odoo 19 en
Mercado Libre Argentina. Tres workflows + un sub-workflow de autenticación.

- **WF0** — `wf0_ml_auth.json` — devuelve un `access_token` de ML vigente (refresca si vence). Lo llaman los otros tres.
- **WF1** — `wf1_publicar_productos.json` — publica en ML los productos marcados en Odoo. **← implementado**
- **WF2** — sync de stock y precio (pendiente — ver nota de plan n8n al final).
- **WF3** — `wf3_pedidos_ml.json` — pedidos ML → sale.order en Odoo. **← activo en producción (2026-07-16)**
  Webhook: `https://marianofran.app.n8n.cloud/webhook/ml-orders` registrado en DevCenter con tópico `orders_v2`.
  La orden queda en **borrador** con nota `*** PAGADA: CONFIRMAR ***` — se confirma a mano en Odoo.

> **Datos verificados contra la doc de ML (jul 2026):** `POST /items` exige `title, category_id,
> price, currency_id(ARS), available_quantity, buying_mode, listing_type_id, condition, pictures` y los
> `attributes` `required` de la categoría. Access token = 6 h; refresh token = 6 meses y **de un solo uso**
> (cada refresh devuelve uno nuevo → por eso se persisten en Supabase, no en una credencial n8n).

---

## Decisiones de arquitectura

| Tema | Decisión | Por qué |
|------|----------|---------|
| Tokens ML (rotan c/6h) | **Supabase** tabla `ml_config` | El refresh es read-modify-write y el `refresh_token` es single-use: necesita persistencia atómica. Las credenciales n8n no se reescriben bien en cada corrida. |
| Imágenes | **URL pública de Odoo** `/web/image/product.template/{id}/image_1920` | Sin nodos extra. Requiere que la imagen sea accesible sin login (ver §5). Alternativa: subir binario a `POST /pictures`. |
| Acceso Odoo | **Nodo Odoo nativo** (credencial `odooApi`) | Única forma de mantener la API key **solo** en una credencial n8n encriptada. Habla JSON-RPC por debajo. |
| Secretos | Odoo API key + Supabase service_role → **credenciales n8n**. `client_id/secret` de ML → fila `ml_config` de Supabase (protegida por el service key que sí está en n8n). | Nada hardcodeado en nodos. |

---

## Secuencia de puesta en marcha

### 1. Campos custom en Odoo (Studio)

En **Odoo 19 Online**, con Studio activo, sobre el modelo **Producto (`product.template`)**
crear estos campos. *Ventas → Productos →* abrir un producto → botón **Studio** (arriba a la derecha)
→ arrastrar campos al formulario:

| Etiqueta | Nombre técnico (real) | Tipo | Uso | Obligatorio |
|----------|-----------------------|------|-----|-------------|
| Publicar ML | `x_studio_publicar_ml` | Casilla (booleano) | Marca el producto para publicar en ML | Sí |
| ML Item ID | `x_studio_ml_item_id` | Texto (Char) | Lo escribe WF1 con el `MLAxxxxxxxx` devuelto | Sí (lo llena el flujo) |
| ML Category ID | `x_studio_ml_category_id` | Texto (Char) | Override manual de categoría (opcional; si está vacío se usa `domain_discovery`) | Opcional |
| ML Attributes | `x_studio_ml_attributes` | Texto multilínea (Text) | Atributos requeridos de la categoría, en JSON | Opcional pero casi siempre necesario |

> **Nota:** al crearlos con Studio, Odoo antepone `x_studio_` automáticamente y saca el nombre técnico de
> la etiqueta (ej. etiqueta "Publicar ML" → `x_studio_publicar_ml`). Los workflows ya apuntan a estos
> nombres reales. Se crearon el 2026-07-11 sobre el producto de prueba (id 900).

**Sobre `x_studio_ml_attributes`:** ML rechaza el item si faltan atributos `required` de la categoría
(marca, modelo, etc.). No se pueden adivinar de forma confiable, así que se cargan a mano por producto.
Formato:

```json
[{"id":"BRAND","value_name":"Embalog"},{"id":"PACKAGING_TYPE","value_name":"Caja"}]
```

Para saber qué atributos son obligatorios de una categoría:
`GET https://api.mercadolibre.com/categories/{category_id}/attributes` → mirá los que tienen
`"tags":{"required":true}`.

### 2. Usuario/API key de Odoo para n8n

En Odoo: *Ajustes → Usuarios* → tu usuario API (`embalogpackaging@mail.com`) → pestaña
**Seguridad de la cuenta → Nueva clave API**. Guardá la clave (se muestra una sola vez).
Va a la credencial n8n del paso 6, **nunca en un nodo**.

### 3. App en el DevCenter de Mercado Libre (lo hacés vos en el navegador)

1. Entrá a **https://developers.mercadolibre.com.ar/** → *Mis aplicaciones* → **Crear aplicación nueva**.
2. Completá:
   - **Nombre** y **descripción** cortos.
   - **URI de redirect (redirect_uri):** por ahora poné la URL del webhook de prueba de n8n o
     `https://n8n.tudominio/rest/oauth2-credential/callback`. Para el primer flujo manual sirve incluso
     `https://localhost` (solo tenés que poder leer el `code` de la barra de direcciones). **Anotá exactamente
     la que pongas: tiene que coincidir carácter por carácter en el intercambio.**
   - **Scopes:** `read`, `write`, `offline_access` (este último es el que habilita el `refresh_token`).
   - **Tópicos de notificaciones:** marcá **`orders_v2`** (para WF3). Callback: la URL del webhook de WF3
     (la definimos cuando armemos WF3).
3. Guardá y anotá **`App ID` (= client_id)** y **`Client Secret`**.

### 4. Primer authorization code flow (una sola vez, en el navegador)

1. Armá esta URL (reemplazá `APP_ID` y `REDIRECT_URI`) y abrila en tu navegador **logueado con tu cuenta vendedor**:

   ```
   https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=APP_ID&redirect_uri=REDIRECT_URI&scope=offline_access%20read%20write
   ```

2. Aceptá los permisos. ML te redirige a `REDIRECT_URI?code=TG-xxxxxxxx...`. **Copiá el valor `code`**
   (empieza con `TG-`). Dura pocos minutos: hacé el paso 3 enseguida.

3. Canjeá el code por tokens (una sola vez). Podés hacerlo con este `curl` desde tu máquina —
   **no** pega credenciales en n8n todavía:

   ```bash
   curl -X POST https://api.mercadolibre.com/oauth/token \
     -H 'accept: application/json' \
     -H 'content-type: application/x-www-form-urlencoded' \
     -d 'grant_type=authorization_code' \
     -d 'client_id=APP_ID' \
     -d 'client_secret=CLIENT_SECRET' \
     -d 'code=TG-xxxxxxxx' \
     -d 'redirect_uri=REDIRECT_URI'
   ```

   Respuesta: `{ "access_token":"APP_USR-...", "refresh_token":"TG-...", "expires_in":21600, "user_id": 123456789, ... }`.
   Guardá los cuatro valores para el paso 5.

### 5. Supabase (crear cuenta/proyecto y las tablas)

En el proyecto Supabase, **SQL Editor**, ejecutá:

```sql
-- Config + tokens de ML (una sola fila, id=1)
create table if not exists ml_config (
  id            int primary key default 1,
  client_id     text not null,
  client_secret text not null,
  redirect_uri  text not null,
  ml_user_id    bigint,
  access_token  text,
  refresh_token text,
  expires_at    bigint          -- epoch en milisegundos
);

-- Log legible de publicaciones/errores de WF1
create table if not exists ml_publish_log (
  id         bigserial primary key,
  created_at timestamptz default now(),
  odoo_id    bigint,
  title      text,
  status     text,             -- 'ok' | 'error'
  error      text
);
```

Insertá la fila de config con lo del paso 4:

```sql
insert into ml_config (id, client_id, client_secret, redirect_uri, ml_user_id, access_token, refresh_token, expires_at)
values (1, 'APP_ID', 'CLIENT_SECRET', 'REDIRECT_URI', 123456789,
        'APP_USR-...', 'TG-...', (extract(epoch from now())*1000)::bigint + 21600000)
on conflict (id) do update set
  client_id=excluded.client_id, client_secret=excluded.client_secret,
  redirect_uri=excluded.redirect_uri, ml_user_id=excluded.ml_user_id,
  access_token=excluded.access_token, refresh_token=excluded.refresh_token,
  expires_at=excluded.expires_at;
```

> **RLS:** dejá RLS activado y accedé desde n8n con la **service_role key** (bypassa RLS). Esa key va
> en la credencial Supabase de n8n, no en el código.

### 6. Credenciales en n8n

Creá una cuenta n8n nueva y cargá **dos** credenciales:

- **Odoo API** (`odooApi`): URL `https://embalog-packaging.odoo.com`, DB `embalog-packaging`,
  usuario `embalogpackaging@mail.com`, password = **API key del paso 2**.
- **Supabase API** (`supabaseApi`): host del proyecto + **service_role key**.

### 7. Importar los workflows

1. *Workflows → Import from File* → `wf0_ml_auth.json`. Abrí los dos nodos Supabase y asigná la
   credencial **Embalog Supabase**. Guardá y **copiá el ID del workflow** (está en la URL).
2. Import `wf1_publicar_productos.json`. Ajustá:
   - Nodo **Obtener token ML** → campo *Workflow* → elegí **WF0** (o pegá el ID del paso anterior).
   - Nodos **Odoo** (`Leer productos`, `Guardar x_studio_ml_item_id`) → credencial **Embalog Odoo**; verificá
     en la UI el filtro `x_studio_publicar_ml = true` y los campos a traer.
   - Nodos **Supabase** → credencial **Embalog Supabase**.

---

## Probar WF1 con 1 solo producto (antes del batch)

1. En Odoo, elegí **un** producto de prueba: marcá `x_studio_publicar_ml = true`, dejá `x_studio_ml_item_id` **vacío**,
   asegurate de que tenga **stock > 0**, **precio > 0** y una **imagen**.
2. Cargá `x_studio_ml_attributes` con los atributos `required` de su categoría (ver §1). Si sabés la categoría,
   ponela en `x_studio_ml_category_id`; si no, el flujo la predice con `domain_discovery`.
3. **Imagen pública:** verificá que `https://embalog-packaging.odoo.com/web/image/product.template/<ID>/image_1920`
   abra en una ventana de incógnito (sin login). Si da 403, publicá el producto en el sitio web de Odoo
   (*Ventas → producto → Publicar en sitio web*) o pasá a la estrategia de subir binario a `POST /pictures`.
4. Corré **WF0** solo una vez (*Execute Workflow*) y confirmá que devuelve un `access_token` — así validás
   el refresh y la conexión a Supabase de forma aislada.
5. Corré **WF1** con *Test workflow*. Revisá:
   - En ML: *Mis publicaciones* → debería aparecer el ítem (estado activo).
   - En Odoo: el producto ahora tiene `x_studio_ml_item_id = MLAxxxxxxxx`.
   - Si ML lo rechazó: mirá la tabla `ml_publish_log` en Supabase → columna `error` con el motivo legible
     (categoría/atributos), y el flujo **no** se abortó.
6. Recién cuando el ítem de prueba salga OK, marcá los otros 10-15 productos y corré el batch.

### Errores típicos de `POST /items`
- `Invalid category` / falta un atributo → completá `x_studio_ml_attributes` con el `id` correcto (mayúsculas).
- `available_quantity must be greater than 0` → el producto no tiene stock en Odoo.
- Imagen no accesible → la URL `/web/image/...` no es pública (paso 3).

---

## Pendiente (próximas iteraciones)
- **WF2** (sync stock/precio): por cada producto con `x_studio_ml_item_id`, `GET /items/{id}` → comparar →
  `PUT /items/{id}` si difiere; `available_quantity<=0` → `PUT status:paused`, vuelve stock → `status:active`.
  ⚠️ **Plan free de n8n = 50 ejecuciones/mes**: un cron cada 30 min (~1.400/mes) NO entra. Antes de armarlo,
  decidir: subir plan, bajar frecuencia (p.ej. 1-2/día), o self-hostear n8n.
- **Publicar el resto del catálogo** con WF1: por producto → `Publicar ML` ✔, `ML Item ID` vacío,
  `ML Attributes` (BRAND, MODEL, VALUE_ADDED_TAX 21%, IMPORT_DUTY 0% para cintas), foto fondo blanco ≥1200px.

## Trampas aprendidas (resueltas en los JSON)
- Odoo devuelve un Char vacío como `false` (no `""`): el filtro "sin publicar" usa `{{ !$json.x_studio_ml_item_id }}`.
- Categorías de catálogo de MLA rechazan `title`: se manda `family_name` y ML arma el título solo.
- `list_price` de Odoo es neto: a ML se publica `× 1.21`; los pedidos de ML vuelven con IVA → la línea en Odoo se carga `÷ 1.21`.
- El curl de Windows del usuario necesita `--ssl-no-revoke` (error schannel CRYPT_E_NO_REVOCATION_CHECK).
- n8n cloud: para activar un workflow que llama a otro, el sub-workflow (WF0) debe estar publicado antes.
