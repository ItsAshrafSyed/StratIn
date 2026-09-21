"use client";

import { useEffect, useMemo, useState } from "react";
import { getBase58Decoder } from "@solana/kit";
import {
  SUPPORTED_TOKENIZED_EQUITIES,
  hashStrategyAllocation,
  validateStrategyAllocations,
  type StrategyAllocationDto,
  type StrategyDetail
} from "@stratin/shared";
import { useStratInWallet } from "../../components/wallet";
import { getStrategy, publishRebalance } from "../../lib/api";
import { getAsset } from "../../lib/assets";
import { formatAtomic, formatDate } from "../../lib/format";
import { confirmRegistrySignature } from "../../lib/registry-rpc";
import { buildPublishRebalanceCommitmentTransaction } from "../../lib/strategy-registry";

type DraftAllocation = StrategyAllocationDto & { key: string };

function totalBps(allocations: readonly DraftAllocation[]) {
  return allocations.reduce((sum, allocation) => sum + allocation.weightBps, 0);
}

function hasSignAndSendTransactions(
  signer: unknown
): signer is {
  signAndSendTransactions(transactions: readonly unknown[]): Promise<readonly Uint8Array[]>;
} {
  return (
    typeof signer === "object" &&
    signer !== null &&
    "signAndSendTransactions" in signer &&
    typeof signer.signAndSendTransactions === "function"
  );
}

export default function ManageStrategyPage({ params }: { params: Promise<{ strategyId: string }> }) {
  const [strategyId, setStrategyId] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<StrategyDetail | null>(null);
  const [draftAllocations, setDraftAllocations] = useState<DraftAllocation[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { walletAddress, connectedWallet } = useStratInWallet();
  const isCreator = Boolean(strategy && walletAddress === strategy.creatorWallet);
  const draftTotalBps = useMemo(() => totalBps(draftAllocations), [draftAllocations]);

  useEffect(() => {
    void params.then(({ strategyId: id }) => setStrategyId(id));
  }, [params]);

  useEffect(() => {
    if (!strategyId) {
      return;
    }

    void getStrategy(strategyId)
      .then((response) => {
        setStrategy(response.strategy);
        setDraftAllocations(
          response.strategy.allocations.map((allocation) => ({
            ...allocation,
            key: allocation.assetMint
          }))
        );
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Failed to load strategy."));
  }, [strategyId]);

  function updateDraft(index: number, updates: Partial<StrategyAllocationDto>) {
    setDraftAllocations((current) =>
      current.map((allocation, allocationIndex) =>
        allocationIndex === index ? { ...allocation, ...updates } : allocation
      )
    );
  }

  function addAsset() {
    const selected = new Set(draftAllocations.map((allocation) => allocation.assetMint));
    const nextAsset = SUPPORTED_TOKENIZED_EQUITIES.find((asset) => !selected.has(asset.mint));

    if (nextAsset) {
      setDraftAllocations((current) => [
        ...current,
        { key: crypto.randomUUID(), assetMint: nextAsset.mint, weightBps: 0 }
      ]);
    }
  }

  async function handlePublish() {
    if (!strategyId || !walletAddress) {
      setError("Connect the creator wallet before publishing a rebalance.");
      return;
    }

    setIsPublishing(true);
    setError(null);
    setSuccess(null);

    try {
      if (!strategy?.registryStrategyPda) {
        throw new Error("This strategy was created before registry commitments. Create a fresh verified strategy before publishing on-chain verified rebalances.");
      }

      if (!connectedWallet?.signer || !hasSignAndSendTransactions(connectedWallet.signer)) {
        throw new Error("Connected wallet does not expose Kit signAndSendTransactions.");
      }

      const allocations = draftAllocations.map(({ assetMint, weightBps }) => ({ assetMint, weightBps }));
      validateStrategyAllocations(allocations);
      const allocationHash = await hashStrategyAllocation(allocations);
      const nextVersion = strategy.currentVersion + 1;
      const commitment = await buildPublishRebalanceCommitmentTransaction({
        creatorWallet: walletAddress,
        allocationHash,
        registryStrategyPda: strategy.registryStrategyPda,
        nextVersion
      });
      const [signatureBytes] = await connectedWallet.signer.signAndSendTransactions([commitment.transaction]);
      const transactionSignature = signatureBytes ? getBase58Decoder().decode(signatureBytes) : "";

      if (!transactionSignature) {
        throw new Error("Wallet did not return a registry transaction signature.");
      }

      await confirmRegistrySignature(transactionSignature);
      const response = await publishRebalance(strategyId, {
        creatorWallet: walletAddress,
        allocations,
        registryCommitment: {
          allocationHash,
          transactionSignature,
          strategyPda: commitment.strategyPda,
          versionPda: commitment.versionPda
        }
      });
      setStrategy(response.strategy);
      setSuccess(`Version #${response.strategy.currentVersion} published.`);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Failed to publish rebalance.");
    } finally {
      setIsPublishing(false);
    }
  }

  if (error && !strategy) {
    return <main className="mx-auto max-w-5xl px-5 py-8 text-red-300 sm:px-8">{error}</main>;
  }

  if (!strategy) {
    return <main className="mx-auto max-w-5xl px-5 py-8 text-slate-300 sm:px-8">Loading strategy...</main>;
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
      <h1 className="text-3xl font-semibold text-white">{strategy.name}</h1>
      <p className="mt-2 text-slate-300">{strategy.description}</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300">Version<br /><span className="text-xl text-white">#{strategy.currentVersion}</span></div>
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300">Investors<br /><span className="text-xl text-white">{strategy.investorCount}</span></div>
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300">Capital Following<br /><span className="text-xl text-white">${formatAtomic(BigInt(strategy.capitalFollowingUsdcAtomic), 6)}</span></div>
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300">Created<br /><span className="text-xl text-white">{formatDate(strategy.createdAt)}</span></div>
      </div>
      <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.04] p-5">
        <h2 className="text-lg font-semibold text-white">Current Strategy - Version {strategy.currentVersion}</h2>
        <div className="mt-4 space-y-3">
          {strategy.allocations.map((allocation) => (
            <div className="flex justify-between text-sm" key={allocation.assetMint}>
              <span className="text-white">{getAsset(allocation.assetMint)?.symbol ?? allocation.assetMint}</span>
              <span className="text-slate-300">{allocation.weightBps / 100}%</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.04] p-5">
        <h2 className="text-lg font-semibold text-white">Rebalance Strategy</h2>
        {!isCreator ? <p className="mt-3 text-sm text-amber-200">Connect the creator wallet to publish a new version.</p> : null}
        <div className="mt-4 space-y-3">
          {draftAllocations.map((allocation, index) => (
            <div className="grid gap-3 sm:grid-cols-[1fr_8rem_2rem]" key={allocation.key}>
              <select
                className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-white"
                disabled={!isCreator}
                value={allocation.assetMint}
                onChange={(event) => updateDraft(index, { assetMint: event.target.value })}
              >
                {SUPPORTED_TOKENIZED_EQUITIES.map((asset) => (
                  <option key={asset.mint} value={asset.mint}>{asset.symbol}</option>
                ))}
              </select>
              <input
                className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-right text-white"
                disabled={!isCreator}
                inputMode="numeric"
                value={allocation.weightBps / 100}
                onChange={(event) => updateDraft(index, { weightBps: Math.round(Number(event.target.value) * 100) })}
              />
              <button
                className="rounded-md border border-white/10 text-slate-300 disabled:opacity-50"
                disabled={!isCreator || draftAllocations.length <= 1}
                onClick={() => setDraftAllocations((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                type="button"
              >
                x
              </button>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-4 text-sm">
          <button className="rounded-md border border-teal-300/40 px-3 py-2 text-teal-100 disabled:opacity-50" disabled={!isCreator} onClick={addAsset} type="button">+ Add asset</button>
          <span className={draftTotalBps === 10_000 ? "text-teal-200" : "text-amber-200"}>{draftTotalBps / 100}%</span>
        </div>

        <div className="mt-6">
          <h3 className="font-semibold text-white">Review Rebalance</h3>
          <div className="mt-3 space-y-2 text-sm">
            {draftAllocations.map((allocation) => {
              const previous = strategy.allocations.find((item) => item.assetMint === allocation.assetMint);
              return (
                <div className="grid grid-cols-3 gap-3 border-b border-white/10 py-2" key={allocation.key}>
                  <span className="text-white">{getAsset(allocation.assetMint)?.symbol ?? allocation.assetMint}</span>
                  <span className="text-slate-400">{previous ? `${previous.weightBps / 100}%` : "0%"}</span>
                  <span className="text-teal-100">to {allocation.weightBps / 100}%</span>
                </div>
              );
            })}
          </div>
        </div>
        <button className="mt-5 rounded-md bg-teal-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60" disabled={!isCreator || isPublishing || draftTotalBps !== 10_000} onClick={() => void handlePublish()} type="button">
          {isPublishing ? "Publishing" : "Publish Rebalance"}
        </button>
        {success ? <p className="mt-4 text-sm text-teal-200">{success}</p> : null}
        {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
      </section>
    </main>
  );
}
