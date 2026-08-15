---
title: Desarrollo local
layout: default
nav_order: 9
lang: es
permalink: /local-development.html
---

# Desarrollo local

Para usuarios avanzados que quieran personalizar el código, probar modificaciones o disparar corridas manualmente. La mayoría de los usuarios no necesitan esto — GitHub Actions maneja todo automáticamente.

---

## Requisitos

- **Node.js 22+** — [Descargar](https://nodejs.org/)
- **npm** — viene con Node.js

---

## Instalación

```bash
git clone https://github.com/YOUR_USERNAME/richfolio.git
cd richfolio
npm install
```

---

## Configuración

### Portafolio (`config.json`)

```bash
cp config.example.json config.json
```

Edita `config.json` con tus asignaciones objetivo y tenencias actuales. Consulta [Configuración](configuration) para la referencia completa de campos.

### Claves de API (`.env`)

```bash
cp .env.example .env
```

Agrega tus claves de API. Como mínimo necesitas `RESEND_API_KEY` y `RECIPIENT_EMAIL`. Consulta [Claves de API](api-keys) para instrucciones paso a paso de cada servicio.

---

## Ejecución

```bash
# Resumen diario — precios + noticias + análisis IA + correo + Telegram
npm run dev

# Verificación de alerta intradía — compara vs baseline matutina
npm run intraday

# Reporte semanal de rebalanceo — precios + drift de asignación + correo + Telegram
npm run weekly

# Re-analizar un único ticker con precio after-hours
npm run refresh -- SMH

# Comprobación de pares cruzados de cripto (señales de conversión CRO→BTC/ETH)
npm run crypto

# Type-check sin emitir
npx tsc --noEmit
```

Revisa tu correo y Telegram para los resultados.
