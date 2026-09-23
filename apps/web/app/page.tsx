"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { StrategyListItem } from "@stratin/shared";
import { listStrategies } from "./lib/api";
import { allocationSymbols } from "./lib/assets";
import { shortenAddress } from "./lib/format";

export default function HomePage() {
  const [strategies, setStrategies] = useState<StrategyListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listStrategies()
      .then((response) => setStrategies(response.strategies))
      .catch((loadError) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load strategies.",
        ),
      )
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-white">Explore</h1>
          <p className="mt-2 text-sm text-slate-300">
            Published tokenized-equity strategies.
          </p>
        </div>
        <Link
          className="rounded-md bg-teal-300 px-4 py-2 text-sm font-semibold text-slate-950"
          href="/create"
        >
          + Create Strategy
        </Link>
      </div>
      {isLoading ? (
        <p className="mt-6 text-slate-300">Loading strategies...</p>
      ) : null}
      {error ? <p className="mt-6 text-red-300">{error}</p> : null}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {strategies.map((strategy) => (
          <Link
            className="rounded-lg border border-white/10 bg-white/[0.04] p-5 hover:border-teal-300/40"
            href={`/strategy/${strategy.id}`}
            key={strategy.id}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {strategy.name}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  by {shortenAddress(strategy.creatorWallet)}
                </p>
              </div>
              <span className="text-sm text-slate-300">
                View Strategy {"->"}
              </span>
            </div>
            <p className="mt-4 text-sm text-slate-300">
              {strategy.description}
            </p>
            <p className="mt-4 text-sm text-teal-100">
              {allocationSymbols(strategy.allocations)}
            </p>
            <div className="mt-5 grid grid-cols-4 gap-2 text-sm text-slate-400">
              <p>
                1W
                <br />
                <span className="text-white">-</span>
              </p>
              <p>
                1M
                <br />
                <span className="text-white">-</span>
              </p>
              <p>
                3M
                <br />
                <span className="text-white">-</span>
              </p>
              <p>
                ALL
                <br />
                <span className="text-white">-</span>
              </p>
            </div>
            <p className="mt-5 text-sm text-slate-300">
              Investors {strategy.investorCount}
            </p>
          </Link>
        ))}
      </div>
      {!isLoading && strategies.length === 0 ? (
        <p className="mt-8 text-slate-300">No strategies yet.</p>
      ) : null}
    </main>
  );
}
