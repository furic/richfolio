---
title: Cómo funciona
layout: default
nav_order: 7
lang: es
permalink: /how-it-works.html
---

# Cómo funciona

Richfolio es un sistema de pipeline único — sin servidor API, sin base de datos, sin dashboard. Corre una vez, produce un reporte y termina.

---

## Pipeline de datos

```
Variable CONFIG_JSON + GitHub Secrets
  → fetchPrices (Yahoo Finance: precios, P/E, rango 52w, beta, dividendos, holdings de ETFs, fundamentales, calendario de earnings)
  → fetchTechnicals (Yahoo Finance chart: SMA50, SMA200, RSI, MACD, Bandas de Bollinger, ATR, Stochastic, OBV, momentum)
  → fetchNews (NewsAPI: top headlines por ticker + puntuación de sentimiento de Gemini)
  → analyze (brechas de asignación, señales P/E, descuentos por overlap, métricas de portafolio)
  → aiAnalyze (Gemini Think/Plan en dos etapas: Etapa 1 Observar → Etapa 2 Decidir + historial de razonamiento)
  → guards (validación post-IA: guardia de earnings, criterios STRONG BUY, tope de bonos, cordura de confianza/valor)
  → email + telegram (entrega del resumen diario con calificaciones de valor, señales de fondo, técnicos, insignias de earnings)
```

El modo semanal (`--weekly`) salta noticias, técnicos e IA, produciendo un reporte de rebalanceo enfocado.

El modo intradía (`--intraday`) vuelve a obtener precios y técnicos, re-ejecuta la IA (saltando noticias), compara contra la baseline matutina y alerta solo cuando las señales se fortalecen.

El modo cripto (`--crypto`) omite por completo el pipeline del portafolio. Obtiene los pares cruzados de `watchingCrypto` desde crypto.com, les aplica los mismos indicadores, etapas de IA y guards, y compara contra el ancla del día en lugar de una baseline matutina.

---

## Arquitectura

```
src/
├── config.ts          # Loader tipado para la variable CONFIG_JSON + GitHub Secrets
├── index.ts           # Entry point — parsea flags --weekly/--intraday, conecta módulos
├── fetchPrices.ts     # Yahoo Finance vía yahoo-finance2 (API v3 basada en instancias) + fundamentales + calendario de earnings
├── fetchTechnicals.ts # Yahoo Finance chart: SMA50, SMA200, RSI, MACD, Bandas de Bollinger, ATR, Stochastic, OBV
├── fetchNews.ts       # NewsAPI con mapeo ticker-a-nombre-de-empresa + puntuación de sentimiento de Gemini
├── analyze.ts         # Análisis central: brechas, señales P/E, overlap, métricas de portafolio
├── aiAnalysis.ts      # Constructor de prompts Gemini Think/Plan en dos etapas + parser de respuesta JSON + lógica de reintentos
├── guards.ts          # Pipeline de validación post-IA: 6 verificaciones secuenciales de seguridad
├── detailedAnalysis.ts# Gemini 2.5 Flash: tesis de compra detallada + análisis de riesgo para tickers STRONG BUY
├── analysisUrl.ts     # Comprime los datos de análisis en un hash URL para la página de análisis de GitHub Pages
├── state.ts           # Guardar/cargar baseline matutina para comparación intradía + historial de razonamiento de 7 días
├── intradayCompare.ts # Compara las recomendaciones de IA actuales vs la baseline matutina
├── email.ts           # Plantilla HTML de correo diario + entrega Resend
├── intradayEmail.ts   # Plantilla de correo de alerta intradía + entrega Resend
├── weeklyEmail.ts     # Plantilla de correo de rebalanceo semanal + entrega Resend
└── telegram.ts        # Entrega Telegram Bot API (formatters diario + intradía + semanal)
```

Cada módulo es independiente — se comunican a través de interfaces tipadas (`QuoteData`, `TechnicalData`, `AllocationItem`, `AllocationReport`, `AIBuyRecommendation`, `IntradayAlert`, `TickerObservation`). `QuoteData` incluye datos fundamentales (ROE, deuda/patrimonio, FCF, márgenes, crecimiento) del módulo `financialData` de Yahoo, más datos de calendario de earnings (próxima fecha de earnings, días al earnings). `TechnicalData` incluye MACD (cruce + histograma), Bandas de Bollinger (%B, bandwidth, squeeze), ATR (volatilidad), Stochastic (%K/%D), tendencia OBV (acumulación/distribución) y cambio de volumen (7d vs 30d) para la detección de bottom-fishing. `TickerObservation` es la salida intermedia de la etapa Think, conteniendo señales estructuradas, banderas de riesgo y resúmenes.

---

## Lógica de análisis

### Brechas de asignación

Para cada ticker en tu portafolio objetivo:

1. **Valor actual** = acciones poseídas × precio actual
2. **% actual** = valor actual / valor del portafolio × 100
3. **Brecha %** = % objetivo − % actual
4. **Compra sugerida** = brecha % × valor del portafolio (solo cuando está por debajo)

El valor del portafolio usa el mayor entre el valor real de tenencias o el `totalPortfolioValue` configurado.

El sistema soporta portafolios denominados en cualquiera de las siguientes monedas: USD, GBP, EUR, AUD, CAD, JPY, CHF, HKD, SGD, NZD. Establece `defaultCurrency` en tu configuración a tu moneda de visualización preferida. Los tickers cotizados en otras monedas (p. ej. acciones de LSE en GBp) se auto-detectan, se corrigen las unidades (peniques LSE ÷ 100) y se convierten vía FX usando Yahoo Finance para su visualización.

### Señales dinámicas de P/E

Yahoo Finance provee datos trimestrales de EPS vía `earningsHistory`. Richfolio calcula:

1. Filtrar valores positivos trimestrales de EPS (se necesitan al menos 2 trimestres)
2. Promediar EPS trimestrales → anualizar (× 4)
3. **P/E promedio** = precio actual / EPS anualizado
4. Comparar P/E trailing contra este promedio:
   - **Por debajo del promedio** → potencial oportunidad de valor
   - **Por encima del promedio** → potencialmente sobrevaluado

ETFs y cripto saltan esta señal (sin datos de earnings).

### Detección de overlap en ETFs

Para cada ETF objetivo, Yahoo Finance devuelve sus top ~10 holdings con porcentajes de peso. Richfolio verifica si tienes alguna de esas acciones directamente:

1. Para cada holding del ETF que coincide con una acción en `currentHoldings`:
   - **Exposición del ETF** = peso del holding × valor de compra sugerido del ETF
   - **Tu exposición** = acciones poseídas × precio de la acción
   - **Overlap** = min(Exposición del ETF, Tu exposición)
2. Suma todos los overlaps del ETF
3. Reduce el valor de compra sugerido del ETF por el overlap total

**Ejemplo:** VOO contiene ~7% de AAPL. Si tienes $8,000 en AAPL y la compra sugerida de VOO es $10,000, el overlap de AAPL es min(7% × $10,000, $8,000) = $700. La sugerencia de compra de VOO baja a $9,300.

### Puntuación del rango de 52 semanas

El precio de cada ticker se posiciona dentro de su rango de 52 semanas:

- **0-20%** → cerca del mínimo de 52 semanas (señal de oportunidad de compra)
- **20-80%** → rango medio (neutral)
- **80-100%** → cerca del máximo de 52 semanas (señal de precaución)

### Indicadores técnicos

Richfolio obtiene ~250 días de datos OHLCV diarios vía `yahooFinance.chart()` y calcula:

1. **SMA50** — promedio móvil simple de los últimos 50 precios de cierre
2. **SMA200** — promedio móvil simple de los últimos 200 precios de cierre (null si < 200 puntos de datos)
3. **RSI(14)** — Índice de Fuerza Relativa estándar usando ganancia/pérdida promedio de 14 días
4. **MACD** — EMA(12) − EMA(26), con línea de señal = EMA(9) de la línea MACD. Reporta el histograma (MACD − señal, positivo = momentum alcista) y detecta cruces alcistas/bajistas de los últimos 2 días de trading. Requiere 35+ puntos de datos. Mejor para confirmar dirección de tendencia
5. **Bandas de Bollinger** — SMA(20) ± 2 desviaciones estándar. Reporta %B (0 = banda inferior, 1 = banda superior), bandwidth (medida de volatilidad) y detección de squeeze (bandwidth en el 20% inferior del rango de 120 días, señalizando una ruptura inminente). Requiere 20+ puntos de datos. Mejor para mercados en rango
6. **Señal de momentum**:
   - **Alcista** — precio > SMA50, SMA50 > SMA200, RSI > 40
   - **Bajista** — precio < SMA50, SMA50 < SMA200, RSI < 60
   - **Neutral** — señales mixtas
7. **ATR(14)** — Average True Range con suavizado de Wilder. Reporta valor absoluto y % del precio. ATR% > 3% = alta volatilidad (amplía órdenes límite), ATR% < 1% = baja volatilidad (límites más ajustados). Requiere 15+ puntos de datos
8. **Oscilador estocástico** — %K(14) con suavizado SMA %D(3). %K < 20 = confirmación de sobreventa (añadido a las señales de momentum para los criterios STRONG BUY), %K > 80 = sobrecompra. Requiere 16+ puntos de datos
9. **Tendencia OBV** — On-Balance Volume con pendiente de regresión lineal de 10 días normalizada por volumen promedio. Reporta dirección: subiendo (acumulación), bajando (distribución) o plano. El OBV absoluto no significa nada entre tickers. Requiere 11+ puntos de datos
10. **Golden/Death cross** — SMA50 cruzando por encima (golden) o por debajo (death) de SMA200
11. **Mínimos recientes** — precio mínimo en los últimos 7 y 30 días de trading (niveles de soporte)
12. **Cambio de volumen** — volumen promedio de 7 días vs promedio previo de 30 días (usado por el modelo de bottom-fishing para detectar agotamiento de venta)

Los tickers con menos de 50 puntos de datos se saltan elegantemente. Todos los indicadores se calculan a partir de datos de chart existentes — cero llamadas API extras.

### Puntuación con IA (Think/Plan en dos etapas)

Richfolio usa un marco de IA en dos etapas inspirado en la arquitectura cognitiva de [OpenAlice](https://github.com/TraderAlice/OpenAlice):

**Etapa 1 — Observar (Think):** El prompt de Gemini recibe todos los datos por ticker — precio, ratios P/E, posición en rango de 52 semanas, brecha de asignación, dividend yield, beta, overlap de ETF, indicadores técnicos (MAs, RSI, MACD, Bandas de Bollinger, ATR, Stochastic, OBV, momentum, cambio de volumen), datos fundamentales (ROE, deuda/patrimonio, FCF, márgenes, crecimiento, targets de analistas), calendario de earnings, entorno macro, y headlines recientes con puntuaciones de sentimiento. La IA extrae observaciones estructuradas: qué señales de nivel de precio están presentes, qué señales de momentum están activas, banderas de riesgo, resúmenes y sentimiento de noticias. En esta etapa no hay recomendaciones de acción.

**Etapa 2 — Decidir (Plan):** Una llamada separada a Gemini recibe las observaciones estructuradas de la Etapa 1, las reglas de decisión, los montos de brecha, el contexto macro y el historial de razonamiento de 7 días. Como trabaja con observaciones pre-procesadas (no números crudos), aplica los criterios STRONG BUY de manera más consistente. La IA devuelve:

- **Acción**: STRONG BUY, BUY, HOLD o WAIT
- **Confianza**: 0-100%
- **Razón**: explicación de 1-2 frases
- **Monto sugerido**: USD a invertir
- **Precio de orden límite**: precio sugerido por debajo del mercado basado en el soporte más cercano (MAs, mínimos recientes, números redondos)
- **Razón del precio límite**: 1 frase explicando el nivel de soporte
- **Calificación de valor**: A/B/C/D para acciones individuales (vacío para ETFs y cripto)
- **Señal de fondo**: descripción de zona de sobreventa/acumulación (vacío si no hay indicadores presentes)

#### Marco de inversión en valor (solo acciones)

La IA califica cada acción individual A-D basándose en cinco criterios fundamentales: ROE > 15%, deuda/patrimonio < 50%, FCF/CF operativo > 80%, crecimiento positivo de earnings y precio por debajo del target del analista. La calificación ajusta la puntuación de confianza de la IA (A suma ~10 puntos, D resta ~10 puntos). Los datos fundamentales vienen del módulo `financialData` de Yahoo — añadido a la llamada existente de `quoteSummary` con cero sobrecarga API extra.

#### Modelo de bottom-fishing (todos los tickers)

La IA evalúa cuatro indicadores de fondo para cada ticker (acciones, ETFs y cripto): RSI < 30, contracción de volumen > 20%, precio por debajo del MA de 200 días y death cross. Cripto dispara una señal de fondo con 2+ indicadores; acciones y ETFs requieren 3+ (umbral más estricto para evitar señales falsas por caídas únicas). El cambio de volumen se calcula a partir de datos de chart existentes — sin llamadas API adicionales.

Los indicadores técnicos refinan aún más la confianza de la IA — una señal de momentum alcista con RSI sobrevendido fortalece un caso de compra, mientras que señales bajistas o RSI sobrecomprado lo debilitan. La IA sigue una **jerarquía explícita de resolución de conflictos de indicadores**: se confía en MACD en mercados con tendencia, en Bandas de Bollinger en mercados de rango. Cuando ambos coinciden (p. ej., cruce alcista de MACD + rebote en la banda inferior de Bollinger), la confianza sube 5-10 puntos. Un squeeze de Bollinger con un cruce simultáneo de MACD se trata como la señal de entrada más fuerte (boost de confianza de 10-15 puntos). Cuando discrepan (p. ej., MACD alcista pero %B cerca de la banda superior), la confianza se reduce para evitar entradas sobreextendidas.

Después de que la IA devuelve recomendaciones, el **pipeline de validación de guardias** (`guards.ts`) ejecuta 6 verificaciones secuenciales: tope de bond ETF, proximidad de earnings, aplicación de criterios STRONG BUY, máximo 2 STRONG BUY, cordura de confianza y cordura del monto de compra. Las guardias capturan casos donde la IA ignora las instrucciones del prompt y sirven como red programática de seguridad.

Si Gemini no está disponible, el sistema cae a un ranking basado en brechas (mayor brecha de asignación primero). Los errores transitorios de Gemini (503/429) se reintentan automáticamente hasta 2 veces con backoff de 5s/10s antes de caer al fallback.

### Página de análisis detallado (solo STRONG BUY)

Para cada ticker **STRONG BUY**, una llamada separada a Gemini 2.5 Flash genera una tesis de compra en profundidad (3-4 párrafos) y 3-4 factores de riesgo específicos. Este análisis detallado, junto con todas las métricas y datos técnicos, se comprime usando zlib y se codifica como un fragmento hash URL base64url.

Los mensajes de correo y Telegram incluyen un enlace **"More Details"** apuntando a una página de análisis estática alojada en GitHub Pages (`docs/analysis/index.html`). La página decodifica el hash URL del lado del cliente usando pako y renderiza:

- **Gráfico interactivo de TradingView** — candlestick de 6 meses con overlays de SMA50, SMA200 y RSI
- **Grid de métricas clave** — precio, P/E, posición en 52 semanas, RSI, medias móviles, momentum
- **Tesis de compra** — análisis detallado de múltiples párrafos de Gemini Flash
- **Análisis de riesgo** — factores de riesgo específicos a vigilar
- **Fundamentales** — ROE, deuda/patrimonio, márgenes, crecimiento, target del analista (solo acciones)
- **Señales** — golden/death cross, señales de fondo (cripto)
- **Resumen de acción** — monto sugerido de inversión, precio de orden límite con razonamiento
- **Barra del rango de 52 semanas** — posición visual dentro del rango anual

No se necesita lógica del lado del servidor — todos los datos están embebidos en la URL. La página funciona offline una vez cargada. La URL típicamente tiene ~1,000-1,500 caracteres, bien dentro de los límites de clientes de correo.

![Análisis STRONG BUY](../screenshots/strong-buy-analysis.png){: style="max-width: 500px; display: block; margin: 16px auto;" }

---

## Cuatro modos

| | Diario | Intradía | Semanal | Cripto |
|---|---|---|---|---|
| Precios y fundamentales | Sí | Sí | Sí | Solo crypto.com |
| Indicadores técnicos | Sí | Sí | No | Sí |
| Headlines de noticias | Sí | No | No | No |
| Recomendaciones de IA | Sí | Sí | No | Sí |
| Precios de orden límite | Sí | Sí | No | Sí (en la moneda de cotización) |
| Calificaciones de valor (acciones) | Sí | Sí | No | N/A — sin fundamentales |
| Señales de fondo (cripto) | Sí | Sí | No | Sí |
| Análisis de asignación | Sí | Sí | Sí | N/A — solo observación |
| Comparación de baseline | Guarda baseline | Compara vs mañana | No | Compara vs ancla del día |
| Plantilla de correo | Resumen completo | Alerta (solo disparada) | Tabla de rebalanceo | Alerta (solo disparada) |
| Formato Telegram | Recs IA + noticias | Alerta (solo disparada) | Acciones BUY/TRIM | Alerta (solo disparada) |
| Calendario | 1×/día | 4×/día entre semana | Domingos | 8×/día (workflow propio) |

Un quinto modo, refresh (`--refresh TICKER`), reanaliza un único ticker bajo demanda con el precio más reciente.

![Resumen diario](../screenshots/morning-debrief.png){: style="max-width: 260px; display: inline-block;" }
![Alerta intradía](../screenshots/intraday-alert.png){: style="max-width: 260px; display: inline-block;" }
![Rebalanceo semanal](../screenshots/weekly-rebalance.png){: style="max-width: 260px; display: inline-block;" }
