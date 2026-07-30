import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./worker.js", import.meta.url), "utf8");
const worker = (await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)).default;

function crearEnv() {
  return {
    DB: {
      prepare(sql) {
        return {
          bind() {
            return this;
          },
          async first() {
            return sql.includes("SELECT 1 AS ok")
              ? { ok: 1 }
              : { current: 0, previous: 0 };
          },
          async all() {
            return { results: [] };
          }
        };
      }
    }
  };
}

async function solicitar(path, options = {}) {
  return worker.fetch(new Request(`https://worker.example${path}`, options), crearEnv());
}

test("health comprueba D1 e informa analytics-v1", async () => {
  const response = await solicitar("/health");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    service: "geocalculo-registro-api",
    database: true,
    analytics_route: true,
    version: "analytics-v1"
  });
});

for (const [period, buckets] of [["day", 24], ["week", 7], ["month", 30]]) {
  test(`analytics entrega contrato estable para ${period}`, async () => {
    const response = await solicitar(`/analytics?period=${period}`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.period, period);
    assert.deepEqual(body.summary, {
      current: 0,
      previous: 0,
      variation: 0,
      final_conversion: 0
    });
    assert.equal(body.trend.length, buckets);
    assert.equal(body.site_distribution.length, 4);
    assert.equal(body.heatmap.length, period === "day" ? 24 : 168);
    assert.equal(body.journey.length, 5);
    assert.equal(body.site_trend.length, buckets);
  });
}

test("analytics normaliza alias y rechaza periodos desconocidos", async () => {
  const aliasResponse = await solicitar("/analytics?period=semana");
  assert.equal((await aliasResponse.json()).period, "week");

  const invalidResponse = await solicitar("/analytics?period=year");
  assert.equal(invalidResponse.status, 400);
  assert.deepEqual(await invalidResponse.json(), {
    ok: false,
    error: "Periodo no válido",
    allowed_periods: ["day", "week", "month"]
  });
});

test("CORS responde preflight y las rutas previas siguen registradas", async () => {
  const preflight = await solicitar("/analytics", {
    method: "OPTIONS",
    headers: { Origin: "https://geocalculo.github.io" }
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "https://geocalculo.github.io");

  const root = await solicitar("/");
  assert.equal(root.status, 200);
  assert.equal((await root.json()).servicio, "geocalculo-registro-api");

  for (const path of ["/dashboard", "/api/dashboard/resumen", "/api/registro", "/api/archivo"]) {
    const method = path === "/api/registro" || path === "/api/archivo" ? "POST" : "GET";
    const response = await solicitar(path, {
      method,
      ...(path === "/api/registro" && {
        headers: { "Content-Type": "application/json" },
        body: "{}"
      })
    });
    assert.notEqual(response.status, 404);
  }
});
