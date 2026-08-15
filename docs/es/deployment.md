---
title: Despliegue
layout: default
nav_order: 6
lang: es
permalink: /deployment.html
---

# Despliegue

Richfolio corre como un cron job de GitHub Actions — sin servidor necesario. Haz fork del repo, agrega secrets y corre automáticamente cada mañana.

---

## Hacer fork del repo

Si todavía no lo hiciste, [haz fork de richfolio](https://github.com/furic/richfolio/fork) a tu propia cuenta de GitHub. Los workflows de GitHub Actions solo corren en tus propios repositorios — hacer fork te da la programación automatizada para resúmenes diarios, alertas intradía y reportes semanales.

---

## Habilitar workflows

GitHub deshabilita Actions por defecto en repos recién forkeados. Ve a tu fork → pestaña **Actions** → haz clic en **"I understand my workflows, go ahead and enable them"**.

---

## Agregar Secrets y Variables

En tu repo forkeado: **Settings** → **Secrets and variables** → **Actions**. Este es el checklist del lado de despliegue de qué va dónde — para cómo obtener cada clave API, consulta [Claves de API](api-keys).

| Item | Pestaña | Notas |
|---|---|---|
| `RESEND_API_KEY` | **Secrets** | Requerido |
| `NEWS_API_KEY` | **Secrets** | Opcional |
| `GEMINI_API_KEY` | **Secrets** | Opcional — proveedor de IA (Google Gemini) |
| `GEMINI_API_KEY_CRYPTO` | **Secrets** | Opcional — segunda clave de Gemini para el workflow de cripto, para que su cadencia de 8×/día tenga su propia cuota |
| `CLAUDE_CODE_OAUTH_TOKEN` | **Secrets** | Opcional — proveedor de IA (Anthropic Claude vía suscripción Pro/Max, sin costo por token). Tiene prioridad sobre `ANTHROPIC_API_KEY` si ambas están configuradas — usa solo una |
| `ANTHROPIC_API_KEY` | **Secrets** | Opcional — proveedor de IA (Anthropic Claude, pago por uso). Combínalo con otro proveedor para el modo multi-IA |
| `MISTRAL_API_KEY` | **Secrets** | Opcional — proveedor de IA (Mistral, nivel Experiment gratuito). Combínalo con otro proveedor para el modo multi-IA |
| `TELEGRAM_BOT_TOKEN` | **Secrets** | Opcional |
| `TELEGRAM_CHAT_ID` | **Secrets** | Opcional |
| `RECIPIENT_EMAIL` | **Variables** | Requerido — visible para edición fácil |
| `CONFIG_JSON` | **Variables** | Requerido — el JSON de tu portafolio ([formato](configuration)) |
| `CLAUDE_MODEL` | **Variables** | Opcional — sobrescribe el modelo de Claude (por defecto: `claude-sonnet-4-6`) |
| `MISTRAL_MODEL` | **Variables** | Opcional — sobrescribe el modelo de Mistral (por defecto: `mistral-large-latest`) |
| `AI_DETAILED_PROVIDER` | **Variables** | Opcional — fuerza `gemini`, `claude` o `mistral` para la página de análisis de STRONG BUY |
| `TIME_ZONE` | **Variables** | Opcional — zona horaria IANA para el formato de fecha/hora en los correos (p. ej. `Australia/Sydney`, `America/New_York`, `Europe/London`). Por defecto: `UTC`. El workflow lo mapea a la variable de entorno nativa `TZ` de Node |

{: .important}
> **Por qué `CONFIG_JSON` es una variable, no un secret:** Las Variables permanecen legibles en la UI de GitHub, así puedes editar tus tenencias directamente sin re-pegar el JSON entero cada vez. La contrapartida es que cualquiera con acceso de lectura al repo puede ver tus asignaciones — bien para un fork privado, algo a considerar si alguna vez lo haces público.

---

## Programación

El workflow corre automáticamente:

- **Diario** — todos los días a las 22:00 UTC (8 am AEST)
- **Intradía** — días laborables a las 10 am, 12 pm, 2 pm, 4 pm AEST (alertas solo cuando las señales se fortalecen)
- **Semanal** — cada domingo a las 22:00 UTC (lunes 8 am AEST)

Si usas `watchingCrypto`, un segundo workflow se ejecuta en paralelo:

- **Cripto** — cada 3 horas (8×/día), alertando solo cuando una señal de par cruzado cambia de forma material respecto al ancla de ese día

Se mantiene separado de Portfolio Monitor a propósito: compartir ese workflow habría disparado su job semanal ocho veces más al día, se habría interpretado como una ejecución intradía de acciones, y habría dejado que las ejecuciones de cripto sobrescribieran la baseline matutina de acciones en la caché de estado compartida.

También puedes disparar manualmente: repo → **Actions** → **Portfolio Monitor** (o **Crypto Monitor**) → **Run workflow** → elige un modo. Crypto Monitor ofrece además un modo `smoke` que verifica el contrato de la API de crypto.com sin enviar nada.

<details>
<summary><strong>Cambiar la programación o la zona horaria</strong></summary>

<br>

La programación por defecto está configurada para AEST (UTC+10). Para cambiarla, edita `.github/workflows/portfolio-monitor.yml` en tu fork.

El archivo contiene tres entradas cron — una por cada modo:

```yaml
schedule:
  - cron: "0 22 * * *"    # Diario a las 22:00 UTC (8 am AEST)
  - cron: "0 0,2,4,6 * * 1-5"  # Verificaciones intradía (días laborables)
  - cron: "0 22 * * 0"    # Semanal el domingo a las 22:00 UTC
```

El cron de GitHub Actions **siempre está en UTC**. Para obtener tu hora local deseada, convierte primero a UTC:

| Tu hora local | Cron UTC |
|-----------------|----------|
| 8 am AEST (UTC+10) | `0 22 * * *` (día anterior) |
| 8 am EST (UTC-5) | `0 13 * * *` |
| 8 am PST (UTC-8) | `0 16 * * *` |
| 8 am GMT (UTC+0) | `0 8 * * *` |
| 8 am IST (UTC+5:30) | `0 2 * * *` (más cercano) |
| 9 am JST (UTC+9) | `0 0 * * *` |
| 8 am CET (UTC+1) | `0 7 * * *` |

**Tip:** Busca "UTC time converter" para encontrar el valor cron correcto para tu zona horaria. Solo cambia la hora (`22` en `0 22 * * *`) — el resto controla minuto, día, mes y día de la semana.

</details>

---

## Actualizar tu portafolio

Cuando cambien tus tenencias, actualiza la variable `CONFIG_JSON` en GitHub (Settings → Secrets and variables → Actions → pestaña Variables). La siguiente corrida programada usará los datos actualizados.

---

## Traer actualizaciones del upstream

Para obtener nuevas funcionalidades del repo original:

```bash
git remote add upstream https://github.com/furic/richfolio.git
git fetch upstream
git merge upstream/main
git push origin main
```

O usa el botón **Sync fork** de GitHub en la página principal de tu fork.
