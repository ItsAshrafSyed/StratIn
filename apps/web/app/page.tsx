"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  useConnect,
  useConnectedWallet,
  useDisconnect,
  useIsWalletReady,
  useWalletStatus,
  useWallets,
} from "@solana/kit-plugin-wallet/react";
import { SUPPORTED_TOKENIZED_EQUITIES } from "@stratin/shared";
import { shortenAddress } from "./lib/format";
import { solanaClient } from "./providers";

export default function Home() {
  const [hasMounted, setHasMounted] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const wallets = useWallets(solanaClient);
  const connectedWallet = useConnectedWallet(solanaClient);
  const isWalletReady = useIsWalletReady(solanaClient);
  const walletStatus = useWalletStatus(solanaClient);
  const { dispatchAsync: connectSelectedWallet, isRunning: isConnecting } =
    useConnect(solanaClient);
  const { dispatchAsync: disconnectWallet, isRunning: isDisconnecting } =
    useDisconnect(solanaClient);
  const walletAddress = connectedWallet?.account.address ?? null;
  const equities = useMemo(
    () =>
      SUPPORTED_TOKENIZED_EQUITIES.filter(
        (asset) => asset.assetClass === "tokenized-equity",
      ),
    [],
  );

  useEffect(() => {
    setHasMounted(true);
  }, []);

  async function handleConnectWallet(wallet: (typeof wallets)[number]) {
    setWalletError(null);

    if (!isWalletReady) {
      setWalletError("Wallet discovery is still warming up.");
      return;
    }

    try {
      await connectSelectedWallet(wallet);
      setIsWalletModalOpen(false);
    } catch (error) {
      setWalletError(
        error instanceof Error ? error.message : "Wallet connection failed.",
      );
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 sm:px-8">
      <header className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-teal-300">
            StratIn
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
            Tokenized-equity strategies, held in your wallet.
          </h1>
          <Link
            className="mt-3 inline-flex rounded-md border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
            href="/execution-spike"
          >
            Open execution spike
          </Link>
        </div>

        {!hasMounted ? (
          <button
            className="rounded-md bg-teal-300 px-4 py-2 text-sm font-semibold text-slate-950 opacity-60 shadow-lg shadow-teal-950/30"
            disabled
            type="button"
          >
            Finding wallets
          </button>
        ) : walletAddress ? (
          <button
            className="rounded-md border border-teal-300/40 bg-teal-300/10 px-4 py-2 text-sm font-medium text-teal-100"
            disabled={isDisconnecting}
            onClick={() => void disconnectWallet()}
            type="button"
          >
            {shortenAddress(walletAddress)}
          </button>
        ) : (
          <button
            className="rounded-md bg-teal-300 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-teal-950/30 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!isWalletReady}
            onClick={() => setIsWalletModalOpen(true)}
            type="button"
          >
            {isWalletReady ? "Connect Wallet" : "Finding wallets"}
          </button>
        )}
      </header>

      <section className="grid flex-1 items-start gap-6 py-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/20">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Stage 1 Checkpoint
              </h2>
              <p className="mt-1 text-sm text-slate-300">
                Open StratIn, connect Phantom, see wallet address.
              </p>
            </div>
            <div className="rounded-full border border-white/10 px-3 py-1 text-xs font-medium text-slate-300">
              {walletAddress ? "Connected" : "Waiting"}
            </div>
          </div>

          <div className="mt-6 rounded-md bg-black/30 p-4">
            <p className="text-sm text-slate-400">Connected wallet</p>
            <p className="mt-2 break-all text-base font-medium text-white">
              {walletAddress ?? "No wallet connected"}
            </p>
            <div className="mt-4 grid gap-2 text-sm text-slate-400 sm:grid-cols-3">
              <p>Status: {hasMounted ? walletStatus : "pending"}</p>
              <p>Wallets found: {hasMounted ? wallets.length : 0}</p>
              <p>
                Available:{" "}
                {hasMounted && wallets.length > 0
                  ? wallets.map((wallet) => wallet.name).join(", ")
                  : "none"}
              </p>
            </div>
            {walletError ? (
              <p className="mt-3 text-sm text-red-300">{walletError}</p>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Stage 2 Asset Registry
              </h2>
              <p className="mt-1 text-sm text-slate-300">
                Issuer-agnostic model, limited reviewed shortlist.
              </p>
            </div>
            <span className="rounded-full bg-amber-300/15 px-3 py-1 text-xs font-medium text-amber-100">
              Review
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {equities.map((asset) => (
              <div
                className="flex items-center justify-between gap-4 rounded-md border border-white/10 bg-black/20 px-4 py-3"
                key={asset.mint}
              >
                <div>
                  <p className="font-medium text-white">{asset.symbol}</p>
                  <p className="text-sm text-slate-400">{asset.name}</p>
                </div>
                <p className="text-right text-xs text-slate-400">
                  {asset.issuer}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {hasMounted && isWalletModalOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm"
          role="dialog"
        >
          <div className="w-full max-w-sm rounded-lg border border-white/10 bg-[#111217] p-5 shadow-2xl shadow-black/40">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Connect Wallet
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Choose an installed Solana wallet.
                </p>
              </div>
              <button
                aria-label="Close wallet modal"
                className="grid h-8 w-8 place-items-center rounded-md border border-white/10 text-lg leading-none text-slate-300 hover:bg-white/10"
                onClick={() => setIsWalletModalOpen(false)}
                type="button"
              >
                x
              </button>
            </div>

            <div className="mt-5 space-y-2">
              {wallets.length > 0 ? (
                wallets.map((wallet) => (
                  <button
                    className="flex w-full items-center justify-between rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm font-medium text-white hover:border-teal-300/50 hover:bg-teal-300/10 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isConnecting || !isWalletReady}
                    key={wallet.name}
                    onClick={() => void handleConnectWallet(wallet)}
                    type="button"
                  >
                    <span>{wallet.name}</span>
                    <span className="text-xs text-slate-400">
                      Wallet Standard
                    </span>
                  </button>
                ))
              ) : (
                <div className="rounded-md border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
                  No Solana wallets were discovered in this browser.
                </div>
              )}
            </div>

            {walletError ? (
              <p className="mt-4 text-sm text-red-300">{walletError}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
