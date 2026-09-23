import { Hono } from "hono";
import { cors } from "hono/cors";
import { ZodError } from "zod";
import {
  createStrategySchema,
  hashStrategyAllocation,
  parseFeeConfig,
  publishRebalanceSchema,
  recordInvestmentSchema,
  recordRebalanceSchema,
  STRATEGY_SELECTABLE_ASSETS,
  type StrategyDetail,
  type StrategyVersionDto,
} from "@stratin/shared";
import { resolveCorsOrigin } from "./cors";
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
  refreshStrategyNav,
  setStrategyVersionVerificationStatus,
} from "./repository";
import {
  verifyRegistryCommitment,
  type RegistryNetwork,
} from "./registry-verification";
import { getRegistryRpcUrl } from "./registry-rpc";

const app = new Hono<{ Bindings: Env }>();

function getPriceProvider(env: Env) {
  return new JupiterPriceProvider(env.JUPITER_SWAP_API_BASE_URL);
}

app.use(
  "*",
  cors({
    origin: (origin, c) => resolveCorsOrigin(origin, c.env.ALLOWED_ORIGINS),
    allowHeaders: ["Content-Type"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    maxAge: 86400,
  }),
);

app.onError((error, c) => {
  if (error instanceof ZodError) {
    return c.json(
      {
        error:
          error.issues[0]?.message ?? "The request contains invalid data.",
        issues: error.issues,
      },
      400,
    );
  }

  console.error(JSON.stringify({ message: error.message, stack: error.stack }));
  return c.json({ error: error.message }, 500);
});

app.get("/health", (c) => {
  return c.json({
    ok: true,
    service: "stratin-api",
    scope: "stage-1-scaffold",
  });
});

app.get("/assets", (c) => {
  return c.json({
    assets: STRATEGY_SELECTABLE_ASSETS,
  });
});

app.get("/config/fees", (c) => {
  const config = parseFeeConfig(c.env);
  return c.json({ config });
});

app.post("/strategies", async (c) => {
  const body = createStrategySchema.parse(await c.req.json());
  const db = getDb(c.env);
  let strategy = await createStrategy(db, body, getPriceProvider(c.env));
  const registryVerification = body.registryCommitment
    ? await verifyAndPersistRegistryVersion(
        db,
        c.env,
        strategy,
        strategy.versions?.[0],
      )
    : undefined;
  strategy = (await getStrategy(db, strategy.id)) ?? strategy;
  return c.json({ strategy, registryVerification }, 201);
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
  const snapshot = await refreshStrategyNav(
    getDb(c.env),
    c.req.param("id"),
    getPriceProvider(c.env),
  );
  return c.json({ snapshot });
});

app.get("/strategies/:id/versions", async (c) => {
  const versions = await listStrategyVersions(getDb(c.env), c.req.param("id"));
  return c.json({ versions });
});

app.get("/strategies/:id/registry/verify", async (c) => {
  const db = getDb(c.env);
  const strategy = await getStrategy(db, c.req.param("id"));

  if (!strategy) {
    return c.json({ error: "Strategy not found." }, 404);
  }

  const results = [];
  for (const version of strategy.versions ?? []) {
    results.push(
      await verifyAndPersistRegistryVersion(db, c.env, strategy, version),
    );
  }

  return c.json({
    strategyId: strategy.id,
    registryStrategyPda: strategy.registryStrategyPda,
    results,
  });
});

app.post("/strategies/:id/rebalances", async (c) => {
  const body = publishRebalanceSchema.parse(await c.req.json());
  const db = getDb(c.env);
  let strategy = await publishRebalance(
    db,
    c.req.param("id"),
    body,
    getPriceProvider(c.env),
  );
  const version = strategy.versions?.find(
    (item) => item.version === strategy.currentVersion,
  );
  const registryVerification = body.registryCommitment
    ? await verifyAndPersistRegistryVersion(db, c.env, strategy, version)
    : undefined;
  strategy = (await getStrategy(db, strategy.id)) ?? strategy;
  return c.json({ strategy, registryVerification }, 201);
});

app.get("/strategists/:wallet/strategies", async (c) => {
  const strategies = await listStrategistStrategies(
    getDb(c.env),
    c.req.param("wallet"),
  );
  return c.json({ strategies });
});

app.post("/strategies/:id/investments", async (c) => {
  const body = recordInvestmentSchema.parse(await c.req.json());
  const investment = await recordInvestment(
    getDb(c.env),
    c.req.param("id"),
    body,
    parseFeeConfig(c.env),
  );
  return c.json({ investment }, 201);
});

app.get("/investors/:wallet/investments", async (c) => {
  const investments = await listInvestorInvestments(
    getDb(c.env),
    c.req.param("wallet"),
  );
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
  const investment = await recordRebalance(
    getDb(c.env),
    c.req.param("id"),
    body,
    parseFeeConfig(c.env),
  );
  return c.json({ investment }, 201);
});

async function refreshActiveStrategiesNav(env: Env, scheduledAt = new Date()) {
  const db = getDb(env);
  const priceProvider = getPriceProvider(env);
  const intervalStart = navIntervalStart(scheduledAt);
  const strategyIds = await listActiveStrategyIds(db);
  const results = await processNavCron(strategyIds, (strategyId) =>
    refreshStrategyNav(db, strategyId, priceProvider, intervalStart).then(
      () => undefined,
    ),
  );

  console.log(
    JSON.stringify({
      event: "nav_cron_complete",
      activeStrategies: strategyIds.length,
      succeeded: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok).length,
      intervalStart: intervalStart.toISOString(),
    }),
  );

  return results;
}

async function verifyAndPersistRegistryVersion(
  db: ReturnType<typeof getDb>,
  env: Env,
  strategy: StrategyDetail,
  version: StrategyVersionDto | undefined,
) {
  if (
    !version ||
    !strategy.registryStrategyIdHex ||
    !strategy.registryStrategyPda ||
    !version.registryVersionPda
  ) {
    return {
      version: version?.version,
      status: "UNVERIFIED" as const,
      error: "Registry metadata is incomplete.",
    };
  }

  const currentVersion = strategy.versions?.find(
    (item) => item.version === strategy.currentVersion,
  );
  if (!currentVersion) {
    await setStrategyVersionVerificationStatus(
      db,
      strategy.id,
      version.version,
      "FAILED",
    );
    return {
      version: version.version,
      status: "MISMATCH" as const,
      error: "Current strategy version is missing.",
    };
  }

  try {
    const rpcUrl = getRegistryRpcUrl(env);
    const network = parseRegistryNetwork(env.REGISTRY_NETWORK);
    const canonicalHash = await hashStrategyAllocation(version.allocations);
    const currentCanonicalHash = await hashStrategyAllocation(
      currentVersion.allocations,
    );
    if (
      version.allocationHash !== canonicalHash ||
      currentVersion.allocationHash !== currentCanonicalHash
    ) {
      throw new Error(
        "Stored allocation hash does not match canonical database allocations.",
      );
    }

    await verifyRegistryCommitment({
      rpcUrl,
      network,
      creatorWallet: strategy.creatorWallet,
      strategyIdHex: strategy.registryStrategyIdHex,
      strategyPda: strategy.registryStrategyPda,
      versionPda: version.registryVersionPda,
      expectedVersion: version.version,
      expectedAllocationHash: canonicalHash,
      expectedCurrentVersion: strategy.currentVersion,
      expectedCurrentAllocationHash: currentCanonicalHash,
    });
    await setStrategyVersionVerificationStatus(
      db,
      strategy.id,
      version.version,
      "VERIFIED",
    );
    return {
      version: version.version,
      canonicalHash,
      status: "MATCH" as const,
    };
  } catch (error) {
    await setStrategyVersionVerificationStatus(
      db,
      strategy.id,
      version.version,
      "FAILED",
    );
    return {
      version: version.version,
      status: "MISMATCH" as const,
      error:
        error instanceof Error
          ? error.message
          : "Registry verification failed.",
    };
  }
}

function parseRegistryNetwork(value: string | undefined): RegistryNetwork {
  const network = value?.trim() || "devnet";
  if (
    network === "devnet" ||
    network === "mainnet-beta" ||
    network === "testnet" ||
    network === "localnet"
  ) {
    return network;
  }
  throw new Error(
    "REGISTRY_NETWORK must be devnet, mainnet-beta, testnet, or localnet.",
  );
}

export { app, navIntervalStart, processNavCron, refreshActiveStrategiesNav };

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(
      refreshActiveStrategiesNav(env, new Date(controller.scheduledTime)),
    );
  },
};
