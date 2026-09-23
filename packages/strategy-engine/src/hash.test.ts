import { describe, expect, it } from "vitest";
import {
  canonicalizeAllocationForHash,
  hashStrategyAllocation,
  SUPPORTED_TOKENIZED_EQUITIES,
  USDC_MINT,
} from "@stratin/shared";

const [nvda, aapl, meta] = SUPPORTED_TOKENIZED_EQUITIES;

describe("strategy allocation hashing", () => {
  const allocation = [
    { assetMint: nvda.mint, weightBps: 3000 },
    { assetMint: aapl.mint, weightBps: 2500 },
    { assetMint: meta.mint, weightBps: 2000 },
    { assetMint: USDC_MINT, weightBps: 2500 },
  ];

  it("canonicalizes allocation by mint address", () => {
    expect(canonicalizeAllocationForHash(allocation)).toBe(
      [
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v:2500",
        "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu:2000",
        "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp:2500",
        "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh:3000",
      ].join("\n"),
    );
  });

  it("keeps hash stable when UI ordering changes", async () => {
    const reversed = [...allocation].reverse();

    await expect(hashStrategyAllocation(reversed)).resolves.toBe(
      await hashStrategyAllocation(allocation),
    );
  });

  it("matches the known deterministic test vector", async () => {
    await expect(hashStrategyAllocation(allocation)).resolves.toBe(
      "06aa8989e781f6b3030a6cfd201f6df017a33f841844109dab558db70caa7362",
    );
  });

  it("changes when weight or mint changes", async () => {
    await expect(
      hashStrategyAllocation([
        { ...allocation[0], weightBps: 2000 },
        { ...allocation[1], weightBps: 3500 },
        allocation[2],
        allocation[3],
      ]),
    ).resolves.not.toBe(
      "06aa8989e781f6b3030a6cfd201f6df017a33f841844109dab558db70caa7362",
    );
  });
});
