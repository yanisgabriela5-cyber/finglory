# FinGlory

FinGlory es una web app para saber en qué se va tu dinero: registra gastos e ingresos, analiza el estado de cuenta del banco (Excel o CSV) sin IA, te pregunta lo que no entiende, da tips con alternativas y te ayuda con metas, gastos fijos, reparto del salario, lista de deseos y presupuesto.

- Cada persona crea su cuenta con correo y contraseña. Sus datos se guardan en Firebase y solo los ve ella.
- El archivo del banco se lee en el propio dispositivo; solo se guardan los movimientos que la persona decide importar.
- También se puede **probar sin cuenta**: los datos quedan solo en ese navegador.

## Funciones

- **Inicio:** disponible del periodo, en qué se fue el dinero contra el presupuesto y registro rápido con alerta cuando te pasas.
- **Por mes o por quincena:** un solo selector manda en toda la app (Inicio, Movimientos, Plan, Metas y Hábitos). En quincena el presupuesto es la mitad del mensual, las alertas cuentan la quincena, Plan muestra los fijos de esa quincena y Metas te dice cuánto apartar por quincena.
- **Movimientos:** búsqueda, filtro y edición (toca un movimiento para cambiar monto, tipo, categoría, descripción o fecha).
- **Analizar:** lee el Excel o CSV del banco, pregunta lo que no entiende, recuerda tus respuestas y sugiere presupuesto.
- **Plan:** gastos e ingresos fijos (como la quincena) y reparto del salario por porcentajes.
- **Metas:** metas con propósito y lista de deseos con plazo libre (días, semanas o meses), cuánto apartar según tu ritmo y botón para apartar dinero para cada deseo.
- **Hábitos:** tips que salen de analizar tus movimientos (manuales e importados): balance, proyección del periodo, categorías que suben frente al periodo anterior, lugares que repites, fines de semana, suscripciones, comisiones y metas atrasadas. Además gastos hormiga e historial de 6 meses.
- **Mi cuenta:** modo claro, oscuro o automático, recordatorio mensual para el calendario, respaldo y comentarios.
- Aviso en Inicio al final de cada mes para subir el estado de cuenta.

App publicada: `https://yanisgabriela5-cyber.github.io/finglory/`

## Archivos

| Archivo | Para qué es |
|---|---|
| `index.html` | La página de la app |
| `app.js` | Toda la lógica |
| `config.js` | **Lo único que debes editar**: nombre de la app y datos de Firebase |
| `firestore.rules` | Reglas de seguridad para Firebase (cada quien ve solo lo suyo) |
| `schema.sql` | Solo si algún día prefieres Supabase en vez de Firebase |
| `manifest.webmanifest` e íconos | Para instalarla en el celular como app |

## Conectar Firebase (unos 10 minutos)

1. Entra a [console.firebase.google.com](https://console.firebase.google.com) y toca **Agregar proyecto**. Llámalo `finglory`. Google Analytics no hace falta.
2. **Authentication → Comenzar → Método de acceso → Correo electrónico/contraseña → Habilitar → Guardar.**
3. **Authentication → Configuración → Dominios autorizados → Agregar dominio:** `yanisgabriela5-cyber.github.io`
4. **Firestore Database → Crear base de datos.** Elige una ubicación (por ejemplo `nam5 (United States)`) y **modo de producción**. Cuando esté lista, ve a la pestaña **Reglas**, borra lo que haya, pega todo el contenido de `firestore.rules` y toca **Publicar**.
5. **⚙ Configuración del proyecto → General → Tus apps → ícono web `</>`.** Registra la app con el nombre `FinGlory` (no marques Hosting). Firebase te muestra un bloque `firebaseConfig`.
6. En este repositorio abre `config.js`, toca el lápiz y copia de ese bloque `apiKey`, `authDomain`, `projectId` y `appId`. Guarda con **Commit changes**. En uno o dos minutos la app se actualiza sola.

Esos valores son públicos a propósito: lo que protege los datos son las reglas de `firestore.rules`.

## Invitar a tus testers

Comparte el link. Cada persona toca **Crear cuenta** y entra de una vez (le llega un correo de verificación, pero no es obligatorio abrirlo). En el celular pueden instalarla:

- **iPhone (Safari)**: Compartir → *Agregar a pantalla de inicio*.
- **Android (Chrome)**: menú ⋮ → *Agregar a la pantalla principal* o *Instalar app*.

Lo que escriban en **Mi cuenta → Enviar comentarios** te llega a Firebase en **Firestore Database → fg_feedback**. Las cuentas creadas las ves en **Authentication → Usuarios**.

**Sé transparente con tus testers:** como dueña del proyecto de Firebase, tú puedes ver los datos que guardan desde la consola. Díselo antes de que suban sus movimientos.

## Límites del plan gratis

El plan gratis (Spark) de Firebase no pide tarjeta. Incluye la autenticación con correo y una cuota diaria de lecturas y escrituras de Firestore que alcanza de sobra para un grupo de prueba. Importar un estado de cuenta cuenta una escritura por movimiento, y abrir la app cuenta una lectura por cada registro guardado. Si un día se llena la cuota, la app avisa y se renueva al día siguiente.

## Cambiar el nombre de la app

Cambia `appName` en `config.js` y `name` / `short_name` en `manifest.webmanifest`.

## Colores de la marca

Morado `#3E2F59`, rosa `#DBB0CF`, lima `#C6ED58` y blanco `#FCFBFB`. Están como variables al inicio del `<style>` de `index.html`.

## Usar Supabase en vez de Firebase

En `config.js` cambia `backend` a `'supabase'`, pega tu Project URL y anon key, corre `schema.sql` en el SQL Editor de Supabase y pon el link de la app en **Authentication → URL Configuration** (Site URL y Redirect URLs).
