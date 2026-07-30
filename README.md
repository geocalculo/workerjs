# workerjs

Aprendizaje de Cloudflare Workers con GPT-Codex.

## Diagnóstico de GeoDash

El `404` de `GET /analytics?period=week` se producía porque el Worker sólo
registraba el endpoint consolidado `/dashboard`; no existía una condición de
enrutamiento para `/analytics`, por lo que la petición alcanzaba la respuesta
final `Ruta no encontrada`.

Los cortes de analytics usan días calendario **UTC**. `day` representa hoy,
`week` los últimos siete días (incluido hoy) y `month` los últimos treinta
días (incluido hoy); cada intervalo se compara con el intervalo inmediatamente
anterior de igual duración. En el heatmap, `day` usa la convención de SQLite:
`0 = domingo` hasta `6 = sábado`.

## Rutas

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/` y `/api/estado` | Estado general del servicio |
| `GET` | `/health` | Comprobación liviana de D1 y disponibilidad de analytics |
| `GET` | `/analytics?period=day\|week\|month` | Cinco paneles de GeoDash |
| `GET` | `/dashboard?days=7\|30&limit=20` | Endpoint consolidado anterior de GeoDash |
| `GET` | `/api/dashboard/resumen` | KPIs diarios anteriores |
| `POST` | `/api/registro` | Registro de eventos |
| `POST` | `/api/archivo` | Almacenamiento de PDF o KML en R2 y registro en D1 |

`/analytics` también acepta `today`, `daily`, `semana`, `monthly` y `mes`.
Si se omite `period`, se usa `week`.

## Desarrollo local

Ejecuta el Worker localmente con:

```sh
npx wrangler dev
```

## Despliegue

Despliega el Worker en Cloudflare con:

```sh
npx wrangler deploy
```

## Pruebas rápidas

```sh
node --test worker.test.mjs
curl http://localhost:8787/health
curl 'http://localhost:8787/analytics?period=day'
curl 'http://localhost:8787/analytics?period=week'
curl 'http://localhost:8787/analytics?period=month'
```
