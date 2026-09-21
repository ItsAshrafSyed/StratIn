"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { StrategyListItem } from "@stratin/shared";
import { useStratInWallet } from "../components/wallet";
import { listStrategistStrategies } from "../lib/api";
import { formatAtomic, formatDate } from "../lib/format";

export default function MyStrategiesPage() {
  const { hasMounted, walletAddress } = useStratInWallet();
  const [strategies, setStrategies] = useState<StrategyListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress) {
      return;
    }

    setIsLoading(true);
    void listStrategistStrategies(walletAddress)
      .then((response) => setStrategies(response.strategies))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Failed to load strategies."))
      .finally(() => setIsLoading(false));
  }, [walletAddress]);

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold text-white">My Strategies</h1>
        <Link className="rounded-md bg-teal-300 px-4 py-2 text-sm font-semibold text-slate-950" href="/create">
          + Create Strategy
        </Link>
      </div>
      {!walletAddress && hasMounted ? <p className="mt-6 text-amber-200">Connect a wallet to view strategies.</p> : null}
      {isLoading ? <p className="mt-6 text-slate-300">Loading strategies...</p> : null}
      {error ? <p className="mt-6 text-red-300">{error}</p> : null}
      <div className="mt-6 space-y-4">
        {strategies.map((strategy) => (
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5" key={strategy.id}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">{strategy.name}</h2>
                <p className="mt-1 text-sm text-slate-400">Created {formatDate(strategy.createdAt)}</p>
              </div>
              <div className="flex gap-2">
                <Link className="rounded-md border border-white/10 px-3 py-2 text-sm text-white hover:bg-white/10" href={`/strategy/${strategy.id}`}>View</Link>
                <Link className="rounded-md border border-teal-300/40 px-3 py-2 text-sm text-teal-100 hover:bg-teal-300/10" href={`/manage/${strategy.id}`}>Manage</Link>
              </div>
            </div>
            <div className="mt-5 grid gap-3 text-sm text-slate-300 sm:grid-cols-4">
              <p>Investors<br /><span className="text-white">{strategy.investorCount}</span></p>
              <p>Capital Following<br /><span className="text-white">${formatAtomic(BigInt(strategy.capitalFollowingUsdcAtomic), 6)} USDC</span></p>
              <p>Strategy Earnings<br /><span className="text-white">{formatAtomic(BigInt(strategy.strategistEarningsUsdcAtomic ?? "0"), 6)} USDC</span></p>
              <p>Current Version<br /><span className="text-white">#{strategy.currentVersion}</span></p>
            </div>
          </div>
        ))}
      </div>
      {walletAddress && !isLoading && strategies.length === 0 ? <p className="mt-6 text-slate-300">No strategies created yet.</p> : null}
    </main>
  );
}
