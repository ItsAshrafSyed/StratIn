import { z } from "zod";
import { getSupportedAssetByMint } from "./assets";
import type { FeeEventType } from "./fees";

export const STRATEGY_STATUS = ["ACTIVE", "CLOSED"] as const;
export const INVESTOR_EVENT_TYPES = ["INVEST", "REBALANCE"] as const;
export const VERIFICATION_STATUS = [
  "UNVERIFIED",
  "PENDING",
  "VERIFIED",
  "FAILED",
] as const;

export const strategyAllocationSchema = z.object({
  assetMint: z.string().min(1),
  weightBps: z.number().int().positive().max(10_000),
});

export const createStrategySchema = z.object({
  creatorWallet: z.string().min(32),
  name: z
    .string()
    .trim()
    .min(2, "Strategy name must be at least 2 characters.")
    .max(80, "Strategy name must be at most 80 characters."),
  description: z
    .string()
    .trim()
    .min(8, "Description must be at least 8 characters.")
    .max(500, "Description must be at most 500 characters."),
  allocations: z.array(strategyAllocationSchema).min(1),
  registryCommitment: z
    .object({
      strategyIdHex: z.string().regex(/^[0-9a-f]{32}$/),
      allocationHash: z.string().regex(/^[0-9a-f]{64}$/),
      transactionSignature: z.string().min(32),
      strategyPda: z.string().min(32),
      versionPda: z.string().min(32),
    })
    .optional(),
});

export const recordInvestmentSchema = z.object({
  investorWallet: z.string().min(32),
  initialAmountUsdcAtomic: z.string().regex(/^\d+$/),
  fee: z
    .object({
      actionAmountAtomic: z.string().regex(/^\d+$/),
      strategistFeeAtomic: z.string().regex(/^\d+$/),
      protocolFeeAtomic: z.string().regex(/^\d+$/),
      transactionSignatures: z.array(z.string().min(32)).min(1),
    })
    .optional(),
  transactionSignatures: z.array(z.string().min(32)).min(1),
  positions: z
    .array(
      z.object({
        assetMint: z.string().min(1),
        quantityAtomic: z.string().regex(/^\d+$/),
      }),
    )
    .min(1),
});

export const publishRebalanceSchema = z.object({
  creatorWallet: z.string().min(32),
  allocations: z.array(strategyAllocationSchema).min(1),
  registryCommitment: z
    .object({
      allocationHash: z.string().regex(/^[0-9a-f]{64}$/),
      transactionSignature: z.string().min(32),
      strategyPda: z.string().min(32),
      versionPda: z.string().min(32),
    })
    .optional(),
});

export const recordRebalanceSchema = z.object({
  investorWallet: z.string().min(32),
  fee: z
    .object({
      actionAmountAtomic: z.string().regex(/^\d+$/),
      strategistFeeAtomic: z.string().regex(/^\d+$/),
      protocolFeeAtomic: z.string().regex(/^\d+$/),
      transactionSignatures: z.array(z.string().min(32)).min(1),
    })
    .optional(),
  transactionSignatures: z.array(z.string().min(32)).min(1),
  positions: z
    .array(
      z.object({
        assetMint: z.string().min(1),
        quantityAtomic: z.string().regex(/^\d+$/),
      }),
    )
    .min(1),
});

export type StrategyAllocationDto = z.infer<typeof strategyAllocationSchema>;
export type CreateStrategyInput = z.infer<typeof createStrategySchema>;
export type RecordInvestmentInput = z.infer<typeof recordInvestmentSchema>;
export type PublishRebalanceInput = z.infer<typeof publishRebalanceSchema>;
export type RecordRebalanceInput = z.infer<typeof recordRebalanceSchema>;
export type StrategyStatus = (typeof STRATEGY_STATUS)[number];
export type InvestorEventType = (typeof INVESTOR_EVENT_TYPES)[number];
export type VerificationStatus = (typeof VERIFICATION_STATUS)[number];

export type StrategyNavSnapshotDto = {
  timestamp: string;
  navUsdcAtomic: string;
  strategyVersion: number;
  cumulativeCostsUsdcAtomic: string;
};

export type StrategyPerformanceDto = {
  oneWeek: string | null;
  oneMonth: string | null;
  threeMonths: string | null;
  sinceInception: string | null;
};

export type StrategyVersionDto = {
  id: string;
  version: number;
  createdAt: string;
  allocations: StrategyAllocationDto[];
  allocationHash: string | null;
  solanaTransactionSignature: string | null;
  registryStrategyPda: string | null;
  registryVersionPda: string | null;
  verifiedAt: string | null;
  verificationStatus: VerificationStatus;
};

export type StrategyListItem = {
  id: string;
  creatorWallet: string;
  registryStrategyIdHex: string | null;
  registryStrategyPda: string | null;
  name: string;
  description: string;
  currentVersion: number;
  status: StrategyStatus;
  createdAt: string;
  allocations: StrategyAllocationDto[];
  investorCount: number;
  capitalFollowingUsdcAtomic: string;
  latestNavSnapshot?: StrategyNavSnapshotDto | null;
  performance?: StrategyPerformanceDto;
  strategistEarningsUsdcAtomic?: string;
};

export type StrategyDetail = StrategyListItem & {
  strategistStrategyCount: number;
  versions?: StrategyVersionDto[];
};

export type InvestmentPositionDto = {
  assetMint: string;
  quantityAtomic: string;
};

export type StrategyInvestment = {
  id: string;
  strategyId: string;
  investorWallet: string;
  strategyVersion: number;
  initialAmountUsdcAtomic: string;
  investedAt: string;
  strategy?: Pick<
    StrategyListItem,
    "id" | "name" | "creatorWallet" | "currentVersion"
  >;
  positions?: InvestmentPositionDto[];
};

export type FeeEventDto = {
  id: string;
  strategyId: string;
  investmentId: string;
  investorWallet: string;
  strategistWallet: string;
  eventType: FeeEventType;
  actionAmountAtomic: string;
  strategistFeeAtomic: string;
  protocolFeeAtomic: string;
  transactionSignatures: string[];
  createdAt: string;
};

export function validateStrategyAllocations(
  allocations: readonly StrategyAllocationDto[],
) {
  const seen = new Set<string>();
  let totalWeightBps = 0;

  for (const allocation of allocations) {
    if (seen.has(allocation.assetMint)) {
      throw new Error(`Duplicate asset allocation: ${allocation.assetMint}`);
    }

    if (!getSupportedAssetByMint(allocation.assetMint)) {
      throw new Error(`Unsupported asset allocation: ${allocation.assetMint}`);
    }

    seen.add(allocation.assetMint);
    totalWeightBps += allocation.weightBps;
  }

  if (totalWeightBps !== 10_000) {
    throw new Error("Allocation weights must total 10000 bps.");
  }
}

export function canonicalizeAllocationForHash(
  allocations: readonly StrategyAllocationDto[],
) {
  validateStrategyAllocations(allocations);
  return [...allocations]
    .sort((a, b) => a.assetMint.localeCompare(b.assetMint))
    .map((allocation) => `${allocation.assetMint}:${allocation.weightBps}`)
    .join("\n");
}

export async function hashStrategyAllocation(
  allocations: readonly StrategyAllocationDto[],
) {
  const canonical = canonicalizeAllocationForHash(allocations);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
