"use client";

import { useEffect, useState } from "react";
import {
  useConnect,
  useConnectedWallet,
  useDisconnect,
  useIsWalletReady,
  useWallets
} from "@solana/kit-plugin-wallet/react";
import { solanaClient } from "../providers";
import { shortenAddress } from "../lib/format";

export function useStratInWallet() {
  const [hasMounted, setHasMounted] = useState(false);
  const wallets = useWallets(solanaClient);
  const connectedWallet = useConnectedWallet(solanaClient);
  const isWalletReady = useIsWalletReady(solanaClient);
  const { dispatchAsync: connectSelectedWallet, isRunning: isConnecting } =
    useConnect(solanaClient);
  const { dispatchAsync: disconnectWallet, isRunning: isDisconnecting } =
    useDisconnect(solanaClient);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  return {
    hasMounted,
    wallets,
    connectedWallet,
    walletAddress: connectedWallet?.account.address ?? null,
    isWalletReady,
    connectSelectedWallet,
    disconnectWallet,
    isConnecting,
    isDisconnecting
  };
}

export function WalletModal({
  isOpen,
  onClose,
  onError
}: {
  isOpen: boolean;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const { wallets, isWalletReady, isConnecting, connectSelectedWallet } = useStratInWallet();

  if (!isOpen) {
    return null;
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm"
      role="dialog"
    >
      <div className="w-full max-w-sm rounded-lg border border-white/10 bg-[#111217] p-5 shadow-2xl shadow-black/40">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Connect Wallet</h2>
            <p className="mt-1 text-sm text-slate-400">Choose an installed Solana wallet.</p>
          </div>
          <button
            aria-label="Close wallet modal"
            className="grid h-8 w-8 place-items-center rounded-md border border-white/10 text-sm text-slate-300 hover:bg-white/10"
            onClick={onClose}
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
                onClick={() => {
                  void connectSelectedWallet(wallet)
                    .then(onClose)
                    .catch((error) =>
                      onError(error instanceof Error ? error.message : "Wallet connection failed.")
                    );
                }}
                type="button"
              >
                <span>{wallet.name}</span>
                <span className="text-xs text-slate-400">Wallet Standard</span>
              </button>
            ))
          ) : (
            <div className="rounded-md border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
              No Solana wallets were discovered in this browser.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function WalletButton({ onError }: { onError: (message: string) => void }) {
  const {
    hasMounted,
    walletAddress,
    isWalletReady,
    disconnectWallet,
    isDisconnecting
  } = useStratInWallet();
  const [isOpen, setIsOpen] = useState(false);

  if (!hasMounted) {
    return (
      <button className="rounded-md bg-teal-300 px-4 py-2 text-sm font-semibold text-slate-950 opacity-60" disabled type="button">
        Finding wallets
      </button>
    );
  }

  return (
    <>
      {walletAddress ? (
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
          onClick={() => setIsOpen(true)}
          type="button"
        >
          {isWalletReady ? "Connect Wallet" : "Finding wallets"}
        </button>
      )}
      <WalletModal isOpen={isOpen} onClose={() => setIsOpen(false)} onError={onError} />
    </>
  );
}
