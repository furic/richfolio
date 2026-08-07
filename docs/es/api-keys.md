---
title: Claves de API
layout: default
nav_order: 5
lang: es
permalink: /api-keys.html
---

# Claves de API

Richfolio usa hasta 5 servicios externos, todos con planes gratuitos generosos. Solo Resend y un correo destinatario son requeridos — todo lo demás es opcional.

Agrega cada clave como Secret del repositorio: Settings → Secrets and variables → Actions → pestaña **Secrets**. Agrega `RECIPIENT_EMAIL` como **Variable** (más fácil de ver/editar).

![GitHub Actions Secrets](../screenshots/github_actions_secrets.png){: style="max-width: 500px; display: block; margin: 16px auto;" }

---

## Resend (correo) — Requerido
{: .text-green-200}

Resend entrega los reportes de correo HTML.

1. Ve a [resend.com](https://resend.com) y regístrate
2. Navega a **API Keys** en el dashboard
3. Haz clic en **Create API Key**, ponle un nombre y copia la clave
4. Agrégala como GitHub Secret — nombre: `RESEND_API_KEY`, valor: la clave que acabas de copiar

**Plan gratuito:** 3,000 correos/mes. Envía desde `onboarding@resend.dev` por defecto. Solo puede enviar a tu **correo de propietario de cuenta** a menos que verifiques un dominio personalizado (Dashboard → Domains → Add Domain → agregar registros DNS).

---

## Correo destinatario — Requerido
{: .text-green-200}

Agrégalo como **Variable** de GitHub (no Secret): nombre: `RECIPIENT_EMAIL`, valor: tu dirección de correo.

Debe coincidir con el correo de tu cuenta Resend a menos que hayas verificado un dominio personalizado.

---

## NewsAPI (headlines) — Opcional
{: .text-yellow-200}

Provee los top headlines por ticker para el resumen diario.

1. Ve a [newsapi.org](https://newsapi.org) y regístrate
2. Tu clave API se muestra en el dashboard inmediatamente
3. Agrégala como GitHub Secret — nombre: `NEWS_API_KEY`, valor: la clave del dashboard

**Plan gratuito:** 100 requests/día. Richfolio usa ~4 requests por corrida vía batching. Headlines solo de las últimas 24 horas. Si no está configurada, el resumen corre sin noticias.

---

## Proveedores de IA — al menos uno requerido para recomendaciones con IA

Richfolio soporta tres proveedores de IA: **Google Gemini**, **Anthropic Claude** y **Mistral**. Configura al menos uno para obtener recomendaciones con IA. Configura **dos o más** para correrlos en paralelo — los scores se promedian y se muestra un desglose por IA junto a cada recomendación. Si ninguno está configurado, Richfolio cae a recomendaciones basadas en brechas (sin IA).

| Modo | Configuración | Salida |
|---|---|---|
| **Sin IA** | Ninguna clave configurada | Solo recomendaciones basadas en brechas |
| **IA única** | Una clave configurada | Idéntico a hoy — un solo conjunto de acción + confianza por ticker |
| **Multi-IA** | Dos o más claves configuradas | Acción de consenso por ticker + confianza promediada; desglose por IA debajo de cada recomendación; STRONG BUY requiere acuerdo unánime |

---

## Google Gemini — Opcional
{: .text-yellow-200}

Impulsa las recomendaciones de compra con IA con Gemini 2.5 Flash.

1. Ve a [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Haz clic en **Create API Key**, selecciona un proyecto de Google Cloud (o crea uno)
3. Copia la clave y agrégala como GitHub Secret — nombre: `GEMINI_API_KEY`, valor: la clave que acabas de copiar

**Plan gratuito:** 250 requests/día, 10 requests/minuto. Richfolio usa 2 requests por corrida (Stage 1 Observe + Stage 2 Decide) más 1 por ticker STRONG BUY para análisis detallado. Las claves nuevas pueden tardar unos minutos en activar su cuota (podrías ver errores 429 inicialmente).

### Una nota sobre los niveles de modelo de Gemini

La página de precios de Google indica que Gemini 2.5 Pro es ["Free of charge"](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-pro) tanto para tokens de entrada como de salida. En la práctica, sin embargo, los requests Pro del plan gratuito frecuentemente chocan con errores `429 RESOURCE_EXHAUSTED` — incluso con uso mínimo. Google no publica los límites reales de RPD (requests por día) para el plan gratuito; fuentes de terceros sugieren que Pro puede estar limitado a ~100 RPD, pero el número real parece variar por cuenta y no está garantizado.

**Richfolio usa Gemini 2.5 Flash por defecto** porque Flash tiene una cuota de plan gratuito más generosa y confiable. La diferencia de calidad para texto de análisis financiero es despreciable.

---

## Anthropic Claude — Opcional
{: .text-yellow-200}

Impulsa las recomendaciones de compra con IA usando Claude (Sonnet 4.6 por defecto).

1. Ve a [console.anthropic.com](https://console.anthropic.com) y regístrate
2. Navega a **API Keys** → **Create Key**, ponle un nombre y copia la clave
3. Agrégala como GitHub Secret — nombre: `ANTHROPIC_API_KEY`, valor: la clave que acabas de copiar

**Precios:** Anthropic no tiene un plan gratuito permanente como Gemini, pero las cuentas nuevas reciben un pequeño crédito inicial y el uso de Sonnet para la carga de Richfolio suele costar centavos por día. Para minimizar el costo, configura `CLAUDE_MODEL=claude-haiku-4-5-20251001` (el nivel Haiku es significativamente más barato y maneja esta carga muy bien).

---

## Mistral — Opcional
{: .text-yellow-200}

Genera las recomendaciones de compra con IA usando Mistral Large (`mistral-large-latest` por defecto).

1. Ve a [console.mistral.ai](https://console.mistral.ai) y regístrate
2. Navega a **API Keys** → **Create new key** y copia la clave
3. Agrégala como GitHub Secret — nombre: `MISTRAL_API_KEY`, valor: la clave que acabas de copiar

**Plan gratuito:** el nivel Experiment es gratuito y permanente — alrededor de 1.000 millones de tokens al mes, frente a los ~7 millones que consume Richfolio. Está limitado por tasa de peticiones, no por créditos, así que si lo fuerzas verás errores 429 (no fallos de facturación) y esos se reintentan automáticamente. Configura `MISTRAL_MODEL=mistral-medium-latest` para tener más margen y corridas más rápidas a cambio de algo de calidad.

Mistral funciona bien como segundo proveedor precisamente porque es un linaje de modelos independiente de Gemini: bajo la regla de unanimidad, un segundo modelo solo aporta información cuando su desacuerdo refleja los datos y no la debilidad del modelo.

---

## Modo multi-IA

Si dos o más de `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` y `MISTRAL_API_KEY` están configurados, Richfolio corre esos proveedores concurrentemente en cada análisis y agrega los resultados:

- **Acción de consenso** por ticker mediante voto mayoritario (con desempate por suma de confianza)
- **Confianza promediada** mostrada de forma prominente; scores por IA mostrados debajo
- **STRONG BUY requiere acuerdo unánime** — si algún proveedor disiente, el consenso se limita a BUY
- **Etiqueta de acuerdo** (unánime / mayoría / dividido) mostrada como badge junto a la acción

Si un proveedor falla a mitad de corrida (rate limit, cuota agotada, error de red), los demás continúan sin él. Esa corrida queda marcada como **degradada**: cada recomendación lleva un badge del tipo `⚠ 1/2 AI` en el correo (una etiqueta en Telegram) y STRONG BUY se limita a BUY, porque la unanimidad entre los modelos que sí respondieron no es la verificación cruzada que el badge daría a entender. Configura `"ai": { "strongBuyRequiresAllProviders": false }` en `config.json` para conservar la acción del proveedor sobreviviente — el badge se muestra igual en ambos casos. Esto no aplica cuando solo hay un proveedor configurado: esa configuración nunca prometió unanimidad.

### Elegir qué proveedor genera la página de análisis detallado de STRONG BUY

Cuando hay varios proveedores activos, la página de análisis por STRONG BUY (el enlace "More Details") es generada por un solo proveedor — por defecto el primero disponible en orden de registro (Gemini, luego Claude, luego Mistral). Sobrescribe con:

| Variable de entorno | Valor | Efecto |
|---|---|---|
| `AI_DETAILED_PROVIDER` | `gemini` | Forzar Gemini para análisis detallado (debe tener GEMINI_API_KEY configurada) |
| `AI_DETAILED_PROVIDER` | `claude` | Forzar Claude para análisis detallado (debe tener ANTHROPIC_API_KEY configurada) |
| `AI_DETAILED_PROVIDER` | `mistral` | Forzar Mistral para análisis detallado (debe tener MISTRAL_API_KEY configurada) |
| `MISTRAL_MODEL` | `mistral-medium-latest` | Modelo de Mistral más barato/rápido (por defecto: `mistral-large-latest`) |
| `CLAUDE_MODEL` | p. ej. `claude-haiku-4-5-20251001` | Sobrescribir el modelo de Claude (por defecto: `claude-sonnet-4-6`) |

Un `AI_DETAILED_PROVIDER` que nombre un proveedor sin clave configurada (o un nombre desconocido) se registra en el log y se ignora, volviendo al orden de registro — fijar un proveedor sin API key haría fallar todos los tickers.

---

## Bot de Telegram — Opcional
{: .text-yellow-200}

Entrega resúmenes condensados a tu cuenta de Telegram.

### Crear el bot

1. Abre Telegram y busca **@BotFather**
2. Envía `/newbot`
3. Elige un nombre (p. ej., "Richfolio Brief") y un username (debe terminar en `bot`, p. ej., `richfolio_brief_bot`)
4. BotFather responde con tu token de bot — cópialo

### Obtener tu chat ID

1. Busca **@userinfobot** en Telegram e inícialo
2. Te responde con tu ID numérico de usuario — este es tu chat ID

**Importante:** Envía cualquier mensaje a tu nuevo bot (p. ej., "hi") antes de correr Richfolio — esto es necesario antes de que el bot pueda enviarte mensajes.

Agrega ambos como GitHub Secrets:

- Nombre: `TELEGRAM_BOT_TOKEN`, valor: el token de BotFather
- Nombre: `TELEGRAM_CHAT_ID`, valor: tu ID numérico de usuario

**Notas:** Si no están configurados, el resumen salta Telegram. Los mensajes son resúmenes condensados (no HTML completo). Límite de 4,096 caracteres por mensaje — las noticias se truncan si es necesario.

---

## Publicación en redes sociales — Opcional
{: .text-yellow-200}

Richfolio puede publicar señales de compra genéricas en cuentas públicas de X, Facebook, Threads y LinkedIn. Cada plataforma es opcional y permanece desactivada hasta que se configure. Secrets requeridos por plataforma:

- **Facebook:** `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_TOKEN`
- **Threads:** `THREADS_USER_ID`, `THREADS_ACCESS_TOKEN` (+ opcional `THREADS_TOKEN_PAT` para refrescar automáticamente el token de ~60 días)
- **LinkedIn:** `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_ORG_URN`
- **X/Twitter:** `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`

**Notas:** Las publicaciones son genéricas — no se divulgan tenencias ni asignaciones. Si no está configurada, la publicación en redes sociales se omite. Ver [Publicación en redes sociales](social-setup) para la configuración paso a paso de cada plataforma.

---

## Resumen

| Clave | Requerido | Servicio |
|-----|----------|---------|
| `RESEND_API_KEY` | Sí | Entrega de correo |
| `RECIPIENT_EMAIL` | Sí | Tu dirección de correo |
| `NEWS_API_KEY` | No | Headlines de noticias |
| `GEMINI_API_KEY` | No | Proveedor de IA (Google Gemini) |
| `ANTHROPIC_API_KEY` | No | Proveedor de IA (Anthropic Claude) |
| `MISTRAL_API_KEY` | No | Proveedor de IA (Mistral — nivel Experiment gratuito) |
| `TELEGRAM_BOT_TOKEN` | No | Entrega Telegram |
| `TELEGRAM_CHAT_ID` | No | Entrega Telegram |
| `FACEBOOK_PAGE_ID` / `FACEBOOK_PAGE_TOKEN` | No | Publicación en Página de Facebook |
| `THREADS_USER_ID` / `THREADS_ACCESS_TOKEN` | No | Publicación en Threads |
| `THREADS_TOKEN_PAT` | No | Refrescar automáticamente el token de Threads (PAT con escritura de Secrets) |
| `LINKEDIN_ACCESS_TOKEN` / `LINKEDIN_ORG_URN` | No | Publicación en Página de LinkedIn |
| `X_API_KEY` / `X_API_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` | No | Publicación en X/Twitter |
| `CLAUDE_MODEL` | No | Sobrescribir el modelo de Claude (por defecto: `claude-sonnet-4-6`) |
| `MISTRAL_MODEL` | No | Sobrescribir el modelo de Mistral (por defecto: `mistral-large-latest`) |
| `AI_DETAILED_PROVIDER` | No | Forzar `gemini`, `claude` o `mistral` para la página de análisis de STRONG BUY |
