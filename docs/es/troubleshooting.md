---
title: Solución de problemas
layout: default
nav_order: 8
lang: es
permalink: /troubleshooting.html
---

# Solución de problemas

Problemas comunes y cómo solucionarlos.

---

## "Can only send testing emails to your own email address"

**Causa:** Restricción del plan gratuito de Resend.

**Solución:** Configura `RECIPIENT_EMAIL` al mismo correo que usaste para registrarte en Resend, o verifica un dominio personalizado en Resend (Dashboard → Domains → Add Domain → agregar registros DNS).

---

## "GEMINI_API_KEY quota: limit 0"

**Causa:** Las claves API nuevas de Gemini tardan unos minutos en activarse. Algunas claves pueden no funcionar en absoluto hasta que se habiliten la facturación y la API.

**Solución:** Prueba estos pasos en orden:

1. **Espera 5-10 minutos** — las claves nuevas a veces solo necesitan tiempo para activarse
2. **Habilita la Generative Language API** — ve a [Google Cloud Console](https://console.cloud.google.com/apis/library) → busca "Generative Language API" → haz clic en **Enable** para el proyecto vinculado a tu clave API
3. **Agrega detalles de facturación** — ve a [Google AI Studio](https://aistudio.google.com) → Settings → Billing y agrega tu información de facturación. Todavía puedes seleccionar el **plan gratuito** — agregar facturación solo activa tu clave, no se te cobrará a menos que excedas los límites gratuitos

Mientras tanto, Richfolio cae automáticamente a recomendaciones basadas en brechas — el resumen seguirá siendo entregado, solo sin análisis de IA. Si también configuraste Claude (`CLAUDE_CODE_OAUTH_TOKEN` o `ANTHROPIC_API_KEY`) o `MISTRAL_API_KEY`, ese proveedor continúa por su cuenta mientras Gemini se recupera — la corrida queda marcada como degradada (badge `⚠ 1/2 AI`) para que el voto de un único proveedor no se lea como verificado de forma cruzada.

---

## "gemini-2.5-flash is no longer available to new users"

**Causa:** Google retira modelos primero para las claves de API **nuevas**. Una clave recién creada recibe un `404` en `gemini-2.5-flash` mientras que una clave más antigua con ese mismo modelo sigue funcionando — por eso esto suele aparecer justo después de añadir una segunda clave de Gemini, no durante la configuración inicial.

```
404 ... models/gemini-2.5-flash is no longer available to new users.
```

**Solución:** define la variable de entorno `GEMINI_MODEL` con un modelo actual. `gemini-flash-latest` es un alias que siempre apunta al Flash más reciente, así que no volverá a romperse la próxima vez que Google rote modelos:

```yaml
GEMINI_MODEL: gemini-flash-latest
```

El valor por defecto se deja deliberadamente en `gemini-2.5-flash` para no mover a otro modelo, sin avisarte, una clave que ya funciona. El workflow de cripto ya lo define. Si tu clave principal llega a dar el mismo error, añade `GEMINI_MODEL` como **Variable** del repositorio — sin cambios de código.

---

## Los pares cruzados de cripto no aparecen en el resumen

**Causa:** una de estas tres cosas, aproximadamente por orden de probabilidad.

**Solución:**

1. **No está configurado** — `watchingCrypto` tiene que estar en tu variable `CONFIG_JSON`, no solo en tu `config.json` local. Cada entrada debe ser una cadena `"BASE/QUOTE"`; una entrada mal formada se omite con un aviso en vez de hacer fallar la ejecución.
2. **Ese mercado no existe** — el log nombra los dos símbolos que intentó (p. ej. `no tradable spot market for NOPE_CRO or CRO_NOPE`). crypto.com debe listar el par en *alguna* dirección; Richfolio lo invierte automáticamente si solo existe el inverso.
3. **Red o bloqueo geográfico** — un `403`/`451` se marca en el log como probable bloqueo geográfico. crypto.com restringe el *trading* a residentes en EE. UU., aunque no se ha observado que los datos de mercado estén bloqueados desde los runners de GitHub. Verifícalo en repo → **Actions** → **Crypto Monitor** → **Run workflow** → modo `smoke`, que comprueba el contrato de la API e imprime exactamente qué paso falló.

---

## Claude ausente del resumen sin ningún aviso

**Causa:** Un `CLAUDE_CODE_OAUTH_TOKEN` vencido o ausente produce exactamente el mismo síntoma que un `ANTHROPIC_API_KEY` faltante — Claude simplemente no aparece. En una configuración solo-Claude, el resumen cae silenciosamente a recomendaciones basadas en brechas; en modo multi-IA, el/los proveedor(es) restante(s) continúan y la corrida queda marcada como degradada (badge `⚠ 1/2 AI`). Nada falla de forma ruidosa — revisa el log de la corrida de GitHub Actions para ver un fallo de autenticación del proveedor Claude.

**Solución:** El token de suscripción dura aproximadamente un año, sin auto-renovación. Vuelve a generarlo localmente con `claude setup-token` y actualiza el secret `CLAUDE_CODE_OAUTH_TOKEN`. Si prefieres usar facturación por pago-por-uso en su lugar, configura `ANTHROPIC_API_KEY` y deja `CLAUDE_CODE_OAUTH_TOKEN` sin configurar.

---

## "fetch failed — internal-error" para un ticker

**Causa:** Yahoo Finance ocasionalmente tiene problemas con tickers específicos (especialmente menos comunes como BIPC).

**Solución:** No se requiere acción. El ticker se salta y todo lo demás continúa normalmente. Este es un problema intermitente de Yahoo Finance.

---

## GitHub Actions muestra secrets vacíos

**Causa:** Los secrets se agregaron al nivel equivocado.

**Solución:** Asegúrate de haber agregado los secrets al nivel de **repositorio**: Settings → Secrets and variables → Actions → Repository secrets. No al nivel de environment.

---

## No se devuelven noticias

**Causa:** El plan gratuito de NewsAPI solo devuelve artículos de las últimas 24 horas. Algunos tickers (especialmente ETFs y small-caps) rara vez aparecen en headlines de noticias.

**Solución:** Esto es comportamiento normal. El resumen corre bien sin noticias para esos tickers. El análisis de IA anotará "no recent news" en sus recomendaciones.

---

## Mensaje de Telegram no recibido

**Causa:** Todavía no has iniciado una conversación con tu bot.

**Solución:** Abre Telegram, encuentra tu bot por username y envíale cualquier mensaje (p. ej., "hi"). La Telegram Bot API requiere que el usuario inicie el contacto antes de que el bot pueda enviar mensajes. Después de eso, vuelve a correr Richfolio.

---

## Error "Missing config.json"

**Causa:** `config.json` no existe en la raíz del proyecto.

**Solución:**
- **GitHub Actions:** Asegúrate de que la variable `CONFIG_JSON` exista con contenido JSON válido (Settings → Secrets and variables → Actions → pestaña **Variables**).
- **Local:** Corre `cp config.example.json config.json` y edítalo con tus datos de portafolio.

---

## El resumen corre pero el correo está vacío o le faltan secciones

**Causa:** Una o más claves de API faltan o son inválidas.

**Solución:** Revisa tu archivo `.env` (local) o GitHub Secrets (Actions). El resumen se adapta a lo disponible:
- Sin `NEWS_API_KEY` → sin sección de noticias
- Sin `GEMINI_API_KEY`, Claude (`CLAUDE_CODE_OAUTH_TOKEN`/`ANTHROPIC_API_KEY`) Y sin `MISTRAL_API_KEY` → recomendaciones basadas en brechas en vez de IA
- Con solo una de las claves de IA → modo IA única (el comportamiento de hoy)
- Con dos o más claves de IA → modo multi-IA: puntuaciones promediadas, desglose por IA mostrado debajo de cada recomendación, STRONG BUY limitado por distancia del desacuerdo (sobrevive un BUY disidente, se limita a BUY con un HOLD/WAIT)
- Sin `TELEGRAM_BOT_TOKEN` → solo correo (sin Telegram)

Todas las combinaciones son válidas — solo `RESEND_API_KEY` y `RECIPIENT_EMAIL` son requeridos.
