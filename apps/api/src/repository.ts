import { and, asc, countDistinct, desc, eq, inArray, sum } from "drizzle-orm";
import {
  feeEvents,
  investmentPositions,
  investorStrategyEvents,
  strategies,
  strategyAllocations,
  strategyInvestments,
  strategyModelPositions,
  strategyNavSnapshots,
  strategyVersions,
} from "@stratin/db";
import {
  type CreateStrategyInput,
  calculateFeeBreakdown,
  type FeeConfig,
  type PublishRebalanceInput,
  type RecordRebalanceInput,
  type RecordInvestmentInput,
  type StrategyDetail,
  type StrategyInvestment,
  type StrategyListItem,
  type StrategyNavSnapshotDto,
  type StrategyPerformanceDto,
  type StrategyVersionDto,
  type VerificationStatus,
  hashStrategyAllocation,
  validateStrategyAllocations,
} from "@stratin/shared";
import {
  calculateNav,
  calculatePerformance,
  initializeModelPositions,
  rebalanceModelPositions,
  type ModelPosition,
  type PriceProvider,
} from "@stratin/strategy-engine";
import type { getDb } from "./db";

type Db = ReturnType<typeof getDb>;

function iso(date: Date) {
  return date.toISOString();
}

function toPerformanceDto(
  performance: Record<string, bigint | null>,
): StrategyPerformanceDto {
  return {
    oneWeek: performance.oneWeek?.toString() ?? null,
    oneMonth: performance.oneMonth?.toString() ?? null,
    threeMonths: performance.threeMonths?.toString() ?? null,
    sinceInception: performance.sinceInception?.toString() ?? null,
  };
}

function toNavDto(
  snapshot: typeof strategyNavSnapshots.$inferSelect,
): StrategyNavSnapshotDto {
  return {
    timestamp: iso(snapshot.timestamp),
    navUsdcAtomic: snapshot.navUsdcAtomic.toString(),
    strategyVersion: snapshot.strategyVersion,
    cumulativeCostsUsdcAtomic: snapshot.cumulativeCostsUsdcAtomic.toString(),
  };
}

function assertMatchingRegistryHash(expectedHash: string, actualHash: string) {
  if (expectedHash !== actualHash) {
    throw new Error(
      "Registry allocation hash does not match canonical allocation hash.",
    );
  }
}

async function getVersionAllocations(
  db: Db,
  strategyId: string,
  versionNumber: number,
) {
  const [version] = await db
    .select()
    .from(strategyVersions)
    .where(
      and(
        eq(strategyVersions.strategyId, strategyId),
        eq(strategyVersions.version, versionNumber),
      ),
    )
    .limit(1);

  const allocations = version
    ? await db
        .select({
          assetMint: strategyAllocations.assetMint,
          weightBps: strategyAllocations.weightBps,
        })
        .from(strategyAllocations)
        .where(eq(strategyAllocations.strategyVersionId, version.id))
    : [];

  return { version, allocations };
}

async function listStrategyVersionsInternal(
  db: Db,
  strategyId: string,
): Promise<StrategyVersionDto[]> {
  const rows = await db
    .select({
      version: strategyVersions,
      allocation: strategyAllocations,
    })
    .from(strategyVersions)
    .leftJoin(
      strategyAllocations,
      eq(strategyAllocations.strategyVersionId, strategyVersions.id),
    )
    .where(eq(strategyVersions.strategyId, strategyId))
    .orderBy(asc(strategyVersions.version));

  const byVersion = new Map<string, StrategyVersionDto>();

  for (const row of rows) {
    const existing =
      byVersion.get(row.version.id) ??
      ({
        id: row.version.id,
        version: row.version.version,
        createdAt: iso(row.version.createdAt),
        allocationHash: row.version.allocationHash,
        solanaTransactionSignature: row.version.solanaTransactionSignature,
        registryStrategyPda: row.version.registryStrategyPda,
        registryVersionPda: row.version.registryVersionPda,
        verifiedAt: row.version.verifiedAt ? iso(row.version.verifiedAt) : null,
        verificationStatus: row.version.verificationStatus,
        allocations: [],
      } satisfies StrategyVersionDto);

    if (row.allocation) {
      existing.allocations.push({
        assetMint: row.allocation.assetMint,
        weightBps: row.allocation.weightBps,
      });
    }

    byVersion.set(row.version.id, existing);
  }

  return [...byVersion.values()];
}

async function hydrateStrategies(
  db: Db,
  strategyRows: (typeof strategies.$inferSelect)[],
): Promise<StrategyDetail[]> {
  if (strategyRows.length === 0) {
    return [];
  }

  const strategyIds = strategyRows.map((strategy) => strategy.id);
  const creatorWallets = [
    ...new Set(strategyRows.map((strategy) => strategy.creatorWallet)),
  ];

  const [
    versionRows,
    investmentStatsRows,
    strategistStatsRows,
    earningsStatsRows,
    snapshotRows,
  ] = await Promise.all([
    db
      .select({
        version: strategyVersions,
        allocation: strategyAllocations,
      })
      .from(strategyVersions)
      .leftJoin(
        strategyAllocations,
        eq(strategyAllocations.strategyVersionId, strategyVersions.id),
      )
      .where(inArray(strategyVersions.strategyId, strategyIds))
      .orderBy(asc(strategyVersions.version)),
    db
      .select({
        strategyId: strategyInvestments.strategyId,
        investorCount: countDistinct(strategyInvestments.investorWallet),
        capitalFollowingUsdcAtomic: sum(
          strategyInvestments.initialAmountUsdcAtomic,
        ),
      })
      .from(strategyInvestments)
      .where(inArray(strategyInvestments.strategyId, strategyIds))
      .groupBy(strategyInvestments.strategyId),
    db
      .select({
        creatorWallet: strategies.creatorWallet,
        strategyCount: countDistinct(strategies.id),
      })
      .from(strategies)
      .where(inArray(strategies.creatorWallet, creatorWallets))
      .groupBy(strategies.creatorWallet),
    db
      .select({
        strategistWallet: feeEvents.strategistWallet,
        strategistEarningsUsdcAtomic: sum(feeEvents.strategistFeeUsdcAtomic),
      })
      .from(feeEvents)
      .where(inArray(feeEvents.strategistWallet, creatorWallets))
      .groupBy(feeEvents.strategistWallet),
    db
      .select()
      .from(strategyNavSnapshots)
      .where(inArray(strategyNavSnapshots.strategyId, strategyIds))
      .orderBy(asc(strategyNavSnapshots.timestamp)),
  ]);

  const versionsByStrategy = new Map<string, StrategyVersionDto[]>();
  const versionsById = new Map<string, StrategyVersionDto>();
  for (const row of versionRows) {
    let version = versionsById.get(row.version.id);
    if (!version) {
      version = {
        id: row.version.id,
        version: row.version.version,
        createdAt: iso(row.version.createdAt),
        allocationHash: row.version.allocationHash,
        solanaTransactionSignature: row.version.solanaTransactionSignature,
        registryStrategyPda: row.version.registryStrategyPda,
        registryVersionPda: row.version.registryVersionPda,
        verifiedAt: row.version.verifiedAt ? iso(row.version.verifiedAt) : null,
        verificationStatus: row.version.verificationStatus,
        allocations: [],
      };
      versionsById.set(row.version.id, version);
      const strategyVersionsForId =
        versionsByStrategy.get(row.version.strategyId) ?? [];
      strategyVersionsForId.push(version);
      versionsByStrategy.set(row.version.strategyId, strategyVersionsForId);
    }
    if (row.allocation) {
      version.allocations.push({
        assetMint: row.allocation.assetMint,
        weightBps: row.allocation.weightBps,
      });
    }
  }

  const investmentStatsByStrategy = new Map(
    investmentStatsRows.map((row) => [row.strategyId, row]),
  );
  const strategistStatsByWallet = new Map(
    strategistStatsRows.map((row) => [row.creatorWallet, row]),
  );
  const earningsStatsByWallet = new Map(
    earningsStatsRows.map((row) => [row.strategistWallet, row]),
  );
  const snapshotsByStrategy = new Map<
    string,
    (typeof strategyNavSnapshots.$inferSelect)[]
  >();
  for (const snapshot of snapshotRows) {
    const snapshots = snapshotsByStrategy.get(snapshot.strategyId) ?? [];
    snapshots.push(snapshot);
    snapshotsByStrategy.set(snapshot.strategyId, snapshots);
  }

  return strategyRows.map((strategy) => {
    const versions = versionsByStrategy.get(strategy.id) ?? [];
    const allocations =
      versions.find((version) => version.version === strategy.currentVersion)
        ?.allocations ?? [];
    const investmentStats = investmentStatsByStrategy.get(strategy.id);
    const strategistStats = strategistStatsByWallet.get(strategy.creatorWallet);
    const earningsStats = earningsStatsByWallet.get(strategy.creatorWallet);
    const snapshots = snapshotsByStrategy.get(strategy.id) ?? [];
    const latestNavSnapshot = snapshots.at(-1) ?? null;
    const performance = calculatePerformance(
      snapshots.map((snapshot) => ({
        timestamp: snapshot.timestamp,
        navUsdcAtomic: snapshot.navUsdcAtomic,
      })),
    );

    return {
      id: strategy.id,
      creatorWallet: strategy.creatorWallet,
      registryStrategyIdHex: strategy.registryStrategyIdHex,
      registryStrategyPda: strategy.registryStrategyPda,
      name: strategy.name,
      description: strategy.description,
      currentVersion: strategy.currentVersion,
      status: strategy.status,
      createdAt: iso(strategy.createdAt),
      allocations,
      investorCount: Number(investmentStats?.investorCount ?? 0),
      capitalFollowingUsdcAtomic: String(
        investmentStats?.capitalFollowingUsdcAtomic ?? 0,
      ),
      strategistEarningsUsdcAtomic: String(
        earningsStats?.strategistEarningsUsdcAtomic ?? 0,
      ),
      strategistStrategyCount: Number(strategistStats?.strategyCount ?? 0),
      latestNavSnapshot: latestNavSnapshot ? toNavDto(latestNavSnapshot) : null,
      performance: toPerformanceDto(performance),
      versions,
    };
  });
}

async function hydrateStrategy(
  db: Db,
  strategy: typeof strategies.$inferSelect,
): Promise<StrategyDetail> {
  const [hydrated] = await hydrateStrategies(db, [strategy]);
  return hydrated;
}

export async function createStrategy(
  db: Db,
  input: CreateStrategyInput,
  priceProvider?: PriceProvider,
): Promise<StrategyDetail> {
  validateStrategyAllocations(input.allocations);
  const allocationHash = await hashStrategyAllocation(input.allocations);
  if (input.registryCommitment) {
    assertMatchingRegistryHash(
      allocationHash,
      input.registryCommitment.allocationHash,
    );
  }
  const positions = priceProvider
    ? await initializeModelPositions(input.allocations, priceProvider)
    : null;
  const strategy = await db.transaction(async (tx) => {
    const [createdStrategy] = await tx
      .insert(strategies)
      .values({
        creatorWallet: input.creatorWallet,
        registryStrategyIdHex: input.registryCommitment?.strategyIdHex,
        registryStrategyPda: input.registryCommitment?.strategyPda,
        name: input.name,
        description: input.description,
        currentVersion: 1,
        status: "ACTIVE",
      })
      .returning();

    const [version] = await tx
      .insert(strategyVersions)
      .values({
        strategyId: createdStrategy.id,
        version: 1,
        allocationHash,
        solanaTransactionSignature:
          input.registryCommitment?.transactionSignature,
        registryStrategyPda: input.registryCommitment?.strategyPda,
        registryVersionPda: input.registryCommitment?.versionPda,
        verificationStatus: input.registryCommitment ? "PENDING" : "UNVERIFIED",
      })
      .returning();

    await tx.insert(strategyAllocations).values(
      input.allocations.map((allocation) => ({
        strategyVersionId: version.id,
        assetMint: allocation.assetMint,
        weightBps: allocation.weightBps,
      })),
    );

    if (positions) {
      await tx.insert(strategyModelPositions).values(
        positions.map((position) => ({
          strategyId: createdStrategy.id,
          assetMint: position.assetMint,
          quantityAtomic: position.quantityAtomic.toString(),
          strategyVersion: 1,
        })),
      );
      await tx.insert(strategyNavSnapshots).values({
        strategyId: createdStrategy.id,
        navUsdcAtomic: 100_000_000n,
        strategyVersion: 1,
        cumulativeCostsUsdcAtomic: 0n,
      });
    }

    return createdStrategy;
  });

  return hydrateStrategy(db, strategy);
}

export async function listStrategies(db: Db): Promise<StrategyListItem[]> {
  const rows = await db
    .select()
    .from(strategies)
    .where(eq(strategies.status, "ACTIVE"))
    .orderBy(desc(strategies.createdAt));

  return hydrateStrategies(db, rows);
}

export async function getStrategy(
  db: Db,
  id: string,
): Promise<StrategyDetail | null> {
  const [strategy] = await db
    .select()
    .from(strategies)
    .where(eq(strategies.id, id))
    .limit(1);
  return strategy ? hydrateStrategy(db, strategy) : null;
}

export async function refreshStrategyNav(
  db: Db,
  strategyId: string,
  priceProvider: PriceProvider,
  intervalStart?: Date,
): Promise<StrategyNavSnapshotDto> {
  const [strategy] = await db
    .select()
    .from(strategies)
    .where(eq(strategies.id, strategyId))
    .limit(1);

  if (!strategy) {
    throw new Error("Strategy not found.");
  }

  if (intervalStart) {
    const [existingSnapshot] = await db
      .select()
      .from(strategyNavSnapshots)
      .where(
        and(
          eq(strategyNavSnapshots.strategyId, strategyId),
          eq(strategyNavSnapshots.intervalStart, intervalStart),
        ),
      )
      .limit(1);

    if (existingSnapshot) {
      return toNavDto(existingSnapshot);
    }
  }

  const positions = await db
    .select()
    .from(strategyModelPositions)
    .where(eq(strategyModelPositions.strategyId, strategyId));

  if (positions.length === 0) {
    const { allocations } = await getVersionAllocations(
      db,
      strategyId,
      strategy.currentVersion,
    );
    const initialized = await initializeModelPositions(
      allocations,
      priceProvider,
    );
    await db.insert(strategyModelPositions).values(
      initialized.map((position) => ({
        strategyId,
        assetMint: position.assetMint,
        quantityAtomic: position.quantityAtomic.toString(),
        strategyVersion: strategy.currentVersion,
      })),
    );
    await db.insert(strategyNavSnapshots).values({
      strategyId,
      navUsdcAtomic: 100_000_000n,
      strategyVersion: strategy.currentVersion,
      cumulativeCostsUsdcAtomic: 0n,
    });
  }

  const currentPositions = (
    positions.length === 0
      ? await db
          .select()
          .from(strategyModelPositions)
          .where(eq(strategyModelPositions.strategyId, strategyId))
      : positions
  ).map((position) => ({
    assetMint: position.assetMint,
    quantityAtomic: BigInt(position.quantityAtomic),
  }));

  const nav = await calculateNav({
    positions: currentPositions,
    priceProvider,
  });
  const [lastSnapshot] = await db
    .select()
    .from(strategyNavSnapshots)
    .where(eq(strategyNavSnapshots.strategyId, strategyId))
    .orderBy(desc(strategyNavSnapshots.timestamp))
    .limit(1);
  const [snapshot] = await db
    .insert(strategyNavSnapshots)
    .values({
      strategyId,
      intervalStart,
      navUsdcAtomic: nav.navUsdcAtomic,
      strategyVersion: strategy.currentVersion,
      cumulativeCostsUsdcAtomic: lastSnapshot?.cumulativeCostsUsdcAtomic ?? 0n,
    })
    .returning();

  return toNavDto(snapshot);
}

export async function listStrategyVersions(
  db: Db,
  strategyId: string,
): Promise<StrategyVersionDto[]> {
  return listStrategyVersionsInternal(db, strategyId);
}

export async function publishRebalance(
  db: Db,
  strategyId: string,
  input: PublishRebalanceInput,
  priceProvider: PriceProvider,
): Promise<StrategyDetail> {
  validateStrategyAllocations(input.allocations);

  const [strategy] = await db
    .select()
    .from(strategies)
    .where(eq(strategies.id, strategyId))
    .limit(1);

  if (!strategy || strategy.status !== "ACTIVE") {
    throw new Error("Strategy not found or inactive.");
  }

  if (strategy.creatorWallet !== input.creatorWallet) {
    throw new Error("Only the strategy creator can publish a rebalance.");
  }

  const nextVersion = strategy.currentVersion + 1;
  const allocationHash = await hashStrategyAllocation(input.allocations);
  if (input.registryCommitment) {
    assertMatchingRegistryHash(
      allocationHash,
      input.registryCommitment.allocationHash,
    );
    if (
      strategy.registryStrategyPda &&
      input.registryCommitment.strategyPda !== strategy.registryStrategyPda
    ) {
      throw new Error("Registry strategy PDA does not match this strategy.");
    }
  }

  const currentPositionRows = await db
    .select()
    .from(strategyModelPositions)
    .where(eq(strategyModelPositions.strategyId, strategyId));
  const currentPositions: ModelPosition[] =
    currentPositionRows.length > 0
      ? currentPositionRows.map((position) => ({
          assetMint: position.assetMint,
          quantityAtomic: BigInt(position.quantityAtomic),
        }))
      : await initializeModelPositions(
          (await getVersionAllocations(db, strategyId, strategy.currentVersion))
            .allocations,
          priceProvider,
        );
  const [lastSnapshot] = await db
    .select()
    .from(strategyNavSnapshots)
    .where(eq(strategyNavSnapshots.strategyId, strategyId))
    .orderBy(desc(strategyNavSnapshots.timestamp))
    .limit(1);
  const modelRebalance = await rebalanceModelPositions({
    currentPositions,
    newAllocations: input.allocations,
    priceProvider,
  });
  const cumulativeCosts =
    (lastSnapshot?.cumulativeCostsUsdcAtomic ?? 0n) +
    modelRebalance.costUsdcAtomic;
  const updated = await db.transaction(async (tx) => {
    const [version] = await tx
      .insert(strategyVersions)
      .values({
        strategyId,
        version: nextVersion,
        allocationHash,
        solanaTransactionSignature:
          input.registryCommitment?.transactionSignature,
        registryStrategyPda:
          input.registryCommitment?.strategyPda ?? strategy.registryStrategyPda,
        registryVersionPda: input.registryCommitment?.versionPda,
        verificationStatus: input.registryCommitment ? "PENDING" : "UNVERIFIED",
      })
      .returning();

    await tx.insert(strategyAllocations).values(
      input.allocations.map((allocation) => ({
        strategyVersionId: version.id,
        assetMint: allocation.assetMint,
        weightBps: allocation.weightBps,
      })),
    );
    await tx
      .delete(strategyModelPositions)
      .where(eq(strategyModelPositions.strategyId, strategyId));
    await tx.insert(strategyModelPositions).values(
      modelRebalance.positions.map((position) => ({
        strategyId,
        assetMint: position.assetMint,
        quantityAtomic: position.quantityAtomic.toString(),
        strategyVersion: nextVersion,
      })),
    );
    const [updatedStrategy] = await tx
      .update(strategies)
      .set({ currentVersion: nextVersion })
      .where(
        and(
          eq(strategies.id, strategyId),
          eq(strategies.currentVersion, strategy.currentVersion),
        ),
      )
      .returning();
    if (!updatedStrategy) {
      throw new Error(
        "Strategy changed while publishing the rebalance. Retry from the current version.",
      );
    }
    await tx.insert(strategyNavSnapshots).values({
      strategyId,
      navUsdcAtomic: modelRebalance.afterNavUsdcAtomic,
      strategyVersion: nextVersion,
      cumulativeCostsUsdcAtomic: cumulativeCosts,
    });
    return updatedStrategy;
  });

  return hydrateStrategy(db, updated);
}

export async function listStrategistStrategies(
  db: Db,
  wallet: string,
): Promise<StrategyListItem[]> {
  const rows = await db
    .select()
    .from(strategies)
    .where(eq(strategies.creatorWallet, wallet))
    .orderBy(desc(strategies.createdAt));

  return hydrateStrategies(db, rows);
}

export async function recordInvestment(
  db: Db,
  strategyId: string,
  input: RecordInvestmentInput,
  feeConfig?: FeeConfig,
): Promise<StrategyInvestment> {
  if (input.transactionSignatures.length === 0) {
    throw new Error(
      "Cannot record investment without confirmed transaction signatures.",
    );
  }

  const strategy = await getStrategy(db, strategyId);

  if (!strategy || strategy.status !== "ACTIVE") {
    throw new Error("Strategy not found or inactive.");
  }
  if (feeConfig && feeConfig.entryFeeBps > 0 && !input.fee) {
    throw new Error("Investment fee confirmation is required.");
  }
  const fee =
    input.fee && feeConfig
      ? calculateFeeBreakdown(
          "INVEST",
          BigInt(input.initialAmountUsdcAtomic),
          feeConfig,
        )
      : null;
  const investment = await db.transaction(async (tx) => {
    const [createdInvestment] = await tx
      .insert(strategyInvestments)
      .values({
        strategyId,
        investorWallet: input.investorWallet,
        strategyVersion: strategy.currentVersion,
        initialAmountUsdcAtomic: BigInt(input.initialAmountUsdcAtomic),
      })
      .returning();

    await tx.insert(investmentPositions).values(
      input.positions.map((position) => ({
        investmentId: createdInvestment.id,
        assetMint: position.assetMint,
        quantityAtomic: position.quantityAtomic,
      })),
    );
    await tx.insert(investorStrategyEvents).values({
      investmentId: createdInvestment.id,
      eventType: "INVEST",
      transactionSignatures: input.transactionSignatures,
    });

    if (input.fee && fee) {
      await tx.insert(feeEvents).values({
        strategyId: strategy.id,
        investmentId: createdInvestment.id,
        investorWallet: input.investorWallet,
        strategistWallet: strategy.creatorWallet,
        eventType: "INVEST",
        actionAmountUsdcAtomic: fee.actionAmountAtomic,
        strategistFeeUsdcAtomic: fee.strategistFeeAtomic,
        protocolFeeUsdcAtomic: fee.protocolFeeAtomic,
        transactionSignatures: input.fee.transactionSignatures,
      });
    }
    return createdInvestment;
  });

  return {
    id: investment.id,
    strategyId: investment.strategyId,
    investorWallet: investment.investorWallet,
    strategyVersion: investment.strategyVersion,
    initialAmountUsdcAtomic: investment.initialAmountUsdcAtomic.toString(),
    investedAt: iso(investment.investedAt),
    positions: input.positions,
    strategy: {
      id: strategy.id,
      name: strategy.name,
      creatorWallet: strategy.creatorWallet,
      currentVersion: strategy.currentVersion,
    },
  };
}

export async function listInvestorInvestments(
  db: Db,
  wallet: string,
): Promise<StrategyInvestment[]> {
  const rows = await db
    .select({
      investment: strategyInvestments,
      strategy: strategies,
    })
    .from(strategyInvestments)
    .innerJoin(strategies, eq(strategyInvestments.strategyId, strategies.id))
    .where(eq(strategyInvestments.investorWallet, wallet))
    .orderBy(desc(strategyInvestments.investedAt));

  return Promise.all(
    rows.map(async ({ investment, strategy }) => {
      const positions = await db
        .select({
          assetMint: investmentPositions.assetMint,
          quantityAtomic: investmentPositions.quantityAtomic,
        })
        .from(investmentPositions)
        .where(eq(investmentPositions.investmentId, investment.id));

      return {
        id: investment.id,
        strategyId: investment.strategyId,
        investorWallet: investment.investorWallet,
        strategyVersion: investment.strategyVersion,
        initialAmountUsdcAtomic: investment.initialAmountUsdcAtomic.toString(),
        investedAt: iso(investment.investedAt),
        positions,
        strategy: {
          id: strategy.id,
          name: strategy.name,
          creatorWallet: strategy.creatorWallet,
          currentVersion: strategy.currentVersion,
        },
      };
    }),
  );
}

export async function getInvestment(
  db: Db,
  investmentId: string,
): Promise<StrategyInvestment | null> {
  const [row] = await db
    .select({
      investment: strategyInvestments,
      strategy: strategies,
    })
    .from(strategyInvestments)
    .innerJoin(strategies, eq(strategyInvestments.strategyId, strategies.id))
    .where(eq(strategyInvestments.id, investmentId))
    .limit(1);

  if (!row) {
    return null;
  }

  const positions = await db
    .select({
      assetMint: investmentPositions.assetMint,
      quantityAtomic: investmentPositions.quantityAtomic,
    })
    .from(investmentPositions)
    .where(eq(investmentPositions.investmentId, investmentId));

  return {
    id: row.investment.id,
    strategyId: row.investment.strategyId,
    investorWallet: row.investment.investorWallet,
    strategyVersion: row.investment.strategyVersion,
    initialAmountUsdcAtomic: row.investment.initialAmountUsdcAtomic.toString(),
    investedAt: iso(row.investment.investedAt),
    positions,
    strategy: {
      id: row.strategy.id,
      name: row.strategy.name,
      creatorWallet: row.strategy.creatorWallet,
      currentVersion: row.strategy.currentVersion,
    },
  };
}

export async function recordRebalance(
  db: Db,
  investmentId: string,
  input: RecordRebalanceInput,
  feeConfig?: FeeConfig,
): Promise<StrategyInvestment> {
  if (input.transactionSignatures.length === 0) {
    throw new Error(
      "Cannot record rebalance without confirmed transaction signatures.",
    );
  }

  const current = await getInvestment(db, investmentId);

  if (!current || !current.strategy) {
    throw new Error("Investment not found.");
  }
  const currentStrategy = current.strategy;

  if (current.investorWallet !== input.investorWallet) {
    throw new Error("Only the investing wallet can record this rebalance.");
  }

  if (current.strategyVersion >= currentStrategy.currentVersion) {
    throw new Error("Investment is already up to date.");
  }
  if (feeConfig && feeConfig.rebalanceFeeBps > 0 && !input.fee) {
    throw new Error("Rebalance fee confirmation is required.");
  }
  const fee =
    input.fee && feeConfig
      ? calculateFeeBreakdown(
          "REBALANCE",
          BigInt(input.fee.actionAmountAtomic),
          feeConfig,
        )
      : null;
  const updated = await db.transaction(async (tx) => {
    await tx
      .delete(investmentPositions)
      .where(eq(investmentPositions.investmentId, investmentId));
    await tx.insert(investmentPositions).values(
      input.positions.map((position) => ({
        investmentId,
        assetMint: position.assetMint,
        quantityAtomic: position.quantityAtomic,
      })),
    );
    await tx.insert(investorStrategyEvents).values({
      investmentId,
      eventType: "REBALANCE",
      transactionSignatures: input.transactionSignatures,
      fromVersion: current.strategyVersion,
      toVersion: currentStrategy.currentVersion,
    });

    if (input.fee && fee) {
      await tx.insert(feeEvents).values({
        strategyId: current.strategyId,
        investmentId,
        investorWallet: input.investorWallet,
        strategistWallet: currentStrategy.creatorWallet,
        eventType: "REBALANCE",
        actionAmountUsdcAtomic: fee.actionAmountAtomic,
        strategistFeeUsdcAtomic: fee.strategistFeeAtomic,
        protocolFeeUsdcAtomic: fee.protocolFeeAtomic,
        transactionSignatures: input.fee.transactionSignatures,
      });
    }

    const [updatedInvestment] = await tx
      .update(strategyInvestments)
      .set({ strategyVersion: currentStrategy.currentVersion })
      .where(
        and(
          eq(strategyInvestments.id, investmentId),
          eq(strategyInvestments.strategyVersion, current.strategyVersion),
        ),
      )
      .returning();
    if (!updatedInvestment) {
      throw new Error(
        "Investment changed while recording the rebalance. Reload before retrying.",
      );
    }
    return updatedInvestment;
  });

  return {
    ...current,
    strategyVersion: updated.strategyVersion,
    positions: input.positions,
  };
}

export async function listActiveStrategyIds(db: Db): Promise<string[]> {
  const rows = await db
    .select({ id: strategies.id })
    .from(strategies)
    .where(eq(strategies.status, "ACTIVE"))
    .orderBy(asc(strategies.createdAt));

  return rows.map((row) => row.id);
}

export async function setStrategyVersionVerificationStatus(
  db: Db,
  strategyId: string,
  version: number,
  status: Extract<VerificationStatus, "PENDING" | "VERIFIED" | "FAILED">,
) {
  await db
    .update(strategyVersions)
    .set({
      verificationStatus: status,
      verifiedAt: status === "VERIFIED" ? new Date() : null,
    })
    .where(
      and(
        eq(strategyVersions.strategyId, strategyId),
        eq(strategyVersions.version, version),
      ),
    );
}
