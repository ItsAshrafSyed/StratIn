import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  createStrategySchema,
  hashStrategyAllocation,
  parseFeeConfig,
  publishRebalanceSchema,
  recordInvestmentSchema,
  recordRebalanceSchema,
  SUPPORTED_TOKENIZED_EQUITIES
} from "@stratin/shared";
import { getDb, type Env } from "./db";
import { navIntervalStart, processNavCron } from "./nav-cron";
import { JupiterPriceProvider } from "./pricing";
import {
  createStrategy,
  getInvestment,
  listActiveStrategyIds,
  getStrategy,
  listInvestorInvestments,
  listStrategistStrategies,
  listStrategies,
  listStrategyVersions,
  publishRebalance,
  recordInvestment,
  recordRebalance,
  refreshStrategyNav
} from "./repository";

const app = new Hono<{ Bindings: Env }>();

function getPriceProvider(env: Env) {
  return new JupiterPriceProvider(env.JUPITER_SWAP_API_BASE_URL);
}

app.use(
  "*",
  cors({
    origin: ["http://localhost:3000", "http://localhost:3001"],
    allowHeaders: ["Content-Type"],
    allowMethods: ["GET", "POST", "OPTIONS"]
  })
);

app.onError((error, c) => {
  console.error(JSON.stringify({ message: error.message, stack: error.stack }));
  return c.json({ error: error.message }, 500);
});

app.get("/health", (c) => {
  return c.json({
    ok: true,
    service: "stratin-api",
    scope: "stage-1-scaffold"
  });
});

app.get("/assets", (c) => {
  return c.json({
    assets: SUPPORTED_TOKENIZED_EQUITIES
  });
});

app.get("/config/fees", (c) => {
  const config = parseFeeConfig(c.env);
  return c.json({ config });
});

app.post("/strategies", async (c) => {
  const body = createStrategySchema.parse(await c.req.json());
  const strategy = await createStrategy(getDb(c.env), body, getPriceProvider(c.env));
  return c.json({ strategy }, 201);
});

app.get("/strategies", async (c) => {
  const strategies = await listStrategies(getDb(c.env));
  return c.json({ strategies });
});

app.get("/strategies/:id", async (c) => {
  const strategy = await getStrategy(getDb(c.env), c.req.param("id"));

  if (!strategy) {
    return c.json({ error: "Strategy not found." }, 404);
  }

  return c.json({ strategy });
});

app.post("/strategies/:id/nav/refresh", async (c) => {
  const snapshot = await refreshStrategyNav(getDb(c.env), c.req.param("id"), getPriceProvider(c.env));
  return c.json({ snapshot });
});

app.get("/strategies/:id/versions", async (c) => {
  const versions = await listStrategyVersions(getDb(c.env), c.req.param("id"));
  return c.json({ versions });
});

app.get("/strategies/:id/registry/verify", async (c) => {
  const strategy = await getStrategy(getDb(c.env), c.req.param("id"));

  if (!strategy) {
    return c.json({ error: "Strategy not found." }, 404);
  }

  const rpcUrl = c.env.REGISTRY_SOLANA_RPC_URL ?? c.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
  const results = [];
  for (const version of strategy.versions ?? []) {
    const canonicalHash = await hashStrategyAllocation(version.allocations);
    const onChainHash = version.registryVersionPda
      ? await fetchRegistryVersionHash(rpcUrl, version.registryVersionPda)
      : null;

    results.push({
      version: version.version,
      canonicalHash,
      dbHash: version.allocationHash,
      onChainHash,
      status:
        version.registryVersionPda && onChainHash && canonicalHash === version.allocationHash && canonicalHash === onChainHash
          ? "MATCH"
          : "MISMATCH"
    });
  }

  return c.json({ strategyId: strategy.id, registryStrategyPda: strategy.registryStrategyPda, results });
});

app.post("/strategies/:id/rebalances", async (c) => {
  const body = publishRebalanceSchema.parse(await c.req.json());
  const strategy = await publishRebalance(getDb(c.env), c.req.param("id"), body, getPriceProvider(c.env));
  return c.json({ strategy }, 201);
});

app.get("/strategists/:wallet/strategies", async (c) => {
  const strategies = await listStrategistStrategies(getDb(c.env), c.req.param("wallet"));
  return c.json({ strategies });
});

app.post("/strategies/:id/investments", async (c) => {
  const body = recordInvestmentSchema.parse(await c.req.json());
  const investment = await recordInvestment(getDb(c.env), c.req.param("id"), body);
  return c.json({ investment }, 201);
});

app.get("/investors/:wallet/investments", async (c) => {
  const investments = await listInvestorInvestments(getDb(c.env), c.req.param("wallet"));
  return c.json({ investments });
});

app.get("/investments/:id", async (c) => {
  const investment = await getInvestment(getDb(c.env), c.req.param("id"));

  if (!investment) {
    return c.json({ error: "Investment not found." }, 404);
  }

  return c.json({ investment });
});

app.post("/investments/:id/rebalances", async (c) => {
  const body = recordRebalanceSchema.parse(await c.req.json());
  const investment = await recordRebalance(getDb(c.env), c.req.param("id"), body);
  return c.json({ investment }, 201);
});

async function refreshActiveStrategiesNav(env: Env, scheduledAt = new Date()) {
  const db = getDb(env);
  const priceProvider = getPriceProvider(env);
  const intervalStart = navIntervalStart(scheduledAt);
  const strategyIds = await listActiveStrategyIds(db);
  const results = await processNavCron(strategyIds, (strategyId) =>
    refreshStrategyNav(db, strategyId, priceProvider, intervalStart).then(() => undefined)
  );

  console.log(
    JSON.stringify({
      event: "nav_cron_complete",
      activeStrategies: strategyIds.length,
      succeeded: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok).length,
      intervalStart: intervalStart.toISOString()
    })
  );

  return results;
}

async function fetchRegistryVersionHash(rpcUrl: string, versionPda: string) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "getAccountInfo",
      params: [versionPda, { encoding: "base64", commitment: "confirmed" }]
    })
  });
  const payload = (await response.json()) as {
    result?: { value?: { data?: [string, string] } | null };
    error?: { message?: string };
  };

  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message ?? `Registry verification RPC failed with status ${response.status}.`);
  }

  const encoded = payload.result?.value?.data?.[0];
  if (!encoded) {
    return null;
  }

  const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  const hashOffset = 8 + 32 + 32 + 4;
  const hash = bytes.slice(hashOffset, hashOffset + 32);
  return [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export { app, navIntervalStart, processNavCron, refreshActiveStrategiesNav };

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(refreshActiveStrategiesNav(env, new Date(controller.scheduledTime)));
  }
};
