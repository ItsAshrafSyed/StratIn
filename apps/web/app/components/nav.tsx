"use client";

import Link from "next/link";
import { useState } from "react";
import { WalletButton } from "./wallet";

export function AppNav() {
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <header className="border-b border-white/10 bg-black/20">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-5 px-5 py-4 sm:px-8">
          <Link className="text-lg font-semibold text-white" href="/">
            StratIn
          </Link>
          <nav className="flex flex-1 items-center gap-4 text-sm text-slate-300">
            <Link className="hover:text-white" href="/">
              Explore
            </Link>
            <Link className="hover:text-white" href="/my-investments">
              My Investments
            </Link>
            <Link className="hover:text-white" href="/my-strategies">
              My Strategies
            </Link>
          </nav>
          <WalletButton onError={setError} />
        </div>
      </header>
      {error ? (
        <div className="mx-auto mt-3 w-full max-w-6xl px-5 text-sm text-red-300 sm:px-8">
          {error}
        </div>
      ) : null}
    </>
  );
}
