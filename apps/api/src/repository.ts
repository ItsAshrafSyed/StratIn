import { and, asc, countDistinct, desc, eq, lte, sql, sum } from "drizzle-orm";
import {
  feeEvents,
  investmentPositions,
  investorStrategyEvents,
  strategies,
  strategyAllocations,
  strategyInvestments,
  strategyModelPositions,
  strategyNavSnapshots,
  strategyVersions
} from "@stratin/db";
import {
  type CreateStrategyInput,
  type PublishRebalanceInput,
  type RecordRebalanceInput,
  type RecordInvestmentInput,
  type StrategyDetail,
  type StrategyInvestment,
  type StrategyListItem,
  type StrategyNavSnapshotDto,
  type StrategyPerformanceDto,
  type StrategyVersionDto,
  hashStrategyAllocation,
  validateStrategyAllocations
} from "@stratin/shared";
import {
  calculateNav,
  calculatePerformance,
  initializeModelPositions,
  rebalanceModelPositions,
  type ModelPosition,
  type PriceProvider
} from "@stratin/strategy-engine";
import type { getDb } from "./db";

type Db = ReturnType<typeof getDb>;

function iso(date: Date) {
  return date.toISOString();
}

function toPerformanceDto(performance: Record<string, bigint | null>): StrategyPerformanceDto {
  return {
    oneWeek: performance.oneWeek?.toString() ?? null,
    oneMonth: performance.oneMonth?.toString() ?? null,
    threeMonths: performance.threeMonths?.toString() ?? null,
    sinceInception: performance.sinceInception?.toString() ?? null
  };
}

function toNavDto(snapshot: typeof strategyNavSnapshots.$inferSelect): StrategyNavSnapshotDto {
  return {
    timestamp: iso(snapshot.timestamp),
    navUsdcAtomic: snapshot.navUsdcAtomic.toString(),
    strategyVersion: snapshot.strategyVersion,
    cumulativeCostsUsdcAtomic: snapshot.cumulativeCostsUsdcAtomic.toString()
  };
}

function assertMatchingRegistryHash(expectedHash: string, actualHash: string) {
  if (expectedHash !== actualHash) {
    throw new Error("Registry allocation hash does not match canonical allocation hash.");
  }
}

async function getVersionAllocations(db: Db, strategyId: string, versionNumber: number) {
  const [version] = await db
    .select()
    .from(strategyVersions)
    .where(and(eq(strategyVersions.strategyId, strategyId), eq(strategyVersions.version, versionNumber)))
    .limit(1);

  const allocations = version
    ? await db
        .select({
          assetMint: strategyAllocations.assetMint,
          weightBps: strategyAllocations.weightBps
        })
        .from(strategyAllocations)
        .where(eq(strategyAllocations.strategyVersionId, version.id))
    : [];

  return { version, allocations };
}

async function listStrategyVersionsInternal(db: Db, strategyId: string): Promise<StrategyVersionDto[]> {
  const rows = await db
    .select({
      version: strategyVersions,
      allocation: strategyAllocations
    })
    .from(strategyVersions)
    .leftJoin(strategyAllocations, eq(strategyAllocations.strategyVersionId, strategyVersions.id))
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
        allocations: []
      } satisfies StrategyVersionDto);

    if (row.allocation) {
      existing.allocations.push({
        assetMint: row.allocation.assetMint,
        weightBps: row.allocation.weightBps
      });
    }

    byVersion.set(row.version.id, existing);
  }

  return [...byVersion.values()];
}

async function hydrateStrategy(db: Db, strategy: typeof strategies.$inferSelect): Promise<StrategyDetail> {
  const { allocations } = await getVersionAllocations(db, strategy.id, strategy.currentVersion);

  const [investmentStats] = await db
    .select({
      investorCount: countDistinct(strategyInvestments.investorWallet),
      capitalFollowingUsdcAtomic: sum(strategyInvestments.initialAmountUsdcAtomic)
    })
    .from(strategyInvestments)
    .where(eq(strategyInvestments.strategyId, strategy.id));

  const [strategistStats] = await db
    .select({ strategyCount: countDistinct(strategies.id) })
    .from(strategies)
    .where(eq(strategies.creatorWallet, strategy.creatorWallet));
  const [earningsStats] = await db
    .select({ strategistEarningsUsdcAtomic: sum(feeEvents.strategistFeeUsdcAtomic) })
    .from(feeEvents)
    .where(eq(feeEvents.strategistWallet, strategy.creatorWallet));

  const snapshots = await db
    .select()
    .from(strategyNavSnapshots)
    .where(eq(strategyNavSnapshots.strategyId, strategy.id))
    .orderBy(asc(strategyNavSnapshots.timestamp));

  const latestNavSnapshot = snapshots.at(-1) ?? null;
  const performance = calculatePerformance(
    snapshots.map((snapshot) => ({
      timestamp: snapshot.timestamp,
      navUsdcAtomic: snapshot.navUsdcAtomic
    }))
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
    capitalFollowingUsdcAtomic: String(investmentStats?.capitalFollowingUsdcAtomic ?? 0),
    strategistEarningsUsdcAtomic: String(earningsStats?.strategistEarningsUsdcAtomic ?? 0),
    strategistStrategyCount: Number(strategistStats?.strategyCount ?? 0),
    latestNavSnapshot: latestNavSnapshot ? toNavDto(latestNavSnapshot) : null,
    performance: toPerformanceDto(performance),
    versions: await listStrategyVersionsInternal(db, strategy.id)
  };
}

export async function createStrategy(
  db: Db,
  input: CreateStrategyInput,
  priceProvider?: PriceProvider
): Promise<StrategyDetail> {
  validateStrategyAllocations(input.allocations);
  const allocationHash = await hashStrategyAllocation(input.allocations);
  if (input.registryCommitment) {
    assertMatchingRegistryHash(allocationHash, input.registryCommitment.allocationHash);
  }

  const [strategy] = await db
    .insert(strategies)
    .values({
      creatorWallet: input.creatorWallet,
      registryStrategyIdHex: input.registryCommitment?.strategyIdHex,
      registryStrategyPda: input.registryCommitment?.strategyPda,
      name: input.name,
      description: input.description,
      currentVersion: 1,
      status: "ACTIVE"
    })
    .returning();

  const [version] = await db
    .insert(strategyVersions)
    .values({
      strategyId: strategy.id,
      version: 1,
      allocationHash,
      solanaTransactionSignature: input.registryCommitment?.transactionSignature,
      registryStrategyPda: input.registryCommitment?.strategyPda,
      registryVersionPda: input.registryCommitment?.versionPda,
      verifiedAt: input.registryCommitment ? new Date() : undefined,
      verificationStatus: input.registryCommitment ? "VERIFIED" : "UNVERIFIED"
    })
    .returning();

  await db.insert(strategyAllocations).values(
    input.allocations.map((allocation) => ({
      strategyVersionId: version.id,
      assetMint: allocation.assetMint,
      weightBps: allocation.weightBps
    }))
  );

  if (priceProvider) {
    const positions = await initializeModelPositions(input.allocations, priceProvider);
    await db.insert(strategyModelPositions).values(
      positions.map((position) => ({
        strategyId: strategy.id,
        assetMint: position.assetMint,
        quantityAtomic: position.quantityAtomic.toString(),
        strategyVersion: 1
      }))
    );
    await db.insert(strategyNavSnapshots).values({
      strategyId: strategy.id,
      navUsdcAtomic: 100_000_000n,
      strategyVersion: 1,
      cumulativeCostsUsdcAtomic: 0n
    });
  }

  return hydrateStrategy(db, strategy);
}

export async function listStrategies(db: Db): Promise<StrategyListItem[]> {
  const rows = await db
    .select()
    .from(strategies)
    .where(eq(strategies.status, "ACTIVE"))
    .orderBy(desc(strategies.createdAt));

  return Promise.all(rows.map((row) => hydrateStrategy(db, row)));
}

export async function getStrategy(db: Db, id: string): Promise<StrategyDetail | null> {
  const [strategy] = await db.select().from(strategies).where(eq(strategies.id, id)).limit(1);
  return strategy ? hydrateStrategy(db, strategy) : null;
}

export async function refreshStrategyNav(
  db: Db,
  strategyId: string,
  priceProvider: PriceProvider,
  intervalStart?: Date
): Promise<StrategyNavSnapshotDto> {
  const [strategy] = await db.select().from(strategies).where(eq(strategies.id, strategyId)).limit(1);

  if (!strategy) {
    throw new Error("Strategy not found.");
  }

  if (intervalStart) {
    const [existingSnapshot] = await db
      .select()
      .from(strategyNavSnapshots)
      .where(and(eq(strategyNavSnapshots.strategyId, strategyId), eq(strategyNavSnapshots.intervalStart, intervalStart)))
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
    const { allocations } = await getVersionAllocations(db, strategyId, strategy.currentVersion);
    const initialized = await initializeModelPositions(allocations, priceProvider);
    await db.insert(strategyModelPositions).values(
      initialized.map((position) => ({
        strategyId,
        assetMint: position.assetMint,
        quantityAtomic: position.quantityAtomic.toString(),
        strategyVersion: strategy.currentVersion
      }))
    );
    await db.insert(strategyNavSnapshots).values({
      strategyId,
      navUsdcAtomic: 100_000_000n,
      strategyVersion: strategy.currentVersion,
      cumulativeCostsUsdcAtomic: 0n
    });
  }

  const currentPositions = (positions.length === 0
    ? await db.select().from(strategyModelPositions).where(eq(strategyModelPositions.strategyId, strategyId))
    : positions
  ).map((position) => ({
    assetMint: position.assetMint,
    quantityAtomic: BigInt(position.quantityAtomic)
  }));

  const nav = await calculateNav({ positions: currentPositions, priceProvider });
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
      cumulativeCostsUsdcAtomic: lastSnapshot?.cumulativeCostsUsdcAtomic ?? 0n
    })
    .returning();

  return toNavDto(snapshot);
}

export async function listStrategyVersions(db: Db, strategyId: string): Promise<StrategyVersionDto[]> {
  return listStrategyVersionsInternal(db, strategyId);
}

export async function publishRebalance(
  db: Db,
  strategyId: string,
  input: PublishRebalanceInput,
  priceProvider: PriceProvider
): Promise<StrategyDetail> {
  validateStrategyAllocations(input.allocations);

  const [strategy] = await db.select().from(strategies).where(eq(strategies.id, strategyId)).limit(1);

  if (!strategy || strategy.status !== "ACTIVE") {
    throw new Error("Strategy not found or inactive.");
  }

  if (strategy.creatorWallet !== input.creatorWallet) {
    throw new Error("Only the strategy creator can publish a rebalance.");
  }

  const nextVersion = strategy.currentVersion + 1;
  const allocationHash = await hashStrategyAllocation(input.allocations);
  if (input.registryCommitment) {
    assertMatchingRegistryHash(allocationHash, input.registryCommitment.allocationHash);
    if (strategy.registryStrategyPda && input.registryCommitment.strategyPda !== strategy.registryStrategyPda) {
      throw new Error("Registry strategy PDA does not match this strategy.");
    }
  }
  const [version] = await db
    .insert(strategyVersions)
    .values({
      strategyId,
      version: nextVersion,
      allocationHash,
      solanaTransactionSignature: input.registryCommitment?.transactionSignature,
      registryStrategyPda: input.registryCommitment?.strategyPda ?? strategy.registryStrategyPda,
      registryVersionPda: input.registryCommitment?.versionPda,
      verifiedAt: input.registryCommitment ? new Date() : undefined,
      verificationStatus: input.registryCommitment ? "VERIFIED" : "UNVERIFIED"
    })
    .returning();

  await db.insert(strategyAllocations).values(
    input.allocations.map((allocation) => ({
      strategyVersionId: version.id,
      assetMint: allocation.assetMint,
      weightBps: allocation.weightBps
    }))
  );

  const currentPositionRows = await db
    .select()
    .from(strategyModelPositions)
    .where(eq(strategyModelPositions.strategyId, strategyId));
  const currentPositions: ModelPosition[] =
    currentPositionRows.length > 0
      ? currentPositionRows.map((position) => ({
          assetMint: position.assetMint,
          quantityAtomic: BigInt(position.quantityAtomic)
        }))
      : await initializeModelPositions((await getVersionAllocations(db, strategyId, strategy.currentVersion)).allocations, priceProvider);
  const [lastSnapshot] = await db
    .select()
    .from(strategyNavSnapshots)
    .where(eq(strategyNavSnapshots.strategyId, strategyId))
    .orderBy(desc(strategyNavSnapshots.timestamp))
    .limit(1);
  const modelRebalance = await rebalanceModelPositions({
    currentPositions,
    newAllocations: input.allocations,
    priceProvider
  });
  const cumulativeCosts = (lastSnapshot?.cumulativeCostsUsdcAtomic ?? 0n) + modelRebalance.costUsdcAtomic;

  await db.delete(strategyModelPositions).where(eq(strategyModelPositions.strategyId, strategyId));
  await db.insert(strategyModelPositions).values(
    modelRebalance.positions.map((position) => ({
      strategyId,
      assetMint: position.assetMint,
      quantityAtomic: position.quantityAtomic.toString(),
      strategyVersion: nextVersion
    }))
  );
  const [updated] = await db
    .update(strategies)
    .set({ currentVersion: nextVersion })
    .where(eq(strategies.id, strategyId))
    .returning();
  await db.insert(strategyNavSnapshots).values({
    strategyId,
    navUsdcAtomic: modelRebalance.afterNavUsdcAtomic,
    strategyVersion: nextVersion,
    cumulativeCostsUsdcAtomic: cumulativeCosts
  });

  return hydrateStrategy(db, updated);
}

export async function listStrategistStrategies(db: Db, wallet: string): Promise<StrategyListItem[]> {
  const rows = await db
    .select()
    .from(strategies)
    .where(eq(strategies.creatorWallet, wallet))
    .orderBy(desc(strategies.createdAt));

  return Promise.all(rows.map((row) => hydrateStrategy(db, row)));
}

export async function recordInvestment(
  db: Db,
  strategyId: string,
  input: RecordInvestmentInput
): Promise<StrategyInvestment> {
  if (input.transactionSignatures.length === 0) {
    throw new Error("Cannot record investment without confirmed transaction signatures.");
  }

  const strategy = await getStrategy(db, strategyId);

  if (!strategy || strategy.status !== "ACTIVE") {
    throw new Error("Strategy not found or inactive.");
  }

  const [investment] = await db
    .insert(strategyInvestments)
    .values({
      strategyId,
      investorWallet: input.investorWallet,
      strategyVersion: strategy.currentVersion,
      initialAmountUsdcAtomic: BigInt(input.initialAmountUsdcAtomic)
    })
    .returning();

  await db.insert(investmentPositions).values(
    input.positions.map((position) => ({
      investmentId: investment.id,
      assetMint: position.assetMint,
      quantityAtomic: position.quantityAtomic
    }))
  );

  await db.insert(investorStrategyEvents).values({
    investmentId: investment.id,
    eventType: "INVEST",
    transactionSignatures: input.transactionSignatures
  });

  if (input.fee) {
    await db.insert(feeEvents).values({
      strategyId: strategy.id,
      investmentId: investment.id,
      investorWallet: input.investorWallet,
      strategistWallet: strategy.creatorWallet,
      eventType: "INVEST",
      actionAmountUsdcAtomic: BigInt(input.fee.actionAmountAtomic),
      strategistFeeUsdcAtomic: BigInt(input.fee.strategistFeeAtomic),
      protocolFeeUsdcAtomic: BigInt(input.fee.protocolFeeAtomic),
      transactionSignatures: input.fee.transactionSignatures
    });
  }

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
      currentVersion: strategy.currentVersion
    }
  };
}

export async function listInvestorInvestments(db: Db, wallet: string): Promise<StrategyInvestment[]> {
  const rows = await db
    .select({
      investment: strategyInvestments,
      strategy: strategies
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
          quantityAtomic: investmentPositions.quantityAtomic
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
          currentVersion: strategy.currentVersion
        }
      };
    })
  );
}

export async function getInvestment(db: Db, investmentId: string): Promise<StrategyInvestment | null> {
  const [row] = await db
    .select({
      investment: strategyInvestments,
      strategy: strategies
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
      quantityAtomic: investmentPositions.quantityAtomic
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
      currentVersion: row.strategy.currentVersion
    }
  };
}

export async function recordRebalance(
  db: Db,
  investmentId: string,
  input: RecordRebalanceInput
): Promise<StrategyInvestment> {
  if (input.transactionSignatures.length === 0) {
    throw new Error("Cannot record rebalance without confirmed transaction signatures.");
  }

  const current = await getInvestment(db, investmentId);

  if (!current || !current.strategy) {
    throw new Error("Investment not found.");
  }

  if (current.investorWallet !== input.investorWallet) {
    throw new Error("Only the investing wallet can record this rebalance.");
  }

  if (current.strategyVersion >= current.strategy.currentVersion) {
    throw new Error("Investment is already up to date.");
  }

  await db.delete(investmentPositions).where(eq(investmentPositions.investmentId, investmentId));
  await db.insert(investmentPositions).values(
    input.positions.map((position) => ({
      investmentId,
      assetMint: position.assetMint,
      quantityAtomic: position.quantityAtomic
    }))
  );

  await db.insert(investorStrategyEvents).values({
    investmentId,
    eventType: "REBALANCE",
    transactionSignatures: input.transactionSignatures,
    fromVersion: current.strategyVersion,
    toVersion: current.strategy.currentVersion
  });

  if (input.fee) {
    await db.insert(feeEvents).values({
      strategyId: current.strategyId,
      investmentId,
      investorWallet: input.investorWallet,
      strategistWallet: current.strategy.creatorWallet,
      eventType: "REBALANCE",
      actionAmountUsdcAtomic: BigInt(input.fee.actionAmountAtomic),
      strategistFeeUsdcAtomic: BigInt(input.fee.strategistFeeAtomic),
      protocolFeeUsdcAtomic: BigInt(input.fee.protocolFeeAtomic),
      transactionSignatures: input.fee.transactionSignatures
    });
  }

  const [updated] = await db
    .update(strategyInvestments)
    .set({ strategyVersion: current.strategy.currentVersion })
    .where(eq(strategyInvestments.id, investmentId))
    .returning();

  return {
    ...current,
    strategyVersion: updated.strategyVersion,
    positions: input.positions
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
