"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { getBase58Decoder } from "@solana/kit";
import { SUPPORTED_TOKENIZED_EQUITIES, hashStrategyAllocation, validateStrategyAllocations } from "@stratin/shared";
import { createStrategy } from "../lib/api";
import { useStratInWallet } from "../components/wallet";
import { confirmRegistrySignature } from "../lib/registry-rpc";
import { buildCreateStrategyCommitmentTransaction } from "../lib/strategy-registry";

type DraftAllocation = { assetMint: string; weightBps: number };

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

export default function CreateStrategyPage() {
  const router = useRouter();
  const { hasMounted, walletAddress, connectedWallet } = useStratInWallet();
  const [name, setName] = useState("AI Compounders");
  const [description, setDescription] = useState("Companies positioned around AI infrastructure and growth.");
  const [allocations, setAllocations] = useState<DraftAllocation[]>([
    { assetMint: SUPPORTED_TOKENIZED_EQUITIES[0].mint, weightBps: 3500 },
    { assetMint: SUPPORTED_TOKENIZED_EQUITIES[2].mint, weightBps: 2500 },
    { assetMint: SUPPORTED_TOKENIZED_EQUITIES[3].mint, weightBps: 2000 },
    { assetMint: SUPPORTED_TOKENIZED_EQUITIES[1].mint, weightBps: 1000 },
    { assetMint: SUPPORTED_TOKENIZED_EQUITIES[5].mint, weightBps: 1000 }
  ]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishStatus, setPublishStatus] = useState<string | null>(null);
  const totalBps = allocations.reduce((sum, allocation) => sum + allocation.weightBps, 0);
  const canPublish = hasMounted && walletAddress && totalBps === 10_000 && !isPublishing;
  const usedMints = useMemo(() => new Set(allocations.map((allocation) => allocation.assetMint)), [allocations]);

  function updateAllocation(index: number, patch: Partial<DraftAllocation>) {
    setAllocations((current) =>
      current.map((allocation, allocationIndex) =>
        allocationIndex === index ? { ...allocation, ...patch } : allocation
      )
    );
  }

  function addAsset() {
    const nextAsset = SUPPORTED_TOKENIZED_EQUITIES.find((asset) => !usedMints.has(asset.mint));
    if (nextAsset) {
      setAllocations((current) => [...current, { assetMint: nextAsset.mint, weightBps: 0 }]);
    }
  }

  async function publish() {
    if (!walletAddress) {
      setError("Connect a wallet before publishing.");
      return;
    }

    setIsPublishing(true);
    setError(null);
    setPublishStatus(null);

    try {
      validateStrategyAllocations(allocations);
      if (!connectedWallet?.signer || !hasSignAndSendTransactions(connectedWallet.signer)) {
        throw new Error("Connected wallet does not expose Kit signAndSendTransactions.");
      }

      const allocationHash = await hashStrategyAllocation(allocations);
      setPublishStatus("Requesting strategy-registry signature...");
      const commitment = await buildCreateStrategyCommitmentTransaction({
        creatorWallet: walletAddress,
        allocationHash
      });
      const [signatureBytes] = await connectedWallet.signer.signAndSendTransactions([commitment.transaction]);
      const transactionSignature = signatureBytes ? getBase58Decoder().decode(signatureBytes) : "";

      if (!transactionSignature) {
        throw new Error("Wallet did not return a registry transaction signature.");
      }

      setPublishStatus("Confirming registry commitment...");
      await confirmRegistrySignature(transactionSignature);
      setPublishStatus("Persisting verified strategy...");
      const response = await createStrategy({
        creatorWallet: walletAddress,
        name,
        description,
        allocations,
        registryCommitment: {
          strategyIdHex: commitment.strategyIdHex ?? "",
          allocationHash,
          transactionSignature,
          strategyPda: commitment.strategyPda,
          versionPda: commitment.versionPda
        }
      });
      router.push(`/strategy/${response.strategy.id}`);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Strategy publish failed.");
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-white">Create a Strategy</h1>
        <p className="mt-2 text-sm text-slate-300">Publish version 1 with supported tokenized-equity assets.</p>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
        <div className="grid gap-5">
          <label>
            <span className="text-sm text-slate-300">Strategy name</span>
            <input className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:border-teal-300/60" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            <span className="text-sm text-slate-300">Description</span>
            <textarea className="mt-2 min-h-24 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:border-teal-300/60" value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Portfolio</h2>
            <span className={totalBps === 10_000 ? "text-sm text-teal-200" : "text-sm text-red-300"}>
              {(totalBps / 100).toFixed(2)}%
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {allocations.map((allocation, index) => (
              <div className="grid grid-cols-[1fr_7rem_2rem] gap-3" key={`${allocation.assetMint}-${index}`}>
                <select
                  className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-white"
                  value={allocation.assetMint}
                  onChange={(event) => updateAllocation(index, { assetMint: event.target.value })}
                >
                  {SUPPORTED_TOKENIZED_EQUITIES.map((asset) => (
                    <option disabled={usedMints.has(asset.mint) && asset.mint !== allocation.assetMint} key={asset.mint} value={asset.mint}>
                      {asset.symbol}
                    </option>
                  ))}
                </select>
                <input
                  className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-right text-white"
                  inputMode="numeric"
                  value={allocation.weightBps / 100}
                  onChange={(event) =>
                    updateAllocation(index, { weightBps: Math.round(Number(event.target.value || 0) * 100) })
                  }
                />
                <button className="rounded-md border border-white/10 text-slate-300 hover:bg-white/10" onClick={() => setAllocations((current) => current.filter((_, itemIndex) => itemIndex !== index))} type="button">
                  x
                </button>
              </div>
            ))}
          </div>
          <button className="mt-4 rounded-md border border-white/10 px-3 py-2 text-sm text-white hover:bg-white/10" onClick={addAsset} type="button">
            + Add asset
          </button>
        </div>

        {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
        {publishStatus ? <p className="mt-4 text-sm text-teal-200">{publishStatus}</p> : null}
        {!walletAddress && hasMounted ? <p className="mt-4 text-sm text-amber-200">Connect a wallet to publish.</p> : null}

        <div className="mt-6 flex justify-end">
          <button className="rounded-md bg-teal-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60" disabled={!canPublish} onClick={() => void publish()} type="button">
            {isPublishing ? "Publishing" : "Publish Strategy"}
          </button>
        </div>
      </div>
    </main>
  );
}
