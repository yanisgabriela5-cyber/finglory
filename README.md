# FinGlory

FinGlory es una web app para saber en qué se va tu dinero: registra gastos e ingresos, analiza el estado de cuenta del banco (Excel o CSV) sin IA, te pregunta lo que no entiende, da tips con alternativas y te ayuda con metas, gastos fijos, reparto del salario, lista de deseos y presupuesto.

- Cada persona crea su cuenta con correo y contraseña. Sus datos se guardan en Supabase y solo los ve ella.
- El archivo del banco se lee en el propio dispositivo; no se sube completo, solo los movimientos que la persona decide importar.
- También se puede **probar sin cuenta**: los datos quedan solo en ese navegador.

## Archivos

| Archivo | Para qué es |
|---|---|
| `index.html` | La página de la app |
| `app.js` | Toda la lógica |
| `config.js` | **Lo único que debes editar**: nombre de la app y datos de Supabase |
| `schema.sql` | Tablas y reglas de seguridad para Supabase |
| `manifest.webmanifest` e íconos | Para instalarla en el celular como app |

## Paso 1. Preparar Supabase (unos 10 minutos)

1. Entra a [supabase.com](https://supabase.com) y crea un proyecto nuevo (por ejemplo `finanzas`). Te recomiendo uno nuevo, separado de tus otros proyectos.
2. Ve a **SQL Editor → New query**, pega todo el contenido de `schema.sql` y toca **Run**.
3. Ve a **Project Settings → API** y copia:
   - **Project URL** (algo como `https://abcd1234.supabase.co`)
   - **anon public key** (en proyectos nuevos puede llamarse *publishable key*)
4. Guarda esos dos valores: los vas a pegar en `config.js` en el Paso 2. Esa clave es pública a propósito: lo que protege los datos son las reglas de `schema.sql`.

## Paso 2. Publicar en GitHub Pages

1. En GitHub, crea un repositorio nuevo, por ejemplo `finanzas`. En el plan gratis, GitHub Pages necesita que el repositorio sea **público** (el código queda visible, los datos de las personas no, porque viven en Supabase).
2. Sube todos los archivos de esta carpeta (**Add file → Upload files**).
3. Ve a **Settings → Pages**, en *Source* elige **Deploy from a branch**, rama `main`, carpeta `/ (root)` y guarda.
4. En uno o dos minutos tu app estará en `https://yanisgabriela5-cyber.github.io/finglory/`.

## Paso 3. Conectar el link con Supabase

En Supabase ve a **Authentication → URL Configuration**:

- **Site URL**: `https://yanisgabriela5-cyber.github.io/finglory/`
- **Redirect URLs**: agrega la misma dirección.

Así funcionan los correos de confirmación de cuenta y de "olvidé mi contraseña".

> El servicio de correo que trae Supabase por defecto solo envía pocos correos por hora. Para unas cuantas personas de prueba alcanza; si luego la vendes, configura tu propio servidor de correo en **Authentication → Emails → SMTP Settings**.

## Paso 4. Invitar a tus testers

Comparte el link. Cada persona toca **Crear cuenta**, confirma su correo y listo. En el celular pueden instalarla:

- **iPhone (Safari)**: Compartir → *Agregar a pantalla de inicio*.
- **Android (Chrome)**: menú ⋮ → *Agregar a la pantalla principal* o *Instalar app*.

Lo que escriban en **Mi cuenta → Enviar comentarios** te llega a Supabase en **Table Editor → feedback**.

**Sé transparente con tus testers:** como dueña del proyecto de Supabase, tú puedes ver los datos que guardan desde el panel. Díselo antes de que suban sus movimientos.

## Cambiar el nombre de la app

Cambia `appName` en `config.js` y `name` / `short_name` en `manifest.webmanifest`.

## Colores de la marca

Morado `#3E2F59`, rosa `#DBB0CF`, lima `#C6ED58` y blanco `#FCFBFB`. Están como variables al inicio del `<style>` de `index.html`.

## Probar en tu computadora

Abre una terminal en esta carpeta y ejecuta `python3 -m http.server 8000`, luego entra a `http://localhost:8000`. Si quieres probar el inicio de sesión, agrega también `http://localhost:8000` en las *Redirect URLs* de Supabase.
