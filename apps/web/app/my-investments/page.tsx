"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { StrategyInvestment } from "@stratin/shared";
import { useStratInWallet } from "../components/wallet";
import { listInvestorInvestments } from "../lib/api";
import { formatAtomic, formatDate } from "../lib/format";

export default function MyInvestmentsPage() {
  const { hasMounted, walletAddress } = useStratInWallet();
  const [investments, setInvestments] = useState<StrategyInvestment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress) {
      return;
    }

    setIsLoading(true);
    void listInvestorInvestments(walletAddress)
      .then((response) => setInvestments(response.investments))
      .catch((loadError) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load investments.",
        ),
      )
      .finally(() => setIsLoading(false));
  }, [walletAddress]);

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
      <h1 className="text-3xl font-semibold text-white">My Investments</h1>
      {!walletAddress && hasMounted ? (
        <p className="mt-6 text-amber-200">
          Connect a wallet to view investments.
        </p>
      ) : null}
      {isLoading ? (
        <p className="mt-6 text-slate-300">Loading investments...</p>
      ) : null}
      {error ? <p className="mt-6 text-red-300">{error}</p> : null}
      <div className="mt-6 space-y-4">
        {investments.map((investment) => {
          const hasRebalance = Boolean(
            investment.strategy &&
            investment.strategyVersion < investment.strategy.currentVersion,
          );

          return (
            <Link
              className="block rounded-lg border border-white/10 bg-white/[0.04] p-5 hover:border-teal-300/40"
              href={
                hasRebalance
                  ? `/rebalance/${investment.id}`
                  : `/strategy/${investment.strategyId}`
              }
              key={investment.id}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    {investment.strategy?.name ?? "Strategy"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Joined {formatDate(investment.investedAt)}
                  </p>
                </div>
                <span
                  className={`text-sm ${hasRebalance ? "text-amber-200" : "text-teal-200"}`}
                >
                  {hasRebalance ? "Rebalance available" : "Up to date"}
                </span>
              </div>
              <div className="mt-5 grid gap-3 text-sm text-slate-300 sm:grid-cols-4">
                <p>
                  Initial Investment
                  <br />
                  <span className="text-white">
                    $
                    {formatAtomic(
                      BigInt(investment.initialAmountUsdcAtomic),
                      6,
                    )}
                  </span>
                </p>
                <p>
                  Your Version
                  <br />
                  <span className="text-white">
                    #{investment.strategyVersion}
                  </span>
                </p>
                <p>
                  Current Version
                  <br />
                  <span className="text-white">
                    #
                    {investment.strategy?.currentVersion ??
                      investment.strategyVersion}
                  </span>
                </p>
                <p>
                  Current Value
                  <br />
                  <span className="text-white">-</span>
                </p>
              </div>
              {hasRebalance ? (
                <p className="mt-4 text-sm text-amber-100">
                  Review Rebalance -&gt;
                </p>
              ) : null}
            </Link>
          );
        })}
      </div>
      {walletAddress && !isLoading && investments.length === 0 ? (
        <p className="mt-6 text-slate-300">No investments recorded yet.</p>
      ) : null}
    </main>
  );
}
