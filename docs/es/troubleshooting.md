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

Mientras tanto, Richfolio cae automáticamente a recomendaciones basadas en brechas — el resumen seguirá siendo entregado, solo sin análisis de IA. Si también configuraste `ANTHROPIC_API_KEY` o `MISTRAL_API_KEY`, ese proveedor continúa por su cuenta mientras Gemini se recupera — la corrida queda marcada como degradada (badge `⚠ 1/2 AI`) y STRONG BUY se limita a BUY.

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
- Sin `GEMINI_API_KEY`, sin `ANTHROPIC_API_KEY` Y sin `MISTRAL_API_KEY` → recomendaciones basadas en brechas en vez de IA
- Con solo una de las claves de IA → modo IA única (el comportamiento de hoy)
- Con dos o más claves de IA → modo multi-IA: puntuaciones promediadas, desglose por IA mostrado debajo de cada recomendación, STRONG BUY requiere acuerdo unánime
- Sin `TELEGRAM_BOT_TOKEN` → solo correo (sin Telegram)

Todas las combinaciones son válidas — solo `RESEND_API_KEY` y `RECIPIENT_EMAIL` son requeridos.
