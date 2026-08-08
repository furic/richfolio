---
title: Inicio
layout: home
nav_order: 1
lang: es
permalink: /
---

# Richfolio

Un sistema de monitoreo de portafolio cero-mantenimiento. Configura tus asignaciones objetivo una sola vez y recibe resúmenes diarios con brechas de asignación, señales de compra impulsadas por IA y noticias relevantes — entregados por correo electrónico y Telegram, automáticamente vía GitHub Actions.

**Todo funciona con planes gratuitos. Sin servidor, sin dashboard, sin costos recurrentes.**

---

## Qué obtienes

Cada mañana, Richfolio obtiene datos de mercado en vivo, ejecuta análisis de asignación, genera recomendaciones de compra con IA y entrega un reporte pulido a tu bandeja de entrada y Telegram.

![Resumen diario](../screenshots/morning-debrief.png){: style="max-width: 400px; display: block; margin: 16px auto;" }

| Componente | Servicio | Costo |
|-----------|---------|------|
| Precios y fundamentales | Yahoo Finance | Gratis |
| Noticias | NewsAPI.org | Gratis (100 req/día) |
| Análisis con IA | Google Gemini 2.5 Flash | Gratis (~20 req/día) |
| Correo | Resend.com | Gratis (3,000/mes) |
| Telegram | Telegram Bot API | Gratis |
| Programador | GitHub Actions | Gratis (cron) |

---

## Para quién es esto

Richfolio **no elige acciones por ti**. Tú ya deberías tener tu propio portafolio de acciones, ETFs o cripto en los que crees.

Lo que Richfolio hace es **monitorear tu portafolio diariamente** y ayudarte a decidir **cuándo** comprar — siguiendo precios, indicadores técnicos, sentimiento de noticias y brechas de asignación, y luego usando IA para resaltar las mejores oportunidades de timing.

- **Tú aportas el portafolio** — define tus asignaciones objetivo una vez en una configuración JSON simple
- **Richfolio aporta las señales** — recomendaciones de compra, precios de orden límite y análisis detallado
- **Tú tomas la decisión final** — cada decisión de compra es tuya; la herramienta solo sugiere

**No requiere programar.** Haz fork del repo, dedica ~10 minutos a registrar cuentas gratuitas de API, pega tus claves en los Settings de GitHub y listo. Todo corre automáticamente vía GitHub Actions a $0/mes.

---

## Documentación

| Página | Descripción |
|------|-------------|
| [Funcionalidades](features) | Lo que hace Richfolio — las 10 capacidades explicadas |
| [Primeros pasos](getting-started) | Fork, configura y despliega en 4 pasos |
| [Configuración](configuration) | Referencia de campos de `CONFIG_JSON`, formatos de tickers, consejos |
| [Claves de API](api-keys) | Configuración paso a paso de Resend, NewsAPI, Gemini, Telegram |
| [Despliegue](deployment) | GitHub Actions, secrets, personalización del horario |
| [Cómo funciona](how-it-works) | Arquitectura, pipeline de datos, lógica de análisis |
| [Desarrollo local](local-development) | Para usuarios avanzados — ejecutar localmente para personalización o disparos manuales |
| [Solución de problemas](troubleshooting) | Errores comunes y soluciones |
| [Referencias](references) | Trabajo previo e influencias de diseño |
