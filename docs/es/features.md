---
title: Funcionalidades
layout: default
nav_order: 2
lang: es
permalink: /features.html
---

# Funcionalidades

Richfolio empaqueta más de 19 capacidades en un único pipeline — todas funcionando sobre APIs de plan gratuito.

---

## Análisis de IA en dos etapas (marco Think/Plan)

Richfolio usa un marco cognitivo de dos etapas inspirado en la arquitectura Think/Plan de [OpenAlice](https://github.com/TraderAlice/OpenAlice):

**Etapa 1: Observar (Think)** — Gemini extrae observaciones estructuradas por ticker: qué señales de nivel de precio están presentes (P/E por debajo del promedio, cerca del mínimo de 52 semanas, por debajo del MA200), qué señales de momentum están activas (RSI < 35, MACD alcista, %B de Bollinger < 0.15, %K de Stochastic < 20), señales de riesgo, resúmenes de una frase de valuación y técnicos, sentimiento de noticias y contexto de asignación. En esta etapa no hay recomendaciones de acción — pura interpretación de datos.

**Etapa 2: Decidir (Plan)** — Una llamada separada a Gemini recibe las observaciones estructuradas (no los números crudos) junto con todas las reglas de decisión y el contexto de razonamiento histórico, y aplica los criterios STRONG BUY para producir las recomendaciones finales. Como la etapa de decisión trabaja con observaciones pre-procesadas, aplica los criterios estrictos de manera más consistente.

Cada ticker recibe una acción: **STRONG BUY**, **BUY**, **HOLD** o **WAIT**, junto con un monto sugerido en dólares, precio de orden límite, calificación de valor (acciones) y señal de fondo (detección de sobreventa). Si la API de Gemini no está disponible o se agota la cuota, Richfolio cae automáticamente a recomendaciones basadas en brechas. Los errores transitorios de Gemini (503/429) se reintentan automáticamente hasta 2 veces con backoff.

Los tickers **STRONG BUY** también reciben un enlace **"More Details"** en el correo y en el mensaje de Telegram. Hacer clic abre una página de análisis dedicada en GitHub Pages con un gráfico interactivo de TradingView, tesis de compra detallada, análisis de riesgo, métricas clave, fundamentales y resumen de acción — todo generado por Gemini 2.5 Flash.

![Resumen diario](../screenshots/morning-debrief.png){: style="max-width: 400px; display: inline-block; margin: 16px 8px;" }
![Análisis STRONG BUY](../screenshots/strong-buy-analysis.png){: style="max-width: 400px; display: inline-block; margin: 16px 8px;" }

---

## Guardia de calendario de earnings

Richfolio detecta automáticamente las próximas fechas de earnings usando el módulo `calendarEvents` de Yahoo Finance (cero llamadas API extras — se monta sobre la petición existente de `quoteSummary`) y aplica topes programáticos de seguridad:

- **Earnings ≤ 3 días** → fuerza **HOLD** — el riesgo/recompensa de mantener durante earnings es demasiado asimétrico para una recomendación de compra
- **Earnings ≤ 7 días** → tope en **BUY** — nunca STRONG BUY con earnings inminentes
- **Earnings ≤ 14 días** → se muestra como insignia de color en el correo y como etiqueta `[earnings Xd]` en Telegram para tu información

Esta guardia se ejecuta tanto en el prompt de IA (instrucción suave) como en un tope programático duro en el pipeline de guardias (la IA no puede sobrepasarlo). Inspirado en la conciencia de calendario de earnings de [OpenAlice](https://github.com/TraderAlice/OpenAlice) para evitar posiciones durante eventos de alto riesgo.

---

## Pipeline de validación posterior a la IA

Después de que la IA devuelve recomendaciones, un pipeline de validación programático ejecuta 6 verificaciones secuenciales para detectar errores comunes de la IA antes de que lleguen al usuario. Inspirado en el concepto de pipeline de guardias con aislamiento de contexto de [OpenAlice](https://github.com/TraderAlice/OpenAlice):

1. **Tope de bond ETFs** — ETFs de bonos de corta duración (BSV, SHY, etc.) limitados a BUY con confianza máxima de 65%
2. **Proximidad de earnings** — aplica programáticamente la guardia de calendario de earnings
3. **Aplicación de criterios STRONG BUY** — verifica brecha de asignación ≥ 2%, confianza ≥ 80% y al menos 1 señal de nivel de precio presente; degrada a BUY si falla alguna
4. **Máximo 2 STRONG BUY** — ordena por confianza, conserva solo los 2 mejores, degrada el resto
5. **Cordura de confianza** — tope en 95% (la IA ocasionalmente saca 98-100); tope HOLD/WAIT en 70%
6. **Cordura del monto de compra** — limita el monto sugerido al tamaño de la brecha; pone en cero los montos de compra de HOLD/WAIT

Cada guardia registra cuándo se dispara para fines de depuración. Las guardias operan de forma independiente — reciben datos de recomendación, no objetos crudos de broker/API.

---

## Señales técnicas de momentum

Richfolio obtiene 250 días de datos históricos de precio vía Yahoo Finance y calcula indicadores técnicos para cada ticker de tu portafolio:

- **SMA50 / SMA200** — promedios móviles simples de 50 y 200 días, con la posición del precio actual relativa a cada uno
- **RSI(14)** — Índice de Fuerza Relativa de 14 días (por debajo de 30 = sobreventa, por encima de 70 = sobrecompra)
- **MACD** — Moving Average Convergence Divergence (EMA12 − EMA26, línea de señal = EMA9 del MACD). Detecta cambios de momentum vía cruces (alcista/bajista) y dirección del histograma. Mejor para mercados con tendencia
- **Bandas de Bollinger** — SMA(20) ± 2 desviaciones estándar. Rastrea %B (posición dentro de las bandas: 0 = banda inferior, 1 = banda superior), bandwidth (volatilidad) y **detección de squeeze** (bandwidth en el 20% inferior del rango de 120 días señaliza una ruptura inminente). Mejor para mercados en rango
- **ATR(14)** — Average True Range con suavizado de Wilder. Reportado como valor absoluto y % del precio. ATR% > 3% = alta volatilidad (la IA amplía las órdenes límite), ATR% < 1% = baja volatilidad (límites más ajustados). Útil para contextualizar el tamaño de posición
- **Oscilador estocástico** — %K(14) con suavizado %D(3). %K < 20 = confirmación de sobreventa (añadido a las señales de momentum para los criterios STRONG BUY), %K > 80 = sobrecompra. Complementa el RSI con un método de cálculo diferente
- **OBV (On-Balance Volume)** — volumen acumulado on-balance con análisis de tendencia de 10 días vía regresión lineal. Reporta solo la dirección: **subiendo** (acumulación), **bajando** (distribución) o **plano** (neutral). Los valores absolutos de OBV no significan nada entre tickers — solo importa la tendencia
- **Golden cross / Death cross** — SMA50 cruzando por encima (alcista) o por debajo (bajista) de SMA200
- **Señal de momentum** — clasificada como **alcista**, **bajista** o **neutral** basada en el precio vs MAs y RSI
- **Mínimos recientes** — mínimos de 7 y 30 días para identificar niveles de soporte cercanos

El prompt de IA incluye **reglas explícitas de resolución de conflictos** cuando MACD y Bandas de Bollinger discrepan: se confía en MACD en mercados con tendencia, en Bollinger en mercados de rango. Cuando ambos coinciden, la confianza aumenta. Un squeeze de Bollinger con un cruce simultáneo de MACD se trata como la señal de entrada más fuerte.

Todos los datos técnicos — incluyendo el cambio de volumen (promedio de 7 días vs 30 días) — alimentan el prompt de IA para recomendaciones mejor fundamentadas. Para tickers **STRONG BUY**, los detalles de momentum (incluyendo cruce/histograma de MACD, %B y estado de squeeze) se muestran directamente en el correo y en el mensaje de Telegram.

---

## Precios de orden límite

Cuando Gemini recomienda **STRONG BUY** o **BUY**, también sugiere un precio de orden límite ligeramente por debajo del mercado actual. El precio sugerido se basa en el nivel de soporte más cercano:

- **Soporte por media móvil** — precio cerca del MA de 50 o 200 días
- **Mínimos recientes** — mínimo de 7 o 30 días como suelo de soporte
- **Números redondos** — soporte psicológico en niveles de precio redondos

Los precios de orden límite y su justificación se muestran para los tickers **STRONG BUY** en el correo diario, el mensaje de Telegram y las alertas intradía.

---

## Marco de inversión en valor

Para acciones individuales (no ETFs ni cripto), la IA aplica un marco estructurado de inversión en valor y asigna una **calificación A-D** basada en cinco criterios fundamentales:

- **ROE > 15%** — fuerte rentabilidad
- **Deuda/Patrimonio < 50%** — apalancamiento conservador
- **FCF/CF Operativo > 80%** — fuerte conversión de efectivo
- **Crecimiento positivo de earnings** — negocio en crecimiento
- **Precio por debajo del target del analista** — subvaluación del mercado

| Calificación | Criterios cumplidos | Significado |
|--------|-------------|---------|
| **A** | 4-5 | Excelente valor |
| **B** | 3 | Buen valor |
| **C** | 1-2 | Valor justo |
| **D** | 0 | Sobrevaluado |

La calificación de valor se incluye en el cálculo de confianza de la IA (A suma ~10 puntos, D resta ~10 puntos) y se muestra como una insignia de color en la salida de correo y Telegram.

Todos los datos fundamentales provienen del módulo `financialData` de Yahoo Finance, añadido a la llamada existente de `quoteSummary` — **cero sobrecarga API adicional**.

---

## Modelo de bottom-fishing

Para todos los tickers (acciones, ETFs y cripto), la IA evalúa cuatro indicadores de fondo para detectar potenciales zonas de acumulación:

- **RSI < 30** — territorio de sobreventa
- **Contracción de volumen > 20%** — agotamiento de venta (promedio de 7 días vs promedio previo de 30 días)
- **Precio por debajo del MA de 200 días** — territorio de valor profundo
- **Death cross presente** — puede ya estar incorporado en el precio (señal contraria cuando el RSI es muy bajo)

Los umbrales difieren por tipo de activo para reducir señales falsas:

- **Cripto (BTC, ETH)**: la señal de fondo se marca cuando hay **2+ indicadores** presentes. Se considera upgrade a STRONG BUY con **3+**.
- **Acciones y ETFs**: la señal de fondo se marca cuando hay **3+ indicadores** presentes (más estricto). Se considera upgrade a STRONG BUY cuando se alinean los **4**.

Las señales de fondo se muestran en el correo diario, las alertas intradía y los mensajes de Telegram. El cambio de volumen se calcula a partir de los datos de chart existentes — **sin llamadas API adicionales**.

---

## Análisis de brechas de asignación

Compara tus tenencias actuales contra tus porcentajes de asignación objetivo. Cada ticker recibe una puntuación según lo alejado que esté de su objetivo, con montos de compra sugeridos en dólares y acciones.

El análisis usa el mayor entre el valor real de tu portafolio o la estimación configurada, de modo que los cálculos de brecha siguen siendo útiles incluso cuando tus tenencias actuales son menores que el tamaño objetivo del portafolio.

---

## Watch List (tickers de investigación)

El array opcional `watching` en `config.json` rastrea tickers que quieres que sean **puntuados y se muestren como señales** sin comprometerlos a una asignación objetivo. Los tickers de watch pasan por el mismo pipeline de fetch + IA que los tickers del portafolio, pero saltan las reglas basadas en asignación:

- Excluidos de las matemáticas de porcentaje de asignación — el total de tu portafolio se mantiene en 100%
- Las reglas de brecha de asignación (gap ≥ 2% para STRONG BUY, gap > 0% requerido) **no aplican**
- No cuentan contra el tope de máximo 2 STRONG BUY — cada watch STRONG BUY que califique se muestra
- `suggestedBuyValue` es siempre 0 — tú decides el tamaño de la posición manualmente
- Renderizados en una sección separada "Watch List" en correo y Telegram (encabezado amarillo, separador discontinuo)

Como no hay una brecha de asignación en la cual anclarse, los STRONG BUYs de watch requieren una confluencia de señales más fuerte: ≥1 señal de nivel de precio + ≥2 señales de momentum + sin señales de riesgo mayores + calificación de valor A/B (para acciones). Usa la watch list para candidatos de investigación que podrías agregar a tu portafolio objetivo más adelante — *"¿es buen momento para iniciar una posición en NVDA?"* — sin contaminar las matemáticas de asignación.

Ver [Configuración → Watch List](configuration#watch-list) para el esquema.

---

## Pares cruzados de cripto (Crypto Cross-Pairs)

El array opcional `watchingCrypto` responde una pregunta que el resto de Richfolio no aborda: no *"¿debería comprar esto con efectivo?"*, sino *"ya tengo la moneda X — ¿es buen momento para cambiar parte de ella por la moneda Y?"*

```json
"watchingCrypto": ["BTC/CRO", "ETH/CRO"]
```

`"BASE/QUOTE"` se lee como **el precio de BASE denominado en QUOTE** — lo que estás comprando dividido por lo que estás gastando. Así que `"BTC/CRO"` significa "cuánto CRO cuesta 1 BTC", que es exactamente el número que quieres **bajo** antes de convertir CRO en BTC.

### Una sola dirección, siempre

Los exchanges listan el lado del mercado que les conviene. En crypto.com, CRO es la **moneda base** de `CRO_BTC` pero la **moneda de cotización** de `ETH_CRO` — leídos tal cual, los dos pares apuntan en direcciones **opuestas**: querrías `CRO_BTC` alto para convertir CRO en BTC, pero `ETH_CRO` bajo para convertir CRO en ETH. Dos polaridades en un mismo resumen es una forma segura de malinterpretarlo, y empeora con cada par que añades.

Richfolio normaliza cada par a "el activo que compras, valorado en la moneda que gastas", de modo que **bajo = barato = buen momento para convertir**, siempre. Qué lado listó el exchange se resuelve a partir de sus propios metadatos de instrumentos, invirtiendo la serie cuando hace falta. Añadir un par es solo configuración — `"SOL/CRO"`, `"BTC/USDT"` y `"ETH/BTC"` funcionan tal cual.

### Qué existe y qué no puede existir

| | |
|---|---|
| Fuente de precios | API pública del exchange crypto.com — sin clave, sin registro |
| Denominado en | la moneda de cotización (p. ej. `1,313,198 CRO`), nunca convertido a tu moneda de reporte |
| Indicadores técnicos | el conjunto completo — SMA50/200, RSI, MACD, Bollinger, ATR, Estocástico, OBV, percentil de 90 días |
| Rango de 52 semanas | derivado de 365 velas diarias (la cripto opera todos los días del calendario, no ~252) |
| P/E, fundamentales, dividendos, resultados, precio objetivo | **no existen** para un par de monedas — se le indica a la IA, que no inventa una calificación de valor |
| Objetivo de asignación / gap | ninguno — solo observación, como la lista `watching` |
| `suggestedBuyValue` | siempre 0 — estás cambiando, no gastando efectivo |
| Publicaciones sociales públicas | nunca, incluso con la publicación social activada |

Como el P/E no puede existir aquí, un par cruzado tiene solo **dos** señales de nivel de precio en vez de tres: posición de 52 semanas < 30% y precio por debajo de la media de 200 días. Al prompt se le indica explícitamente que un P/E ausente **no** es una comprobación fallida.

### Cómo leer la señal

Una recomendación de par cruzado es una señal de **conversión**, así que los verbos significan algo distinto:

| Acción | Significa |
|---|---|
| STRONG BUY / BUY | Ventana favorable para convertir la moneda de cotización en la moneda base |
| HOLD / WAIT | La moneda base está cara en términos de la de cotización — esperar |

Ambas patas son volátiles, así que un precio favorable del par puede venir de una caída de la moneda base **o** de una subida de la de cotización. Se le pide a la IA que diga cuál cuando los datos lo respalden.

### Frecuencia

Los pares cruzados aparecen en la Watch List del resumen diario y además tienen su propio calendario cada 3 horas (8 veces al día) — vale la pena porque la cripto opera 24/7, a diferencia de las comprobaciones intradía de acciones, que en su mayoría se ejecutan con el mercado estadounidense cerrado.

Las velas diarias siguen cerrando una vez al día, así que entre dos ejecuciones separadas por tres horas **los indicadores son idénticos**. Un cambio de acción sin movimiento de precio es ruido de puntuación, no señal, y `cryptoAlerts.minPriceMovePctToAlert` (por defecto 1.0%) lo suprime.

Consulta [Configuración → Pares cruzados de cripto](configuration#pares-cruzados-de-cripto) para el esquema.

---

## Señales dinámicas de P/E

El P/E trailing se compara contra un P/E promedio calculado históricamente derivado de los datos de earnings history de Yahoo Finance. No se necesitan benchmarks manuales — el sistema obtiene los datos trimestrales de EPS y calcula el promedio automáticamente.

Los tickers que cotizan por debajo de su P/E histórico promedio se marcan como **below avg** (potencial valor), mientras que los que están por encima se marcan como **above avg** (potencialmente sobrevaluados). Los ETFs y cripto omiten esta señal naturalmente ya que no tienen datos de earnings.

---

## Detección de overlap en ETFs

Cuando tienes acciones individuales que también son top holdings de ETFs en tu portafolio objetivo, Richfolio detecta el overlap y reduce la prioridad de compra del ETF en consecuencia.

**Ejemplo:** Si tienes 30 acciones de AAPL y VOO contiene ~7% de AAPL, tu exposición directa a AAPL cubre parcialmente la brecha de asignación de VOO. El monto de compra sugerido para VOO se reduce por el valor del overlap.

Esto evita que te sobre-concentres inadvertidamente en acciones que ya tienes a través de ETFs.

---

## Señales del rango de 52 semanas

El precio actual de cada ticker se posiciona dentro de su rango de 52 semanas (0% = en el mínimo, 100% = en el máximo):

- **Cerca del mínimo** (por debajo de 20%) — posible oportunidad de compra
- **Cerca del máximo** (por encima de 80%) — precaución
- **Rango medio** — neutral

El análisis de IA incorpora esto en sus recomendaciones junto con P/E y datos de asignación.

---

## Resumen de noticias con puntuación de sentimiento

Top headlines por ticker desde NewsAPI, obtenidos vía peticiones agrupadas para mantenerse dentro del límite de 100 requests/día del plan gratuito. Los headlines de las últimas 24 horas se emparejan con los tickers usando un mapeo de nombre de empresa.

Gemini puntúa cada headline relevante con:
- **Sentimiento**: alcista, bajista o neutral
- **Impacto**: alto, medio o bajo (qué tanto podría mover el precio de la acción)
- **Sentimiento general**: agregado por ticker (alcista, bajista, neutral o mixto)

Las etiquetas de sentimiento se muestran en el prompt de IA junto a los headlines (por ejemplo, `"Apple beats estimates" [bullish, high impact]`) y alimentan la evaluación general de sentimiento de noticias. Esto reemplaza el filtro binario relevante/irrelevante anterior con una extracción de señales más rica — sin costo API adicional (la misma llamada Gemini, con un esquema de salida más rico).

---

## Persistencia de razonamiento

Richfolio guarda un snapshot de cada recomendación de IA tras cada corrida diaria — acción, confianza, precio y razonamiento — en un archivo de historial rodante de 7 días (`state/reasoning-history.json`). En la siguiente corrida, la IA recibe una sección "HISTORICAL CONTEXT" mostrando cómo evolucionó su propia convicción:

```
AAPL: BUY 72% ($185) → BUY 68% ($187) → HOLD 55% ($192) — weakening
SMH: HOLD 45% ($220) → BUY 70% ($210) → STRONG BUY 85% ($205) — strengthening
```

Esto permite a la IA identificar **momentum de convicción** — si un ticker ha estado fortaleciéndose por 3+ días consecutivos, confirma la tendencia. Si se debilita, la IA se vuelve más cautelosa. Inspirado en el concepto de persistencia cerebro/memoria de [OpenAlice](https://github.com/TraderAlice/OpenAlice), que rastrea el estado cognitivo como commits auditables.

En GitHub Actions, usa `actions/cache` con el directorio `state/` para persistir el historial de razonamiento entre corridas de workflow.

---

## Salud del portafolio

Dos métricas a nivel de portafolio calculadas a partir de tus tenencias actuales:

- **Beta ponderada** — riesgo de mercado a nivel de portafolio, ponderado por tamaño de posición
- **Ingreso anual estimado de dividendos** — dividendos anuales proyectados basados en yields actuales y tamaños de posición

---

## Alertas intradía

No te pierdas el momento de compra del día. Después de que corre el resumen matutino, Richfolio guarda las recomendaciones de IA como una baseline. Las verificaciones intradía (`npm run intraday`) corren cada 2 horas durante el horario de mercado, vuelven a obtener precios y técnicos, re-ejecutan el análisis Gemini (saltando noticias para ahorrar cuota API) y comparan contra la baseline matutina.

Una alerta se dispara solo cuando:

- **La confianza aumenta** al menos 5 puntos porcentuales (configurable) Y está por encima del 80% (configurable)
- **La acción se actualiza** — p. ej., un BUY en la mañana se convierte en STRONG BUY en la tarde
- **Nueva señal** — un ticker que no estaba recomendado por la mañana ahora tiene una señal fuerte de compra

Las alertas se entregan vía correo y Telegram con un formato enfocado que muestra la comparación mañana vs actual, el cambio de precio, el razonamiento de la IA y el precio de orden límite para las señales STRONG BUY. Sin alerta = sin mensaje — solo escuchas de Richfolio cuando importa.

Todos los umbrales son configurables vía la sección `intradayAlerts` en tu variable `CONFIG_JSON`. Consulta [Configuración](configuration) para más detalles.

![Alerta intradía](../screenshots/intraday-alert.png){: style="max-width: 400px; display: block; margin: 16px auto;" }

---

## Reporte semanal de rebalanceo

Un reporte semanal separado (`npm run weekly`) enfocado exclusivamente en el drift del portafolio y las acciones de rebalanceo. Sin noticias, sin IA — solo una tabla limpia que muestra:

- **BUY** — posiciones por debajo (brecha > 1%)
- **TRIM** — posiciones por encima (brecha < -1%)
- **OK** — posiciones dentro del rango objetivo

Incluye advertencias de sobreposición y marca las tenencias que no están en tu portafolio objetivo.

![Rebalanceo semanal](../screenshots/weekly-rebalance.png){: style="max-width: 400px; display: block; margin: 16px auto;" }

---

## Entrega dual

Cada reporte se entrega por dos canales:

- **Correo** — correo HTML con tema oscuro vía Resend con todo el detalle (tabla de asignación, señales P/E, recomendaciones de IA, momentum técnico, órdenes límite, noticias)
- **Telegram** — resumen condensado en texto plano vía Telegram Bot API, optimizado para lectura móvil (incluye técnicos y precios límite para STRONG BUY)

Ambos canales funcionan de forma independiente — si uno no está configurado, el otro sigue entregando.

---

## Publicación en redes sociales (opcional)

Más allá del correo y Telegram, Richfolio puede **opcionalmente** publicar señales de compra en cuentas sociales públicas — **X/Twitter**, una **Página de Facebook**, una cuenta de **Threads** y una **Página de LinkedIn** — en los modos diario e intradía (nunca en semanal ni refresh). Las publicaciones son deliberadamente genéricas: solo señales **STRONG BUY** y **BUY**, cada una mostrando ticker, acción, confianza y una breve razón.

No se divulga nada privado — asignaciones, brechas, tenencias y montos de compra sugeridos **nunca** se publican (un sanitizador además elimina cualquiera de esas cifras del texto de la razón de la IA), y los tickers del portafolio y de la watch list se combinan de forma uniforme como "señales" para que la propiedad nunca se revele. El ticker se renderiza como un `#hashtag` clicable en Facebook / Threads / LinkedIn, más un conjunto configurable de hashtags genéricos, para aumentar el alcance. Cada publicación termina con un descargo de responsabilidad *"Not financial advice"*.

Cada plataforma está condicionada de forma independiente a sus propias credenciales y publica dentro de su propio límite de error, de modo que una falla social nunca afecta los resúmenes de correo/Telegram. Permanece completamente desactivado hasta que agregues credenciales.

Ver [Publicación en redes sociales](social-setup) para la configuración completa (Facebook, LinkedIn, X) y el interruptor de `config.json`.
