const SITIOS_VALIDOS = new Set([
  "geoipt",
  "geoeva",
  "geonemo",
  "geonoxa"
]);

const TIPOS_VALIDOS = new Set([
  // Eventos actualmente operativos.
  "consulta",
  "descarga_pdf",
  "descarga_kml",

  // Eventos del index.
  "index_load",
  "cross_access",
  "geolocation",
  "search_result",
  "region_change",
  "labels_toggle",
  "basemap_change",
  "geoquery_open"
]);

const TIPOS_ARCHIVO_VALIDOS = new Set([
  "pdf",
  "kml"
]);

const ESTADOS_VALIDOS = new Set([
  "ok",
  "error",
  "success",
  "denied",
  "unavailable",
  "timeout",
  "on",
  "off"
]);

const ORIGENES_EXACTOS = new Set([
  "http://localhost",
  "http://127.0.0.1",

  "https://geocalculo.cl",
  "https://www.geocalculo.cl",

  "https://geoipt.cl",
  "https://www.geoipt.cl",

  "https://geoeva.cl",
  "https://www.geoeva.cl",

  "https://geonemo.cl",
  "https://www.geonemo.cl",

  "https://geonoxa.cl",
  "https://www.geonoxa.cl",

  // GeoDash publicado mediante GitHub Pages.
  "https://geocalculo.github.io"
]);

// Límite preventivo por archivo.
// Los PDF/KML de GeoQuery deberían estar muy por debajo de esto.
const MAX_ARCHIVO_BYTES = 25 * 1024 * 1024;

const PERIODOS_ANALYTICS = new Map([
  ["day", "day"],
  ["today", "day"],
  ["daily", "day"],
  ["week", "week"],
  ["semana", "week"],
  ["month", "month"],
  ["monthly", "month"],
  ["mes", "month"]
]);

const SITIOS_ANALYTICS = [
  "geoipt",
  "geoeva",
  "geonemo",
  "geonoxa"
];


export default {

  async fetch(request, env) {

    const url = new URL(request.url);

    const origin =
      request.headers.get("Origin") || "";

    const origenPermitido =
      esOrigenPermitido(origin);

    const corsHeaders = {

      "Access-Control-Allow-Origin":
        origin && origenPermitido
          ? origin
          : "https://geocalculo.cl",

      "Access-Control-Allow-Methods":
        "GET, POST, OPTIONS",

      "Access-Control-Allow-Headers":
        "Content-Type",

      "Content-Type":
        "application/json; charset=utf-8",

      "Cache-Control":
        "no-store",

      "Vary":
        "Origin"
    };


    // =========================================================
    // CORS
    // =========================================================

    if (request.method === "OPTIONS") {

      return new Response(
        null,
        {
          status: 204,
          headers: corsHeaders
        }
      );
    }


    // Bloquear sitios externos no autorizados.
    if (!origenPermitido) {

      return responder(
        {
          ok: false,
          error: "Origen no autorizado"
        },
        403,
        corsHeaders
      );
    }


    // =========================================================
    // ESTADO DEL SERVICIO
    // =========================================================

    if (
      request.method === "GET" &&
      (
        url.pathname === "/" ||
        url.pathname === "/api/estado"
      )
    ) {

      return responder(
        {
          ok: true,
          servicio:
            "geocalculo-registro-api",

          base_datos:
            "geocalculo-registros",

          almacenamiento_r2:
            "geocalculo-descargas",

          version:
            "archivos-r2-v1"
        },
        200,
        corsHeaders
      );
    }


    // =========================================================
    // DIAGNÓSTICO Y ANALYTICS GEODASH
    // Los cortes temporales se calculan por días calendario UTC,
    // la misma convención utilizada por date('now') en D1.
    // =========================================================

    if (url.pathname === "/health") {

      if (request.method !== "GET") {
        return metodoNoPermitido(corsHeaders);
      }

      return obtenerHealth(env, corsHeaders);
    }


    if (url.pathname === "/analytics") {

      if (request.method !== "GET") {
        return metodoNoPermitido(corsHeaders);
      }

      return obtenerAnalytics(url, env, corsHeaders);
    }


    // =========================================================
    // GEODASH
    // ENDPOINT CONSOLIDADO
    // =========================================================

    if (url.pathname === "/dashboard") {

      if (request.method !== "GET") {

        return responder(
          {
            ok: false,
            error: "Método no permitido"
          },
          405,
          corsHeaders
        );
      }

      return obtenerDashboard(
        url,
        env,
        corsHeaders
      );
    }


    // =========================================================
    // GEODASH
    // RESUMEN OPERACIONAL
    // =========================================================

    if (
      request.method === "GET" &&
      url.pathname ===
        "/api/dashboard/resumen"
    ) {

      return obtenerResumenDashboard(
        env,
        corsHeaders
      );
    }


    // =========================================================
    // REGISTRO GENERAL DE EVENTOS
    // Mantiene exactamente la funcionalidad existente.
    // =========================================================

    if (
      request.method === "POST" &&
      url.pathname === "/api/registro"
    ) {

      return registrarEvento(
        request,
        env,
        corsHeaders
      );
    }


    // =========================================================
    // ALMACENAMIENTO PDF / KML
    // =========================================================

    if (
      request.method === "POST" &&
      url.pathname === "/api/archivo"
    ) {

      return registrarArchivo(
        request,
        env,
        corsHeaders
      );
    }


    // =========================================================
    // RUTA NO ENCONTRADA
    // =========================================================

    return responder(
      {
        ok: false,
        error: "Ruta no encontrada"
      },
      404,
      corsHeaders
    );
  }
};


// =============================================================
// HEALTH
// =============================================================

async function obtenerHealth(env, corsHeaders) {

  let database = false;

  try {
    const comprobacion = await env.DB
      .prepare("SELECT 1 AS ok")
      .first();

    database = Number(comprobacion?.ok) === 1;
  } catch (error) {
    console.error("Error comprobando D1:", error);
  }

  return responder(
    {
      ok: database,
      service: "geocalculo-registro-api",
      database,
      analytics_route: true,
      version: "analytics-v1"
    },
    database ? 200 : 503,
    corsHeaders
  );
}


// =============================================================
// ANALYTICS GEODASH
// =============================================================

async function obtenerAnalytics(url, env, corsHeaders) {

  const periodoSolicitado = String(
    url.searchParams.get("period") || "week"
  ).trim().toLowerCase();

  const period = PERIODOS_ANALYTICS.get(periodoSolicitado);

  if (!period) {
    return responder(
      {
        ok: false,
        error: "Periodo no válido",
        allowed_periods: ["day", "week", "month"]
      },
      400,
      corsHeaders
    );
  }

  const limites = obtenerLimitesPeriodo(period);
  const formatoAgrupacion = period === "day" ? "%Y-%m-%dT%H:00:00.000Z" : "%Y-%m-%d";
  try {
    const [
      consultasResultado,
      tendenciaResultado,
      sitiosResultado,
      heatmapResultado,
      journeyResultado,
      tendenciaSitiosResultado
    ] = await Promise.all([
      env.DB.prepare(`
        SELECT
          SUM(CASE WHEN datetime(fecha_hora) >= datetime(?) THEN 1 ELSE 0 END) AS current,
          SUM(CASE WHEN datetime(fecha_hora) < datetime(?) THEN 1 ELSE 0 END) AS previous
        FROM eventos_geocalculo
        WHERE tipo_evento = 'consulta'
          AND datetime(fecha_hora) >= datetime(?)
          AND datetime(fecha_hora) < datetime(?)
      `).bind(
        limites.actualInicio,
        limites.actualInicio,
        limites.anteriorInicio,
        limites.actualFin
      ).first(),

      env.DB.prepare(`
        SELECT strftime(?, fecha_hora) AS bucket, COUNT(*) AS count
        FROM eventos_geocalculo
        WHERE tipo_evento = 'consulta'
          AND datetime(fecha_hora) >= datetime(?)
          AND datetime(fecha_hora) < datetime(?)
        GROUP BY bucket
        ORDER BY bucket ASC
      `).bind(formatoAgrupacion, limites.actualInicio, limites.actualFin).all(),

      env.DB.prepare(`
        SELECT sitio,
          SUM(CASE WHEN datetime(fecha_hora) >= datetime(?) THEN 1 ELSE 0 END) AS current,
          SUM(CASE WHEN datetime(fecha_hora) < datetime(?) THEN 1 ELSE 0 END) AS previous
        FROM eventos_geocalculo
        WHERE tipo_evento = 'consulta'
          AND datetime(fecha_hora) >= datetime(?)
          AND datetime(fecha_hora) < datetime(?)
          AND sitio IN ('geoipt', 'geoeva', 'geonemo', 'geonoxa')
        GROUP BY sitio
      `).bind(
        limites.actualInicio,
        limites.actualInicio,
        limites.anteriorInicio,
        limites.actualFin
      ).all(),

      env.DB.prepare(`
        SELECT
          CAST(strftime('%w', fecha_hora) AS INTEGER) AS day,
          CAST(strftime('%H', fecha_hora) AS INTEGER) AS hour,
          COUNT(*) AS value
        FROM eventos_geocalculo
        WHERE datetime(fecha_hora) >= datetime(?)
          AND datetime(fecha_hora) < datetime(?)
        GROUP BY day, hour
      `).bind(limites.actualInicio, limites.actualFin).all(),

      env.DB.prepare(`
        SELECT tipo_evento, COUNT(*) AS count
        FROM eventos_geocalculo
        WHERE datetime(fecha_hora) >= datetime(?)
          AND datetime(fecha_hora) < datetime(?)
          AND tipo_evento IN (
            'index_load', 'consulta', 'geoquery_open',
            'descarga_pdf', 'pdf', 'descarga_kml', 'kml'
          )
        GROUP BY tipo_evento
      `).bind(limites.actualInicio, limites.actualFin).all(),

      env.DB.prepare(`
        SELECT strftime(?, fecha_hora) AS bucket, sitio, COUNT(*) AS count
        FROM eventos_geocalculo
        WHERE tipo_evento = 'consulta'
          AND datetime(fecha_hora) >= datetime(?)
          AND datetime(fecha_hora) < datetime(?)
          AND sitio IN ('geoipt', 'geoeva', 'geonemo', 'geonoxa')
        GROUP BY bucket, sitio
        ORDER BY bucket ASC
      `).bind(formatoAgrupacion, limites.actualInicio, limites.actualFin).all()
    ]);

    const current = numeroSeguro(consultasResultado?.current);
    const previous = numeroSeguro(consultasResultado?.previous);
    const trend = construirTrend(
      period,
      limites,
      tendenciaResultado.results || []
    );
    const journey = construirJourney(journeyResultado.results || []);

    return responder(
      {
        ok: true,
        period,
        generated_at: new Date().toISOString(),
        timezone: "UTC",
        heatmap_day_convention: "0 = domingo, 1 = lunes, ..., 6 = sábado",
        summary: {
          current,
          previous,
          variation: calcularPorcentaje(current, previous),
          final_conversion: calcularConversion(
            journey.find(item => item.stage === "kml")?.count || 0,
            journey.find(item => item.stage === "index")?.count || 0
          )
        },
        trend,
        site_distribution: construirDistribucionSitios(
          sitiosResultado.results || [],
          current
        ),
        heatmap: construirHeatmap(
          period,
          heatmapResultado.results || []
        ),
        journey,
        site_trend: construirTendenciaSitios(
          trend,
          tendenciaSitiosResultado.results || []
        )
      },
      200,
      corsHeaders
    );
  } catch (error) {
    console.error("Error obteniendo analytics:", error);

    return responder(
      {
        ok: false,
        error: "No fue posible obtener los datos de analytics"
      },
      500,
      corsHeaders
    );
  }
}


function obtenerLimitesPeriodo(period, ahora = new Date()) {
  const fin = new Date(Date.UTC(
    ahora.getUTCFullYear(),
    ahora.getUTCMonth(),
    ahora.getUTCDate() + 1
  ));
  const dias = period === "day" ? 1 : period === "week" ? 7 : 30;
  const inicio = new Date(fin);
  inicio.setUTCDate(inicio.getUTCDate() - dias);
  const anterior = new Date(inicio);
  anterior.setUTCDate(anterior.getUTCDate() - dias);

  return {
    actualInicio: inicio.toISOString(),
    actualFin: fin.toISOString(),
    anteriorInicio: anterior.toISOString(),
    dias
  };
}


function construirTrend(period, limites, filas) {
  const valores = new Map(
    filas.map(fila => [String(fila.bucket), numeroSeguro(fila.count)])
  );
  const resultado = [];
  const cantidad = period === "day" ? 24 : limites.dias;

  for (let indice = 0; indice < cantidad; indice += 1) {
    const fecha = new Date(limites.actualInicio);
    if (period === "day") {
      fecha.setUTCHours(fecha.getUTCHours() + indice);
    } else {
      fecha.setUTCDate(fecha.getUTCDate() + indice);
    }

    const timestamp = period === "day"
      ? fecha.toISOString().replace(/:\d{2}\.\d{3}Z$/, ":00.000Z")
      : `${fecha.toISOString().slice(0, 10)}T00:00:00.000Z`;
    const bucket = period === "day" ? timestamp : timestamp.slice(0, 10);
    const consultas = valores.get(bucket) || 0;
    const desde = Math.max(0, resultado.length - 6);
    const ventana = resultado.slice(desde).map(item => item.consultas);
    ventana.push(consultas);

    resultado.push({
      label: period === "day" ? `${String(fecha.getUTCHours()).padStart(2, "0")}:00` : etiquetaFecha(fecha),
      timestamp,
      consultas,
      moving_average: redondear(
        ventana.reduce((total, valor) => total + valor, 0) / ventana.length
      )
    });
  }

  return resultado;
}


function construirDistribucionSitios(filas, totalActual) {
  const porSitio = new Map(filas.map(fila => [fila.sitio, fila]));

  return SITIOS_ANALYTICS.map(site => {
    const fila = porSitio.get(site) || {};
    const current = numeroSeguro(fila.current);
    const previous = numeroSeguro(fila.previous);

    return {
      site,
      current,
      previous,
      variation: calcularPorcentaje(current, previous),
      share: totalActual > 0 ? redondear(current / totalActual * 100) : 0
    };
  });
}


function construirHeatmap(period, filas) {
  const valores = new Map(
    filas.map(fila => [`${numeroSeguro(fila.day)}-${numeroSeguro(fila.hour)}`, numeroSeguro(fila.value)])
  );
  const dias = period === "day" ? [new Date().getUTCDay()] : [0, 1, 2, 3, 4, 5, 6];
  const resultado = [];

  for (const day of dias) {
    for (let hour = 0; hour < 24; hour += 1) {
      resultado.push({ day, hour, value: valores.get(`${day}-${hour}`) || 0 });
    }
  }

  return resultado;
}


function construirJourney(filas) {
  const etapas = [
    ["index", ["index_load"]],
    ["consulta", ["consulta"]],
    ["geoquery", ["geoquery_open"]],
    ["pdf", ["descarga_pdf", "pdf"]],
    ["kml", ["descarga_kml", "kml"]]
  ];
  const conteos = new Map(
    filas.map(fila => [fila.tipo_evento, numeroSeguro(fila.count)])
  );
  let anterior = 0;

  return etapas.map(([stage, tipos], indice) => {
    const count = tipos.reduce((total, tipo) => total + (conteos.get(tipo) || 0), 0);
    const conversion = indice === 0 ? (count > 0 ? 100 : 0) : calcularConversion(count, anterior);
    const item = {
      stage,
      count,
      conversion_from_previous: conversion,
      dropoff: anterior > 0 ? redondear(Math.max(0, 100 - conversion)) : 0
    };
    anterior = count;
    return item;
  });
}


function construirTendenciaSitios(trend, filas) {
  const valores = new Map();
  const usaHoras = filas.some(fila => String(fila.bucket).includes("T"));

  for (const fila of filas) {
    const key = `${fila.bucket}|${fila.sitio}`;
    valores.set(key, numeroSeguro(fila.count));
  }

  return trend.map(item => {
    const bucket = usaHoras ? item.timestamp : item.timestamp.slice(0, 10);
    const punto = { label: item.label, timestamp: item.timestamp };
    for (const sitio of SITIOS_ANALYTICS) {
      punto[sitio] = valores.get(`${bucket}|${sitio}`) || 0;
    }
    return punto;
  });
}


function etiquetaFecha(fecha) {
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${fecha.getUTCDate()} ${meses[fecha.getUTCMonth()]}`;
}


function numeroSeguro(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}


function redondear(valor) {
  return Number.isFinite(valor) ? Math.round(valor * 10) / 10 : 0;
}


function calcularPorcentaje(actual, base) {
  if (base <= 0) {
    return 0;
  }
  return redondear((actual - base) / base * 100);
}


function calcularConversion(actual, base) {
  if (base <= 0) {
    return 0;
  }
  return redondear(actual / base * 100);
}


function metodoNoPermitido(corsHeaders) {
  return responder(
    { ok: false, error: "Método no permitido" },
    405,
    corsHeaders
  );
}


// =============================================================
// GEODASH
// DATOS CONSOLIDADOS
// =============================================================

async function obtenerDashboard(
  url,
  env,
  corsHeaders
) {

  const daysParam =
    url.searchParams.get("days");

  const limitParam =
    url.searchParams.get("limit");

  const days =
    daysParam === null
      ? 30
      : Number(daysParam);

  const limit =
    limitParam === null
      ? 20
      : Number(limitParam);


  if (
    !Number.isInteger(days) ||
    ![7, 30].includes(days) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {

    return responder(
      {
        ok: false,
        error:
          "Parámetros no válidos: days debe ser 7 o 30 y limit debe estar entre 1 y 100"
      },
      400,
      corsHeaders
    );
  }


  const inicioPeriodo =
    `-${days - 1} days`;


  try {

    const [
      kpis,
      actividadResultado,
      sitiosResultado,
      origenesResultado,
      eventosResultado
    ] = await Promise.all([

      env.DB
        .prepare(`
          SELECT
            SUM(CASE WHEN tipo_evento = 'consulta' THEN 1 ELSE 0 END) AS consultas_hoy,
            COUNT(DISTINCT CASE
              WHEN session_id IS NOT NULL AND TRIM(session_id) <> ''
              THEN session_id
            END) AS sesiones_hoy,
            SUM(CASE WHEN tipo_evento = 'geoquery_open' THEN 1 ELSE 0 END) AS geoquery_abiertos,
            SUM(CASE WHEN tipo_evento = 'cross_access' THEN 1 ELSE 0 END) AS cross_access
          FROM eventos_geocalculo
          WHERE date(fecha_hora) = date('now')
        `)
        .first(),

      env.DB
        .prepare(`
          SELECT
            date(fecha_hora) AS date,
            COUNT(*) AS count
          FROM eventos_geocalculo
          WHERE date(fecha_hora) BETWEEN date('now', ?) AND date('now')
          GROUP BY date(fecha_hora)
          ORDER BY date ASC
        `)
        .bind(inicioPeriodo)
        .all(),

      env.DB
        .prepare(`
          SELECT
            sitio AS site,
            COUNT(*) AS count
          FROM eventos_geocalculo
          WHERE
            date(fecha_hora) BETWEEN date('now', ?) AND date('now')
            AND sitio IS NOT NULL
            AND TRIM(sitio) <> ''
          GROUP BY sitio
          ORDER BY count DESC, site ASC
        `)
        .bind(inicioPeriodo)
        .all(),

      env.DB
        .prepare(`
          SELECT
            origen AS origin,
            COUNT(*) AS count
          FROM eventos_geocalculo
          WHERE
            date(fecha_hora) BETWEEN date('now', ?) AND date('now')
            AND origen IS NOT NULL
            AND TRIM(origen) <> ''
          GROUP BY origen
          ORDER BY count DESC, origin ASC
        `)
        .bind(inicioPeriodo)
        .all(),

      env.DB
        .prepare(`
          SELECT
            fecha_hora,
            sitio,
            tipo_evento,
            origen,
            latitud,
            longitud
          FROM eventos_geocalculo
          ORDER BY fecha_hora DESC
          LIMIT ?
        `)
        .bind(limit)
        .all()
    ]);


    const actividadPorFecha =
      new Map(
        (actividadResultado.results || [])
          .map(fila => [
            fila.date,
            Number(fila.count || 0)
          ])
      );


    const activity = [];
    const hoy = new Date();


    for (
      let desplazamiento = days - 1;
      desplazamiento >= 0;
      desplazamiento -= 1
    ) {

      const fecha =
        new Date(
          Date.UTC(
            hoy.getUTCFullYear(),
            hoy.getUTCMonth(),
            hoy.getUTCDate() - desplazamiento
          )
        )
          .toISOString()
          .slice(0, 10);


      activity.push({
        date: fecha,
        count:
          actividadPorFecha.get(fecha) || 0
      });
    }


    return responder(
      {
        ok: true,
        updated_at: new Date().toISOString(),
        period_days: days,
        kpis: {
          consultas_hoy:
            Number(kpis?.consultas_hoy ?? 0),
          sesiones_hoy:
            Number(kpis?.sesiones_hoy ?? 0),
          geoquery_abiertos:
            Number(kpis?.geoquery_abiertos ?? 0),
          cross_access:
            Number(kpis?.cross_access ?? 0)
        },
        activity,
        sites:
          (sitiosResultado.results || [])
            .map(fila => ({
              site: fila.site,
              count: Number(fila.count || 0)
            })),
        origins:
          (origenesResultado.results || [])
            .map(fila => ({
              origin: fila.origin,
              count: Number(fila.count || 0)
            })),
        countries: [],
        events:
          eventosResultado.results || []
      },
      200,
      corsHeaders
    );

  } catch (error) {

    console.error(
      "Error obteniendo datos GeoDash:",
      error
    );

    return responder(
      {
        ok: false,
        error:
          "No fue posible obtener los datos del dashboard"
      },
      500,
      corsHeaders
    );
  }
}


// =============================================================
// GEODASH
// RESUMEN OPERACIONAL DEL DÍA
// =============================================================

async function obtenerResumenDashboard(
  env,
  corsHeaders
) {

  try {

    /*
     * Primera versión GeoDash.
     *
     * Todos los valores corresponden
     * al día UTC actual de D1 / SQLite.
     *
     * Más adelante podemos incorporar
     * zona horaria Chile explícitamente
     * para los cortes diarios.
     */

    const resumen = await env.DB
      .prepare(`
        SELECT

          SUM(
            CASE
              WHEN tipo_evento = 'consulta'
              THEN 1
              ELSE 0
            END
          ) AS consultas_hoy,

          COUNT(
            DISTINCT CASE
              WHEN
                session_id IS NOT NULL
                AND TRIM(session_id) <> ''
              THEN session_id
            END
          ) AS sesiones_hoy,

          SUM(
            CASE
              WHEN tipo_evento = 'geoquery_open'
              THEN 1
              ELSE 0
            END
          ) AS geoquery_abiertos,

          SUM(
            CASE
              WHEN tipo_evento = 'cross_access'
              THEN 1
              ELSE 0
            END
          ) AS cross_access

        FROM eventos_geocalculo

        WHERE
          date(fecha_hora) = date('now')
      `)
      .first();


    return responder(
      {
        ok: true,

        consultas_hoy:
          Number(
            resumen?.consultas_hoy ?? 0
          ),

        sesiones_hoy:
          Number(
            resumen?.sesiones_hoy ?? 0
          ),

        geoquery_abiertos:
          Number(
            resumen?.geoquery_abiertos ?? 0
          ),

        cross_access:
          Number(
            resumen?.cross_access ?? 0
          )
      },
      200,
      corsHeaders
    );

  } catch (error) {

    console.error(
      "Error obteniendo resumen GeoDash:",
      error
    );

    return responder(
      {
        ok: false,
        error:
          "No fue posible obtener el resumen"
      },
      500,
      corsHeaders
    );
  }
}


// =============================================================
// REGISTRAR EVENTO
// =============================================================

async function registrarEvento(
  request,
  env,
  corsHeaders
) {

  try {

    const datos =
      await request.json();


    const sitio =
      String(datos.sitio || "")
        .trim()
        .toLowerCase();


    const tipoEvento =
      String(
        datos.tipo_evento ||
        "consulta"
      )
        .trim()
        .toLowerCase();


    const latitud =
      obtenerCoordenada(
        datos.latitud,
        -90,
        90
      );


    const longitud =
      obtenerCoordenada(
        datos.longitud,
        -180,
        180
      );


    if (
      !SITIOS_VALIDOS.has(sitio)
    ) {

      return responder(
        {
          ok: false,
          error: "Sitio no válido"
        },
        400,
        corsHeaders
      );
    }


    if (
      !TIPOS_VALIDOS.has(tipoEvento)
    ) {

      return responder(
        {
          ok: false,
          error:
            "Tipo de evento no válido"
        },
        400,
        corsHeaders
      );
    }


    /*
     * La tabla eventos_geocalculo actualmente
     * requiere latitud y longitud.
     */

    if (
      latitud === null ||
      longitud === null
    ) {

      return responder(
        {
          ok: false,
          error:
            "Coordenadas no válidas"
        },
        400,
        corsHeaders
      );
    }


    const estadoSolicitado =
      String(
        datos.estado || "ok"
      )
        .trim()
        .toLowerCase();


    const estado =
      ESTADOS_VALIDOS.has(
        estadoSolicitado
      )
        ? estadoSolicitado
        : "ok";


    const metadataJson =
      prepararMetadata(
        datos.metadata
      );


    const sessionId =
      limpiarTexto(
        datos.session_id,
        100
      );


    const journeyId =
      limpiarTexto(
        datos.journey_id,
        100
      );


    const resultado =
      await env.DB
        .prepare(`
          INSERT INTO eventos_geocalculo (
            tipo_evento,
            sitio,
            latitud,
            longitud,
            region,
            comuna,
            localidad,
            zoom,
            basemap,
            origen,
            estado,
            metadata_json,
            session_id,
            journey_id
          )
          VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?
          )
        `)
        .bind(

          tipoEvento,
          sitio,
          latitud,
          longitud,

          limpiarTexto(
            datos.region,
            150
          ),

          limpiarTexto(
            datos.comuna,
            150
          ),

          limpiarTexto(
            datos.localidad,
            150
          ),

          numeroONull(
            datos.zoom
          ),

          limpiarTexto(
            datos.basemap,
            20
          ),

          limpiarTexto(
            datos.origen,
            100
          ),

          estado,
          metadataJson,
          sessionId,
          journeyId
        )
        .run();


    if (!resultado.success) {

      throw new Error(
        "D1 no confirmó el registro"
      );
    }


    return responder(
      {
        ok: true,

        mensaje:
          "Evento registrado",

        tipo_evento:
          tipoEvento,

        id:
          resultado.meta
            ?.last_row_id ??
          null
      },
      201,
      corsHeaders
    );

  } catch (error) {

    console.error(
      "Error registrando evento:",
      error
    );


    return responder(
      {
        ok: false,
        error:
          "No fue posible registrar el evento"
      },
      500,
      corsHeaders
    );
  }
}


// =============================================================
// REGISTRAR Y ALMACENAR PDF / KML
// =============================================================

async function registrarArchivo(
  request,
  env,
  corsHeaders
) {

  let r2Key = null;


  try {

    const contentType =
      request.headers.get(
        "Content-Type"
      ) || "";


    if (
      !contentType
        .toLowerCase()
        .includes(
          "multipart/form-data"
        )
    ) {

      return responder(
        {
          ok: false,
          error:
            "La solicitud debe utilizar multipart/form-data"
        },
        400,
        corsHeaders
      );
    }


    const formulario =
      await request.formData();


    // ---------------------------------------------------------
    // CONSULTA ID
    // ---------------------------------------------------------

    const consultaId =
      enteroPositivo(
        formulario.get(
          "consulta_id"
        )
      );


    if (consultaId === null) {

      return responder(
        {
          ok: false,
          error:
            "consulta_id no válido"
        },
        400,
        corsHeaders
      );
    }


    // ---------------------------------------------------------
    // TIPO DE ARCHIVO
    // ---------------------------------------------------------

    const tipoArchivo =
      String(
        formulario.get(
          "tipo_archivo"
        ) || ""
      )
        .trim()
        .toLowerCase();


    if (
      !TIPOS_ARCHIVO_VALIDOS.has(
        tipoArchivo
      )
    ) {

      return responder(
        {
          ok: false,
          error:
            "tipo_archivo debe ser pdf o kml"
        },
        400,
        corsHeaders
      );
    }


    // ---------------------------------------------------------
    // ARCHIVO
    // ---------------------------------------------------------

    const archivo =
      formulario.get(
        "archivo"
      );


    if (
      !archivo ||
      typeof archivo.arrayBuffer !==
        "function" ||
      typeof archivo.size !==
        "number"
    ) {

      return responder(
        {
          ok: false,
          error:
            "No se recibió un archivo válido"
        },
        400,
        corsHeaders
      );
    }


    if (archivo.size <= 0) {

      return responder(
        {
          ok: false,
          error:
            "El archivo está vacío"
        },
        400,
        corsHeaders
      );
    }


    if (
      archivo.size >
      MAX_ARCHIVO_BYTES
    ) {

      return responder(
        {
          ok: false,
          error:
            "El archivo supera el tamaño máximo permitido"
        },
        413,
        corsHeaders
      );
    }


    // ---------------------------------------------------------
    // BUSCAR LA CONSULTA ORIGINAL
    //
    // El archivo queda asociado al registro exacto
    // que originó la GeoQuery.
    // ---------------------------------------------------------

    const consulta =
      await env.DB
        .prepare(`
          SELECT
            id,
            sitio,
            latitud,
            longitud,
            zoom,
            basemap,
            origen,
            session_id,
            journey_id
          FROM eventos_geocalculo
          WHERE
            id = ?
            AND tipo_evento = 'consulta'
          LIMIT 1
        `)
        .bind(
          consultaId
        )
        .first();


    if (!consulta) {

      return responder(
        {
          ok: false,
          error:
            "No existe la consulta asociada"
        },
        404,
        corsHeaders
      );
    }


    const sitio =
      String(
        consulta.sitio || ""
      )
        .trim()
        .toLowerCase();


    if (
      !SITIOS_VALIDOS.has(sitio)
    ) {

      return responder(
        {
          ok: false,
          error:
            "El sitio de la consulta no es válido"
        },
        400,
        corsHeaders
      );
    }


    // ---------------------------------------------------------
    // NOMBRE
    // ---------------------------------------------------------

    const extension =
      tipoArchivo === "pdf"
        ? "pdf"
        : "kml";


    const mimeType =
      tipoArchivo === "pdf"
        ? "application/pdf"
        : "application/vnd.google-earth.kml+xml";


    const nombreSolicitado =
      formulario.get(
        "nombre_archivo"
      );


    const nombreOriginal =
      limpiarTexto(
        nombreSolicitado,
        200
      ) ||
      limpiarTexto(
        archivo.name,
        200
      ) ||
      `${sitio}_consulta_${consultaId}.${extension}`;


    const nombreArchivo =
      normalizarNombreArchivo(
        nombreOriginal,
        extension
      );


    // ---------------------------------------------------------
    // BYTES + SHA-256
    // ---------------------------------------------------------

    const archivoBytes =
      await archivo.arrayBuffer();


    const sha256 =
      await calcularSha256(
        archivoBytes
      );


    // ---------------------------------------------------------
    // R2 KEY ÚNICA
    //
    // Cada clic crea un objeto diferente,
    // incluso si el contenido es idéntico.
    // ---------------------------------------------------------

    const ahora =
      new Date();


    const anio =
      String(
        ahora.getUTCFullYear()
      );


    const mes =
      String(
        ahora.getUTCMonth() + 1
      ).padStart(
        2,
        "0"
      );


    const dia =
      String(
        ahora.getUTCDate()
      ).padStart(
        2,
        "0"
      );


    const sello =
      ahora
        .toISOString()
        .replace(
          /[-:]/g,
          ""
        )
        .replace(
          /\.\d{3}Z$/,
          "Z"
        );


    const uuid =
      crypto.randomUUID();


    r2Key =
      `${sitio}/` +
      `${anio}/${mes}/${dia}/` +
      `${tipoArchivo}/` +
      `${sello}_${uuid}.${extension}`;


    // ---------------------------------------------------------
    // GUARDAR EN R2
    // ---------------------------------------------------------

    const objetoR2 =
      await env.ARCHIVOS.put(
        r2Key,
        archivoBytes,
        {

          httpMetadata: {

            contentType:
              mimeType,

            contentDisposition:
              `attachment; filename="${nombreArchivo}"`
          },


          customMetadata: {

            sitio,

            tipo_archivo:
              tipoArchivo,

            consulta_id:
              String(
                consultaId
              ),

            origen:
              "geoquery",

            sha256
          }
        }
      );


    if (!objetoR2) {

      throw new Error(
        "R2 no confirmó el almacenamiento"
      );
    }


    // ---------------------------------------------------------
    // METADATA COMPLEMENTARIA
    // ---------------------------------------------------------

    const metadataArchivo =
      JSON.stringify({

        r2_etag:
          objetoR2.etag ??
          null,

        r2_version:
          objetoR2.version ??
          null,

        consulta_origen:
          consulta.origen ??
          null
      });


    // ---------------------------------------------------------
    // REGISTRAR EN D1
    // ---------------------------------------------------------

    let resultado;


    try {

      resultado =
        await env.DB
          .prepare(`
            INSERT INTO archivos_geocalculo (
              consulta_id,
              sitio,
              tipo_archivo,
              origen,
              nombre_archivo,
              r2_key,
              mime_type,
              tamano_bytes,
              sha256,
              latitud,
              longitud,
              zoom,
              basemap,
              session_id,
              journey_id,
              estado,
              metadata_json
            )
            VALUES (
              ?, ?, ?, 'geoquery',
              ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?,
              'ok', ?
            )
          `)
          .bind(

            consultaId,
            sitio,
            tipoArchivo,
            nombreArchivo,
            r2Key,
            mimeType,

            objetoR2.size ??
              archivoBytes.byteLength,

            sha256,

            numeroONull(
              consulta.latitud
            ),

            numeroONull(
              consulta.longitud
            ),

            numeroONull(
              consulta.zoom
            ),

            limpiarTexto(
              consulta.basemap,
              20
            ),

            limpiarTexto(
              consulta.session_id,
              100
            ),

            limpiarTexto(
              consulta.journey_id,
              100
            ),

            metadataArchivo
          )
          .run();

    } catch (errorD1) {

      /*
       * Si R2 funcionó pero D1 falló,
       * intentamos eliminar el objeto para
       * no dejar archivos huérfanos.
       */

      try {

        await env.ARCHIVOS.delete(
          r2Key
        );

      } catch (
        errorRollback
      ) {

        console.error(
          "No fue posible revertir R2:",
          errorRollback
        );
      }


      throw errorD1;
    }


    if (!resultado.success) {

      try {

        await env.ARCHIVOS.delete(
          r2Key
        );

      } catch (
        errorRollback
      ) {

        console.error(
          "No fue posible revertir R2:",
          errorRollback
        );
      }


      throw new Error(
        "D1 no confirmó el registro del archivo"
      );
    }


    // ---------------------------------------------------------
    // RESPUESTA
    // ---------------------------------------------------------

    return responder(
      {
        ok: true,

        mensaje:
          "Archivo almacenado y registrado",

        id:
          resultado.meta
            ?.last_row_id ??
          null,

        consulta_id:
          consultaId,

        sitio,

        tipo_archivo:
          tipoArchivo,

        origen:
          "geoquery",

        nombre_archivo:
          nombreArchivo,

        r2_key:
          r2Key,

        tamano_bytes:
          objetoR2.size ??
          archivoBytes.byteLength,

        sha256
      },
      201,
      corsHeaders
    );

  } catch (error) {

    console.error(
      "Error almacenando archivo:",
      error
    );


    return responder(
      {
        ok: false,
        error:
          "No fue posible almacenar el archivo"
      },
      500,
      corsHeaders
    );
  }
}


// =============================================================
// ORÍGENES PERMITIDOS
// =============================================================

function esOrigenPermitido(
  origin
) {

  // Permite llamadas directas sin Origin,
  // por ejemplo pruebas manuales.
  if (!origin) {
    return true;
  }


  if (
    ORIGENES_EXACTOS.has(
      origin
    )
  ) {
    return true;
  }


  if (
    origin.endsWith(
      ".geocalculo.cl"
    )
  ) {
    return true;
  }


  /*
   * Se mantiene por compatibilidad con
   * las versiones actuales de desarrollo.
   *
   * Más adelante conviene reemplazar esto
   * por dominios Pages exactos.
   */

  if (
    origin.endsWith(
      ".pages.dev"
    )
  ) {
    return true;
  }


  return false;
}


// =============================================================
// UTILIDADES
// =============================================================

function limpiarTexto(
  valor,
  maximo
) {

  if (
    valor === undefined ||
    valor === null
  ) {
    return null;
  }


  const texto =
    String(
      valor
    ).trim();


  return texto
    ? texto.slice(
        0,
        maximo
      )
    : null;
}


function numeroONull(
  valor
) {

  if (
    valor === undefined ||
    valor === null ||
    valor === ""
  ) {
    return null;
  }


  const numero =
    Number(
      valor
    );


  return Number.isFinite(
    numero
  )
    ? numero
    : null;
}


function enteroPositivo(
  valor
) {

  if (
    valor === undefined ||
    valor === null ||
    valor === ""
  ) {
    return null;
  }


  const numero =
    Number(
      valor
    );


  if (
    !Number.isInteger(
      numero
    ) ||
    numero <= 0
  ) {
    return null;
  }


  return numero;
}


function obtenerCoordenada(
  valor,
  minimo,
  maximo
) {

  if (
    valor === undefined ||
    valor === null ||
    valor === ""
  ) {
    return null;
  }


  const numero =
    Number(
      valor
    );


  if (
    !Number.isFinite(
      numero
    ) ||
    numero < minimo ||
    numero > maximo
  ) {
    return null;
  }


  return numero;
}


function prepararMetadata(
  metadata
) {

  if (
    !metadata ||
    typeof metadata !==
      "object"
  ) {
    return null;
  }


  return JSON.stringify(
    metadata
  ).slice(
    0,
    10000
  );
}


function normalizarNombreArchivo(
  nombre,
  extension
) {

  let limpio =
    String(
      nombre || ""
    )
      .trim()
      .replace(
        /[\/\\:*?"<>|]/g,
        "_"
      )
      .replace(
        /[\r\n]/g,
        " "
      )
      .slice(
        0,
        180
      );


  if (!limpio) {

    limpio =
      `archivo.${extension}`;
  }


  const expresionExtension =
    new RegExp(
      `\\.${extension}$`,
      "i"
    );


  if (
    !expresionExtension.test(
      limpio
    )
  ) {

    limpio =
      limpio.replace(
        /\.[a-z0-9]+$/i,
        ""
      );


    limpio +=
      `.${extension}`;
  }


  return limpio;
}


async function calcularSha256(
  arrayBuffer
) {

  const hashBuffer =
    await crypto.subtle.digest(
      "SHA-256",
      arrayBuffer
    );


  return Array
    .from(
      new Uint8Array(
        hashBuffer
      )
    )
    .map(
      byte =>
        byte
          .toString(
            16
          )
          .padStart(
            2,
            "0"
          )
    )
    .join("");
}


function responder(
  contenido,
  estado,
  headers
) {

  return new Response(
    JSON.stringify(
      contenido
    ),
    {
      status:
        estado,

      headers
    }
  );
}
