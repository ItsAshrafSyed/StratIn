import { beforeEach, describe, expect, it } from "vitest";
import {
  SUPPORTED_TOKENIZED_EQUITIES,
  USDC_MINT,
  validateStrategyAllocations,
} from "@stratin/shared";

const [nvda, aapl, meta] = SUPPORTED_TOKENIZED_EQUITIES;

type Strategy = {
  id: string;
  creatorWallet: string;
  currentVersion: number;
  allocations: { assetMint: string; weightBps: number }[];
  versions: {
    version: number;
    allocations: { assetMint: string; weightBps: number }[];
  }[];
};

type Investment = {
  id: string;
  strategyId: string;
  investorWallet: string;
  strategyVersion: number;
  initialAmountUsdcAtomic: string;
  transactionSignatures: string[];
  positions: { assetMint: string; quantityAtomic: string }[];
};

type FeeEvent = {
  eventType: "INVEST" | "REBALANCE";
  investmentId: string;
  strategistFeeAtomic: string;
  protocolFeeAtomic: string;
  transactionSignatures: string[];
};

class MemoryMarketplace {
  strategies: Strategy[] = [];
  investments: Investment[] = [];
  feeEvents: FeeEvent[] = [];

  createStrategy(input: Omit<Strategy, "id" | "currentVersion" | "versions">) {
    validateStrategyAllocations(input.allocations);
    const strategy = {
      ...input,
      id: crypto.randomUUID(),
      currentVersion: 1,
      versions: [{ version: 1, allocations: input.allocations }],
    };
    this.strategies.push(strategy);
    return strategy;
  }

  publishRebalance(
    strategyId: string,
    creatorWallet: string,
    allocations: { assetMint: string; weightBps: number }[],
  ) {
    validateStrategyAllocations(allocations);
    const strategy = this.strategies.find((item) => item.id === strategyId);

    if (!strategy) {
      throw new Error("Strategy not found.");
    }

    if (strategy.creatorWallet !== creatorWallet) {
      throw new Error("Only the strategy creator can publish a rebalance.");
    }

    strategy.currentVersion += 1;
    strategy.versions.push({ version: strategy.currentVersion, allocations });
    return strategy;
  }

  recordInvestment(input: Omit<Investment, "id" | "strategyVersion">) {
    if (input.transactionSignatures.length === 0) {
      throw new Error(
        "Cannot record investment without confirmed transaction signatures.",
      );
    }

    const strategy = this.strategies.find(
      (item) => item.id === input.strategyId,
    );

    if (!strategy) {
      throw new Error("Strategy not found.");
    }

    const investment = {
      ...input,
      id: crypto.randomUUID(),
      strategyVersion: strategy.currentVersion,
    };
    this.investments.push(investment);
    return investment;
  }

  recordFeeEvent(input: FeeEvent) {
    if (input.transactionSignatures.length === 0) {
      throw new Error(
        "Cannot record fee event without confirmed transaction signatures.",
      );
    }

    const investment = this.investments.find(
      (item) => item.id === input.investmentId,
    );

    if (!investment) {
      throw new Error("Investment not found.");
    }

    this.feeEvents.push(input);
  }

  recordRebalance(
    investmentId: string,
    investorWallet: string,
    positions: Investment["positions"],
    signatures: string[],
  ) {
    if (signatures.length === 0) {
      throw new Error(
        "Cannot record rebalance without confirmed transaction signatures.",
      );
    }

    const investment = this.investments.find(
      (item) => item.id === investmentId,
    );

    if (!investment) {
      throw new Error("Investment not found.");
    }

    if (investment.investorWallet !== investorWallet) {
      throw new Error("Only the investing wallet can record this rebalance.");
    }

    const strategy = this.strategies.find(
      (item) => item.id === investment.strategyId,
    );

    if (!strategy) {
      throw new Error("Strategy not found.");
    }

    investment.strategyVersion = strategy.currentVersion;
    investment.positions = positions;
    investment.transactionSignatures = [
      ...investment.transactionSignatures,
      ...signatures,
    ];
    return investment;
  }

  investorCount(strategyId: string) {
    return new Set(
      this.investments
        .filter((investment) => investment.strategyId === strategyId)
        .map((investment) => investment.investorWallet),
    ).size;
  }

  capitalFollowing(strategyId: string) {
    return this.investments
      .filter((investment) => investment.strategyId === strategyId)
      .reduce(
        (sum, investment) => sum + BigInt(investment.initialAmountUsdcAtomic),
        0n,
      );
  }

  strategistEarnings(strategyId: string) {
    const strategy = this.strategies.find((item) => item.id === strategyId);

    if (!strategy) {
      return 0n;
    }

    return this.feeEvents
      .filter((fee) => {
        const investment = this.investments.find(
          (item) => item.id === fee.investmentId,
        );
        return investment?.strategyId === strategyId;
      })
      .reduce((sum, fee) => sum + BigInt(fee.strategistFeeAtomic), 0n);
  }
}

describe("marketplace business behavior", () => {
  let store: MemoryMarketplace;

  beforeEach(() => {
    store = new MemoryMarketplace();
  });

  it("rejects strategy weights that do not total 10,000 bps", () => {
    expect(() =>
      store.createStrategy({
        creatorWallet: "wallet-a",
        allocations: [
          { assetMint: nvda.mint, weightBps: 5000 },
          { assetMint: USDC_MINT, weightBps: 4000 },
        ],
      }),
    ).toThrow("Allocation weights must total 10000 bps.");
  });

  it("rejects duplicate asset mints", () => {
    expect(() =>
      store.createStrategy({
        creatorWallet: "wallet-a",
        allocations: [
          { assetMint: nvda.mint, weightBps: 5000 },
          { assetMint: nvda.mint, weightBps: 4000 },
          { assetMint: USDC_MINT, weightBps: 1000 },
        ],
      }),
    ).toThrow("Duplicate asset allocation");
  });

  it("rejects unsupported asset mints", () => {
    expect(() =>
      store.createStrategy({
        creatorWallet: "wallet-a",
        allocations: [
          {
            assetMint: "UnsupportedMint111111111111111111111111111111",
            weightBps: 9000,
          },
          { assetMint: USDC_MINT, weightBps: 1000 },
        ],
      }),
    ).toThrow("Unsupported asset allocation");
  });

  it("creates version 1 and persists allocations", () => {
    const strategy = store.createStrategy({
      creatorWallet: "wallet-a",
      allocations: [
        { assetMint: nvda.mint, weightBps: 3500 },
        { assetMint: aapl.mint, weightBps: 2500 },
        { assetMint: meta.mint, weightBps: 2000 },
        { assetMint: USDC_MINT, weightBps: 2000 },
      ],
    });

    expect(strategy.currentVersion).toBe(1);
    expect(strategy.allocations).toHaveLength(4);
    expect(strategy.allocations[0]).toEqual({
      assetMint: nvda.mint,
      weightBps: 3500,
    });
    expect(strategy.versions[0].allocations).toEqual(strategy.allocations);
  });

  it("does not record failed or partial execution as an investment", () => {
    const strategy = store.createStrategy({
      creatorWallet: "wallet-a",
      allocations: [
        { assetMint: nvda.mint, weightBps: 9000 },
        { assetMint: USDC_MINT, weightBps: 1000 },
      ],
    });

    expect(() =>
      store.recordInvestment({
        strategyId: strategy.id,
        investorWallet: "wallet-b",
        initialAmountUsdcAtomic: "10000000",
        transactionSignatures: [],
        positions: [{ assetMint: USDC_MINT, quantityAtomic: "1000000" }],
      }),
    ).toThrow(
      "Cannot record investment without confirmed transaction signatures.",
    );
    expect(store.investments).toHaveLength(0);
  });

  it("records successful investment against current strategy version", () => {
    const strategy = store.createStrategy({
      creatorWallet: "wallet-a",
      allocations: [
        { assetMint: nvda.mint, weightBps: 9000 },
        { assetMint: USDC_MINT, weightBps: 1000 },
      ],
    });
    const investment = store.recordInvestment({
      strategyId: strategy.id,
      investorWallet: "wallet-b",
      initialAmountUsdcAtomic: "10000000",
      transactionSignatures: ["sig-a"],
      positions: [{ assetMint: nvda.mint, quantityAtomic: "1000" }],
    });

    expect(investment.strategyVersion).toBe(1);
  });

  it("does not record failed fee settlement as a successful fee event", () => {
    const strategy = store.createStrategy({
      creatorWallet: "wallet-a",
      allocations: [
        { assetMint: nvda.mint, weightBps: 9000 },
        { assetMint: USDC_MINT, weightBps: 1000 },
      ],
    });
    const investment = store.recordInvestment({
      strategyId: strategy.id,
      investorWallet: "wallet-b",
      initialAmountUsdcAtomic: "10000000",
      transactionSignatures: ["sig-a"],
      positions: [{ assetMint: nvda.mint, quantityAtomic: "1000" }],
    });

    expect(() =>
      store.recordFeeEvent({
        eventType: "INVEST",
        investmentId: investment.id,
        strategistFeeAtomic: "20000",
        protocolFeeAtomic: "5000",
        transactionSignatures: [],
      }),
    ).toThrow("Cannot record fee event");
    expect(store.feeEvents).toHaveLength(0);
  });

  it("aggregates investor count and capital following", () => {
    const strategy = store.createStrategy({
      creatorWallet: "wallet-a",
      allocations: [
        { assetMint: nvda.mint, weightBps: 9000 },
        { assetMint: USDC_MINT, weightBps: 1000 },
      ],
    });

    store.recordInvestment({
      strategyId: strategy.id,
      investorWallet: "wallet-b",
      initialAmountUsdcAtomic: "10000000",
      transactionSignatures: ["sig-a"],
      positions: [{ assetMint: nvda.mint, quantityAtomic: "1000" }],
    });
    store.recordInvestment({
      strategyId: strategy.id,
      investorWallet: "wallet-c",
      initialAmountUsdcAtomic: "40000000",
      transactionSignatures: ["sig-b"],
      positions: [{ assetMint: nvda.mint, quantityAtomic: "4000" }],
    });

    expect(store.investorCount(strategy.id)).toBe(2);
    expect(store.capitalFollowing(strategy.id)).toBe(50_000_000n);
  });

  it("aggregates strategist earnings from recorded fee events", () => {
    const strategy = store.createStrategy({
      creatorWallet: "wallet-a",
      allocations: [
        { assetMint: nvda.mint, weightBps: 9000 },
        { assetMint: USDC_MINT, weightBps: 1000 },
      ],
    });
    const investment = store.recordInvestment({
      strategyId: strategy.id,
      investorWallet: "wallet-b",
      initialAmountUsdcAtomic: "10000000",
      transactionSignatures: ["sig-a"],
      positions: [{ assetMint: nvda.mint, quantityAtomic: "1000" }],
    });

    store.recordFeeEvent({
      eventType: "INVEST",
      investmentId: investment.id,
      strategistFeeAtomic: "20000",
      protocolFeeAtomic: "5000",
      transactionSignatures: ["fee-sig"],
    });

    expect(store.strategistEarnings(strategy.id)).toBe(20_000n);
  });

  it("keeps version 1 unchanged and creates version 2 for a creator rebalance", () => {
    const strategy = store.createStrategy({
      creatorWallet: "wallet-a",
      allocations: [
        { assetMint: nvda.mint, weightBps: 9000 },
        { assetMint: USDC_MINT, weightBps: 1000 },
      ],
    });
    const versionOne = strategy.versions[0].allocations;

    store.publishRebalance(strategy.id, "wallet-a", [
      { assetMint: nvda.mint, weightBps: 5000 },
      { assetMint: aapl.mint, weightBps: 4000 },
      { assetMint: USDC_MINT, weightBps: 1000 },
    ]);

    expect(strategy.currentVersion).toBe(2);
    expect(strategy.versions[0].allocations).toBe(versionOne);
    expect(strategy.versions[1].allocations).toEqual([
      { assetMint: nvda.mint, weightBps: 5000 },
      { assetMint: aapl.mint, weightBps: 4000 },
      { assetMint: USDC_MINT, weightBps: 1000 },
    ]);
  });

  it("rejects rebalance publishing from a non-creator wallet", () => {
    const strategy = store.createStrategy({
      creatorWallet: "wallet-a",
      allocations: [
        { assetMint: nvda.mint, weightBps: 9000 },
        { assetMint: USDC_MINT, weightBps: 1000 },
      ],
    });

    expect(() =>
      store.publishRebalance(strategy.id, "wallet-b", [
        { assetMint: nvda.mint, weightBps: 5000 },
        { assetMint: USDC_MINT, weightBps: 5000 },
      ]),
    ).toThrow("Only the strategy creator");
  });

  it("detects a pending investor rebalance and only updates version after success", () => {
    const strategy = store.createStrategy({
      creatorWallet: "wallet-a",
      allocations: [
        { assetMint: nvda.mint, weightBps: 9000 },
        { assetMint: USDC_MINT, weightBps: 1000 },
      ],
    });
    const investment = store.recordInvestment({
      strategyId: strategy.id,
      investorWallet: "wallet-b",
      initialAmountUsdcAtomic: "10000000",
      transactionSignatures: ["sig-a"],
      positions: [{ assetMint: nvda.mint, quantityAtomic: "1000" }],
    });

    store.publishRebalance(strategy.id, "wallet-a", [
      { assetMint: nvda.mint, weightBps: 5000 },
      { assetMint: aapl.mint, weightBps: 4000 },
      { assetMint: USDC_MINT, weightBps: 1000 },
    ]);

    expect(investment.strategyVersion < strategy.currentVersion).toBe(true);
    expect(() =>
      store.recordRebalance(
        investment.id,
        "wallet-b",
        investment.positions,
        [],
      ),
    ).toThrow("Cannot record rebalance");
    expect(investment.strategyVersion).toBe(1);

    store.recordRebalance(
      investment.id,
      "wallet-b",
      [
        { assetMint: nvda.mint, quantityAtomic: "500" },
        { assetMint: aapl.mint, quantityAtomic: "400" },
        { assetMint: USDC_MINT, quantityAtomic: "1000000" },
      ],
      ["sig-rebalance"],
    );

    expect(investment.strategyVersion).toBe(2);
  });
});
