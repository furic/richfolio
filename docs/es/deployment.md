---
title: Despliegue
layout: default
nav_order: 6
lang: es
permalink: /deployment.html
---

# Despliegue

Richfolio corre en GitHub Actions, programado por un pequeño Cloudflare Worker — sin servidor necesario. Haz fork del repo, agrega los secrets, configura el programador y corre automáticamente cada mañana.

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

Una vez configurado el programador, los workflows corren automáticamente:

- **Diario** — 22:00 UTC (8 am AEST)
- **Intradía** — días laborables a las 03:15 / 07:15 / 11:15 / 14:15 UTC (1:15 pm / 5:15 pm / 9:15 pm / 12:15 am AEST) — solo alerta cuando las señales se refuerzan
- **Semanal** — domingo 22:30 UTC (lunes 8:30 am AEST)

Si usas `watchingCrypto`, un segundo workflow corre en paralelo:

- **Cripto** — cada 3 horas (8×/día), alertando solo cuando la señal de un par cruzado cambia de forma significativa frente al ancla de ese día

Se mantiene separado de Portfolio Monitor a propósito: de lo contrario compartirían la caché `state/`, y las corridas de cripto sobrescribirían la línea base matinal de las acciones.

Puedes ejecutar cualquier modo manualmente en cualquier momento: repo → **Actions** → **Portfolio Monitor** (o **Crypto Monitor**) → **Run workflow** → elige un modo. Crypto Monitor además ofrece un modo `smoke` que verifica la API de crypto.com sin enviar nada.

### Configurar el programador

**Ninguno de los dos workflows tiene un trigger `schedule:`.** Los dispara un Cloudflare Worker en [`scheduler/`](https://github.com/furic/richfolio/tree/main/scheduler) mediante `repository_dispatch`, porque el programador propio de GitHub ya no es lo bastante puntual como para confiar en él.

La documentación de GitHub indica que los workflows programados "pueden retrasarse durante períodos de mucha carga" y, si la carga es suficiente, se descartan por completo — es comportamiento documentado, así que nunca aparece en githubstatus.com. El personal de GitHub reconoció el empeoramiento del desfase en [community discussion #196910](https://github.com/orgs/community/discussions/196910), sin comprometer una fecha de arreglo. Medido en este repo durante agosto de 2026, el resumen diario de las 22:00 UTC pasó de **+30 min** a **+5 a 8 horas**, y un día no se ejecutó en absoluto. El trabajo en sí tardó siempre unos 25 minutos — el retraso venía enteramente de la cola de despacho de GitHub.

La configuración es gratuita y toma unos cinco minutos — consulta [`scheduler/README.md`](https://github.com/furic/richfolio/blob/main/scheduler/README.md). Necesitas una cuenta de Cloudflare (el plan gratuito basta: 100.000 solicitudes/día, 5 Cron Triggers) y un PAT fine-grained de GitHub con permiso **Contents: read & write**.

<details>
<summary><strong>Alternativa: volver al cron de GitHub (sin configuración, pero impuntual)</strong></summary>

<br>

Si prefieres no configurar Cloudflare y toleras que el resumen llegue horas tarde — o que algún día no llegue —, vuelve a añadir un bloque `schedule:` a `.github/workflows/portfolio-monitor.yml` en tu fork:

```yaml
on:
  schedule:
    - cron: "0 22 * * *"           # Diario — 8 am AEST
    - cron: "15 3,7,11,14 * * 1-5" # Intradía — días laborables
  repository_dispatch:
    types: [daily, intraday, weekly]
  workflow_dispatch:
    # ... deja los inputs existentes intactos
```

También debes devolver al paso "Determine mode" la capacidad de resolver el modo a partir de la programación, ya que hoy solo lee `github.event.action`:

```yaml
case "$EVENT_NAME" in
  repository_dispatch) MODE="$DISPATCH_TYPE" ;;
  workflow_dispatch)   MODE="$INPUT_MODE" ;;
  schedule)            [ "$CRON" = "0 22 * * *" ] && MODE="daily" || MODE="intraday" ;;
esac
```

añadiendo `CRON: ${{ github.event.schedule }}` al `env:` de ese paso.

Ten en cuenta que en el cron de **GitHub** `1-5` significa lunes a viernes. Cloudflare usa la convención opuesta (`1` = domingo), y por eso la configuración del Worker escribe los días con letras. No copies números de día de la semana entre ambos.

> ⚠️ **Nunca uses los dos a la vez.** GitHub termina entregando el cron atrasado, así que recibirías un segundo resumen duplicado horas después del que envió el Worker — y si tienes configuradas las publicaciones sociales, también publicaciones públicas duplicadas. Elige uno.

En esta configuración no hay un semanal programado: el enfoque anterior le preguntaba el día de la semana al runner (`date -u +%u`) y solo enviaba los domingos, algo que el desfase rompió en silencio — un cron del domingo a las 22:00 entregado el lunes a las 03:00 UTC calcula day=1 y lo omite sin dejar rastro en los logs. Ejecútalo a mano desde **Actions → Run workflow → weekly**, o usa el Worker.

</details>

<details>
<summary><strong>Cambiar la programación o la zona horaria</strong></summary>

<br>

La programación por defecto apunta a AEST (UTC+10). Para cambiarla, edita `triggers.crons` en `scheduler/wrangler.jsonc` **y** la clave correspondiente del mapa `TRIGGERS` en `scheduler/src/index.js` — un test hace fallar la compilación si ambos se desincronizan — y luego redespliega con `npx wrangler deploy`.

Los Cron Triggers usan **siempre UTC**. Convierte primero la hora local que quieras:

| Tu hora local | Cron UTC |
|-----------------|----------|
| 8 am AEST (UTC+10) | `0 22 * * *` (día anterior) |
| 8 am EST (UTC-5) | `0 13 * * *` |
| 8 am PST (UTC-8) | `0 16 * * *` |
| 8 am GMT (UTC+0) | `0 8 * * *` |
| 8 am IST (UTC+5:30) | `0 2 * * *` (lo más cercano) |
| 9 am JST (UTC+9) | `0 0 * * *` |
| 8 am CET (UTC+1) | `0 7 * * *` |

Solo cambia la hora (el `22` en `0 22 * * *`) — el resto controla minuto, día, mes y día de la semana.

**El día de la semana se escribe con letras, nunca con números.** Cloudflare sigue la convención de Quartz: `1` = **domingo** y `7` = sábado — al revés que el `1` = lunes del cron de Unix. Por eso un `1-5` numérico significa domingo a jueves, y Cloudflare lo acepta en silencio: despliega sin errores, corre el domingo y se salta el viernes. Usa `MON-FRI` y `SUN`.

Para controlar cómo se muestran las fechas dentro de los correos, usa la Variable de Actions `TIME_ZONE` (por ejemplo `Australia/Sydney`) — es independiente de cuándo se disparan las corridas.

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
