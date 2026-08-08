---
title: Configuración
layout: default
nav_order: 4
lang: es
permalink: /configuration.html
---

# Configuración

Richfolio usa una única configuración JSON para todos los datos del portafolio — tu portafolio se mantiene privado.

---

## Configuración inicial

Ve a tu fork: Settings → Secrets and variables → Actions → pestaña **Variables** → crea una variable llamada `CONFIG_JSON` con el contenido JSON de abajo.

## Ejemplo

```json
{
  "targetPortfolio": {
    "VOO": 20,
    "QQQ": 15,
    "GLD": 10,
    "BSV": 20,
    "SMH": 5,
    "BTC": 1.5
  },
  "currentHoldings": {
    "AAPL": 30,
    "VOO": 1,
    "BTC": 0.0002
  },
  "watching": ["MSFT", "NVDA", "AMD"],
  "totalPortfolioValue": 50000,
  "defaultCurrency": "USD",
  "intradayAlerts": {
    "enabled": true,
    "confidenceIncreaseThreshold": 10
  }
}
```

---

## Referencia de campos

| Campo | Requerido | Descripción |
|-------|----------|-------------|
| `targetPortfolio` | Sí | Porcentajes de asignación objetivo. Las claves son símbolos de ticker, los valores son porcentajes que deben sumar ~100%. |
| `currentHoldings` | Sí | Número de acciones que posees actualmente. Puede incluir acciones que no están en tu objetivo (p. ej., AAPL para detección de overlap de ETFs). |
| `watching` | No | Array de tickers que se rastrean pero **no** están en tu portafolio objetivo. Se obtienen, son puntuados por la IA y aparecen en una sección separada "Watch List" — sin contaminar las matemáticas de asignación. Ver [Watch List](#watch-list) abajo. |
| `totalPortfolioValue` | Sí | Tu valor total estimado de portafolio (en `defaultCurrency`). Se usa para los cálculos de asignación cuando tus tenencias reales son menores que el objetivo. |
| `defaultCurrency` | No | Código de moneda ISO 4217 (p. ej. `"USD"`, `"GBP"`, `"AUD"`). Default: `"USD"`. Todos los montos en correos/Telegram se renderizan en esta moneda; los tickers en otras divisas se convierten vía tipos de cambio en vivo de Yahoo Finance. |
| `intradayAlerts` | No | Configuración de alertas intradía (ver abajo). Se aplican defaults si se omite. |

---

## Alertas intradía

La sección `intradayAlerts` controla cuándo las verificaciones intradía envían alertas. Todos los campos son opcionales — se aplican defaults razonables.

Las alertas se disparan solo por cambios relacionados con STRONG BUY:
1. **Upgrade a STRONG BUY** — cualquier otro nivel → STRONG BUY
2. **Downgrade desde STRONG BUY** — STRONG BUY → cualquier otro nivel
3. **Cambio de confianza** — la confianza cambió ≥ umbral mientras se mantiene STRONG BUY

| Campo | Default | Descripción |
|-------|---------|-------------|
| `enabled` | `true` | Toggle maestro. Pon `false` para deshabilitar las alertas intradía por completo. |
| `confidenceIncreaseThreshold` | `10` | Cambio mínimo de confianza (absoluto, puntos porcentuales) para disparar una alerta para tickers STRONG BUY. |

---

## Análisis de refresh

Re-analiza un único ticker con el último precio (incluyendo after-hours/pre-market). Envía correo + Telegram con una nueva URL de análisis.

Actions → Portfolio Monitor → **Run workflow** → mode: `refresh`, ticker: `SMH`.

Se usan `postMarketPrice` y `preMarketPrice` de Yahoo Finance cuando están disponibles. Cae al precio regular de mercado si los datos after-hours no están disponibles.

---

## Watch List

El array opcional `watching` rastrea tickers que quieres que sean **puntuados y se muestren como señales** pero que no quieres en tu portafolio objetivo. Se obtienen, se incluyen en el prompt y se puntúan junto con los tickers del portafolio, pero saltan todas las reglas basadas en asignación.

**Úsalo cuando:**

- Estás investigando una acción antes de comprometerte a un peso objetivo
- Quieres recomendaciones sobre nombres que actualmente no posees (p. ej. *"¿es buen momento para iniciar una posición en NVDA?"*)
- Quieres señales sobre tickers sin inflar los totales de tu portafolio por encima del 100%

### Cómo difieren los tickers de watch de los tickers del portafolio

| Comportamiento | Ticker del portafolio | Ticker de watch |
|---|---|---|
| Cuenta para el % de asignación | Sí | **No** |
| Se calcula brecha de asignación | Sí | **No** |
| `gap ≥ 2%` requerido para STRONG BUY | Sí | **No** — STRONG BUY requiere confluencia de señales en su lugar |
| Aplica la guardia de posición sobreponderada | Sí | **No** |
| Cuenta contra el tope de máximo 2 STRONG BUY | Sí | **No** — muestra cada watch STRONG BUY que califique |
| `suggestedBuyValue` poblado | Sí (basado en la brecha) | **Siempre 0** — dimensionas manualmente |
| Renderizado en la sección principal "AI Buy Recommendations" | Sí | No — sección separada "Watch List" |
| Precio límite sugerido | Sí | Sí (misma lógica) |
| Página de análisis detallado STRONG BUY | Sí | Sí |

### Criterios STRONG BUY para watch

Como no hay una brecha de asignación en la cual anclarse, los tickers de watch necesitan una confluencia de señales más fuerte para ganarse un STRONG BUY:

- ≥1 señal de nivel de precio (P/E por debajo del promedio histórico, posición en 52 semanas < 30%, o precio por debajo del MA de 200 días)
- ≥2 señales de momentum que confirmen la señal de nivel de precio (RSI < 35, cruce alcista de MACD, %B de Bollinger < 0.15, %K de Stochastic < 20, OBV subiendo)
- Sin señales de riesgo mayores
- Confianza ≥ 80% basada únicamente en la confluencia de señales
- Calificación de valor A o B (para acciones; ETFs y cripto omiten esto)

### Ejemplo

```json
{
  "targetPortfolio": { "VOO": 20, "GLD": 10, ... },
  "currentHoldings": { "VOO": 5, "AAPL": 30 },
  "watching": ["MSFT", "NVDA", "AMD", "AVGO"]
}
```

Este portafolio tiene AAPL + VOO y rastrea MSFT/NVDA/AMD/AVGO únicamente como señales de investigación. Los tickers de watch aparecen en su propia sección de correo/Telegram, nunca empujan el total del portafolio por encima del 100%, y no compiten con los STRONG BUYs del portafolio.

---

## Formatos de ticker

| Tipo | Formato | Ejemplos |
|------|--------|----------|
| Acciones/ETFs de EE. UU. | Símbolo estándar | `AAPL`, `VOO`, `QQQ`, `SMH` |
| Cripto | Nombre corto | `BTC`, `ETH` (auto-convertidos a `BTC-USD`, `ETH-USD`) |
| Internacional | Símbolo de Yahoo Finance | `0700.HK` (Tencent), `TM` (Toyota) |

---

## Consejos

- **Los porcentajes objetivo** deben sumar 100%. Si no lo hacen, los cálculos de brecha siguen funcionando pero pueden sugerir compras más grandes o más pequeñas.

- **Las tenencias fuera de tu objetivo** se rastrean para la detección de overlap de ETFs. Por ejemplo, tener AAPL reduce la prioridad de compra para ETFs que contienen AAPL (como VOO o QQQ).

- **Acciones fraccionarias** son soportadas — útil para cripto (`"BTC": 0.000188`) o brokers que soportan compras de acciones fraccionarias.

- **El valor del portafolio** usa el mayor entre el valor real de tus tenencias y la estimación configurada. Esto mantiene los cálculos de brecha útiles mientras aún construyes hacia tu asignación objetivo.

<details>
<summary><strong>¿Cuántos tickers puedo agregar?</strong></summary>

<br>

Richfolio funciona mejor con un portafolio enfocado. Aunque no hay un límite codificado, las cuotas de las APIs de plan gratuito y la legibilidad del resumen establecen fronteras prácticas.

**Rangos recomendados:**

| Rango | Veredicto |
|-------|---------|
| **10-20** | Punto óptimo — enfocado, accionable, todos los planes gratuitos cómodos |
| **20-30** | Todavía bien — resumen manejable, bien dentro de los límites |
| **30-50** | Funciona técnicamente, pero el resumen diario se vuelve ruidoso |
| **50+** | No recomendado (ver abajo) |

**Por qué 50+ tickers no se recomienda:**

- **NewsAPI (100 req/día)** — las noticias se obtienen en batches de 5 tickers. Correr daily + intraday con 50 tickers usa ~22 llamadas; a 100 tickers son ~42, dejando poco margen para refreshes.
- **Calidad del análisis de IA** — Gemini produce recomendaciones más diluidas cuando evalúa demasiadas opciones a la vez.
- **Legibilidad del resumen** — el correo se vuelve largo y Telegram trunca en 4,096 caracteres. La relación señal-ruido cae bruscamente.
- **Tiempo de ejecución** — cada ticker requiere llamadas a Yahoo Finance para precio, técnicos y fundamentales, ralentizando tu corrida de GitHub Actions.

El plan gratuito de Gemini es ahora la restricción más ajustada de todo el stack: un 429 real en agosto de 2026 reportó una cuota de ~20 requests/día para `gemini-2.5-flash`, y el horario de richfolio (1 corrida diaria + 5 intradía) usa 13+ requests/día — así que Gemini a menudo agotará su cuota y quedará fuera de corridas posteriores. El throughput de tokens no es el problema (incluso 100 tickers solo usan ~53K tokens por corrida a 250K tokens/min) — lo que limita es la *cantidad* de requests. Las otras restricciones reales son la cuota de NewsAPI y la sobrecarga de información.

**TL;DR — apunta a ≤30 tickers para la mejor experiencia en todos los planes gratuitos.**

</details>

---

## Actualización

Cuando cambien tus tenencias, actualiza la variable `CONFIG_JSON` con el nuevo contenido JSON (Settings → Secrets and variables → Actions → pestaña Variables).
