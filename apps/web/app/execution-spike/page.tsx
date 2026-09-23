"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getBase58Decoder, getTransactionDecoder } from "@solana/kit";
import {
  useConnect,
  useConnectedWallet,
  useDisconnect,
  useIsWalletReady,
  useWalletStatus,
  useWallets,
} from "@solana/kit-plugin-wallet/react";
import {
  JupiterExecutionProvider,
  type ExecutionQuote,
} from "@stratin/execution";
import {
  SUPPORTED_TOKENIZED_EQUITIES,
  USDC_MINT,
  type TokenizedEquityAsset,
} from "@stratin/shared";
import {
  calculateAllocation,
  type AllocationLeg,
} from "@stratin/strategy-engine";
import { appConfig } from "../config";
import { formatAtomic, shortenAddress } from "../lib/format";
import {
  fetchSolBalanceLamports,
  fetchTokenBalances,
  rpcRequest,
  type TokenBalance,
} from "../lib/solana-rpc";
import { solanaClient } from "../providers";
import { requireStratInTransactionSupport } from "../lib/transaction-version";

const MIN_SOL_FOR_FEES_LAMPORTS = 5_000_000n;
const SLIPPAGE_BPS = 100;

const assetBySymbol = Object.fromEntries(
  SUPPORTED_TOKENIZED_EQUITIES.map((asset) => [asset.symbol, asset]),
) as Record<string, TokenizedEquityAsset>;

const TEST_STRATEGY = [
  { mint: assetBySymbol.NVDAx.mint, weightBps: 4000 },
  { mint: assetBySymbol.TSLAx.mint, weightBps: 2500 },
  { mint: assetBySymbol.METAx.mint, weightBps: 2500 },
  { mint: USDC_MINT, weightBps: 1000 },
] as const;

type QuoteByMint = Record<string, ExecutionQuote>;

type LegStatus = {
  mint: string;
  status: "idle" | "signing" | "confirmed" | "failed";
  signature?: string;
  error?: string;
};

function parseDecimalToAtomic(value: string, decimals: number) {
  const trimmed = value.trim();

  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("Enter a positive USDC amount.");
  }

  const [wholePart, fractionPart = ""] = trimmed.split(".");

  if (fractionPart.length > decimals) {
    throw new Error(`USDC supports at most ${decimals} decimal places.`);
  }

  return (
    BigInt(wholePart) * 10n ** BigInt(decimals) +
    BigInt(fractionPart.padEnd(decimals, "0"))
  );
}

function decodeBase64Transaction(serializedTransactionBase64: string) {
  const bytes = Uint8Array.from(atob(serializedTransactionBase64), (char) =>
    char.charCodeAt(0),
  );
  return getTransactionDecoder().decode(bytes);
}

function hasSignAndSendTransactions(signer: unknown): signer is {
  signAndSendTransactions(
    transactions: readonly unknown[],
    config?: { abortSignal?: AbortSignal },
  ): Promise<readonly Uint8Array[]>;
} {
  return (
    typeof signer === "object" &&
    signer !== null &&
    "signAndSendTransactions" in signer &&
    typeof signer.signAndSendTransactions === "function"
  );
}

async function confirmSignature(signature: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await rpcRequest<{
      value: ({ confirmationStatus?: string; err: unknown } | null)[];
    }>("getSignatureStatuses", [
      [signature],
      { searchTransactionHistory: true },
    ]);
    const status = result.value[0];

    if (status?.err) {
      throw new Error(JSON.stringify(status.err));
    }

    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error("Timed out waiting for transaction confirmation.");
}

function getAsset(mint: string) {
  return SUPPORTED_TOKENIZED_EQUITIES.find((asset) => asset.mint === mint);
}

export default function ExecutionSpikePage() {
  const [hasMounted, setHasMounted] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [investmentInput, setInvestmentInput] = useState("100");
  const [balances, setBalances] = useState<Map<string, TokenBalance>>(
    new Map(),
  );
  const [solBalanceLamports, setSolBalanceLamports] = useState<bigint | null>(
    null,
  );
  const [quotes, setQuotes] = useState<QuoteByMint>({});
  const [statuses, setStatuses] = useState<LegStatus[]>([]);
  const [isRefreshingBalances, setIsRefreshingBalances] = useState(false);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wallets = useWallets(solanaClient);
  const connectedWallet = useConnectedWallet(solanaClient);
  const isWalletReady = useIsWalletReady(solanaClient);
  const walletStatus = useWalletStatus(solanaClient);
  const { dispatchAsync: connectSelectedWallet, isRunning: isConnecting } =
    useConnect(solanaClient);
  const { dispatchAsync: disconnectWallet, isRunning: isDisconnecting } =
    useDisconnect(solanaClient);
  const walletAddress = connectedWallet?.account.address ?? null;
  const provider = useMemo(
    () => new JupiterExecutionProvider(appConfig.jupiterSwapApiBaseUrl),
    [],
  );
  const investmentAmountAtomic = useMemo(() => {
    try {
      return parseDecimalToAtomic(investmentInput, 6);
    } catch {
      return 0n;
    }
  }, [investmentInput]);
  const allocation = useMemo(() => {
    if (investmentAmountAtomic <= 0n) {
      return null;
    }

    try {
      return calculateAllocation({
        investmentAmountAtomic,
        allocations: TEST_STRATEGY,
      });
    } catch {
      return null;
    }
  }, [investmentAmountAtomic]);
  const swapLegs = allocation?.legs.filter((leg) => leg.requiresSwap) ?? [];
  const canSignAndSend = hasSignAndSendTransactions(connectedWallet?.signer);
  const displayWalletAddress = hasMounted ? walletAddress : null;
  const displaySolBalance = hasMounted ? solBalanceLamports : null;
  const displayUsdcBalance = hasMounted
    ? balances.get(USDC_MINT)?.uiAmountString
    : undefined;
  const supportedVersions =
    hasMounted && connectedWallet
      ? [...connectedWallet.supportedTransactionVersions].join(", ")
      : "not connected";

  useEffect(() => {
    setHasMounted(true);
  }, []);

  async function handleConnectWallet(wallet: (typeof wallets)[number]) {
    setError(null);

    try {
      await connectSelectedWallet(wallet);
      setIsWalletModalOpen(false);
    } catch (connectError) {
      setError(
        connectError instanceof Error
          ? connectError.message
          : "Wallet connection failed.",
      );
    }
  }

  const loadBalances = useCallback(async (address: string) => {
    const mints = SUPPORTED_TOKENIZED_EQUITIES.map((asset) => asset.mint);
    const [nextSolBalance, nextBalances] = await Promise.all([
      fetchSolBalanceLamports(address),
      fetchTokenBalances(address, mints),
    ]);
    setSolBalanceLamports(nextSolBalance);
    setBalances(nextBalances);
    return { nextBalances, nextSolBalance };
  }, []);

  const refreshBalances = useCallback(async () => {
    if (!walletAddress) {
      return null;
    }

    setIsRefreshingBalances(true);
    setError(null);

    try {
      return await loadBalances(walletAddress);
    } catch (balanceError) {
      setError(
        balanceError instanceof Error
          ? balanceError.message
          : "Failed to refresh balances.",
      );
      return null;
    } finally {
      setIsRefreshingBalances(false);
    }
  }, [loadBalances, walletAddress]);

  useEffect(() => {
    if (walletAddress) {
      void refreshBalances();
    }
  }, [refreshBalances, walletAddress]);

  async function requestQuotes() {
    if (!allocation) {
      setError("Enter a valid investment amount first.");
      return;
    }

    setIsQuoting(true);
    setError(null);
    setQuotes({});
    setStatuses([]);

    try {
      const nextQuotes: QuoteByMint = {};

      for (const leg of swapLegs) {
        nextQuotes[leg.mint] = await provider.getQuote({
          inputMint: USDC_MINT,
          outputMint: leg.mint,
          amountAtomic: leg.targetAmountAtomic,
          slippageBps: SLIPPAGE_BPS,
        });
      }

      setQuotes(nextQuotes);
    } catch (quoteError) {
      setError(
        quoteError instanceof Error
          ? quoteError.message
          : "Quote request failed.",
      );
    } finally {
      setIsQuoting(false);
    }
  }

  async function executeBasket() {
    if (!walletAddress || !connectedWallet) {
      setError("Connect a wallet before executing.");
      return;
    }

    if (!allocation) {
      setError("Enter a valid investment amount first.");
      return;
    }

    setIsExecuting(true);
    setError(null);

    let freshBalances: Map<string, TokenBalance>;
    let freshSolBalanceLamports: bigint;

    try {
      const fresh = await loadBalances(walletAddress);
      freshBalances = fresh.nextBalances;
      freshSolBalanceLamports = fresh.nextSolBalance;
    } catch (balanceError) {
      setIsExecuting(false);
      setError(
        balanceError instanceof Error
          ? balanceError.message
          : "Failed to refresh balances.",
      );
      return;
    }

    const usdcBalance = freshBalances.get(USDC_MINT)?.amountAtomic ?? 0n;

    if (usdcBalance < allocation.investmentAmountAtomic) {
      setIsExecuting(false);
      setError(
        `Insufficient USDC balance. App sees ${formatAtomic(usdcBalance, 6)} USDC, required ${formatAtomic(
          allocation.investmentAmountAtomic,
          6,
        )} USDC.`,
      );
      return;
    }

    if (freshSolBalanceLamports < MIN_SOL_FOR_FEES_LAMPORTS) {
      setIsExecuting(false);
      setError("Add more SOL for transaction fees before executing.");
      return;
    }

    if (!canSignAndSend || !connectedWallet.signer) {
      setIsExecuting(false);
      setError(
        "Connected wallet does not expose Kit signAndSendTransactions for this spike.",
      );
      return;
    }

    try {
      requireStratInTransactionSupport(
        connectedWallet.supportedTransactionVersions,
      );
    } catch (versionError) {
      setIsExecuting(false);
      setError(
        versionError instanceof Error
          ? versionError.message
          : "Unsupported transaction version.",
      );
      return;
    }

    const missingQuote = swapLegs.find((leg) => !quotes[leg.mint]);

    if (missingQuote) {
      setIsExecuting(false);
      setError(
        `Missing quote for ${missingQuote.symbol}. Request quotes first.`,
      );
      return;
    }

    setStatuses(swapLegs.map((leg) => ({ mint: leg.mint, status: "idle" })));

    const builtTransactions: {
      leg: (typeof swapLegs)[number];
      transaction: ReturnType<typeof decodeBase64Transaction>;
    }[] = [];
    for (const leg of swapLegs) {
      setStatuses((current) =>
        current.map((status) =>
          status.mint === leg.mint
            ? { mint: leg.mint, status: "signing" }
            : status,
        ),
      );

      try {
        const quote = quotes[leg.mint];
        const built = await provider.buildTransaction({
          quote,
          userPublicKey: walletAddress,
        });
        builtTransactions.push({
          leg,
          transaction: decodeBase64Transaction(
            built.serializedTransactionBase64,
          ),
        });
      } catch (buildError) {
        const message =
          buildError instanceof Error
            ? buildError.message
            : "Transaction build failed.";
        setStatuses((current) =>
          current.map((status) =>
            status.mint === leg.mint
              ? { mint: leg.mint, status: "failed", error: message }
              : status,
          ),
        );
        setError(
          `Basket transaction build failed at ${leg.symbol}: ${message}`,
        );
        setIsExecuting(false);
        return;
      }
    }

    let signatures: readonly Uint8Array[];
    try {
      signatures = await connectedWallet.signer.signAndSendTransactions(
        builtTransactions.map((item) => item.transaction),
      );
    } catch (signError) {
      const message =
        signError instanceof Error
          ? signError.message
          : "Wallet signing failed.";
      setStatuses((current) =>
        current.map((status) => ({
          ...status,
          status: "failed",
          error: message,
        })),
      );
      setError(`Batched basket signing failed: ${message}`);
      setIsExecuting(false);
      return;
    }

    for (const [index, item] of builtTransactions.entries()) {
      const signatureBytes = signatures[index];
      const signature = signatureBytes
        ? getBase58Decoder().decode(signatureBytes)
        : "";

      if (!signature) {
        const message =
          "Wallet did not return a transaction signature for this leg.";
        setStatuses((current) =>
          current.map((status) =>
            status.mint === item.leg.mint
              ? { mint: item.leg.mint, status: "failed", error: message }
              : status,
          ),
        );
        setError(
          `Basket partially executed or stopped at ${item.leg.symbol}: ${message}`,
        );
        break;
      }

      try {
        await confirmSignature(signature);
        setStatuses((current) =>
          current.map((status) =>
            status.mint === item.leg.mint
              ? { mint: item.leg.mint, status: "confirmed", signature }
              : status,
          ),
        );
      } catch (executionError) {
        const message =
          executionError instanceof Error
            ? executionError.message
            : "Execution failed.";
        setStatuses((current) =>
          current.map((status) =>
            status.mint === item.leg.mint
              ? {
                  mint: item.leg.mint,
                  status: "failed",
                  signature,
                  error: message,
                }
              : status,
          ),
        );
        setError(
          `Basket partially executed or stopped at ${item.leg.symbol}: ${message}`,
        );
        break;
      }
    }

    await refreshBalances();
    setIsExecuting(false);
  }

  function renderWalletControl() {
    if (!hasMounted) {
      return (
        <button
          className="rounded-md bg-teal-300 px-4 py-2 text-sm font-semibold text-slate-950 opacity-60"
          disabled
          type="button"
        >
          Finding wallets
        </button>
      );
    }

    if (walletAddress) {
      return (
        <button
          className="rounded-md border border-teal-300/40 bg-teal-300/10 px-4 py-2 text-sm font-medium text-teal-100"
          disabled={isDisconnecting}
          onClick={() => void disconnectWallet()}
          type="button"
        >
          {shortenAddress(walletAddress)}
        </button>
      );
    }

    return (
      <button
        className="rounded-md bg-teal-300 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-teal-950/30 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!isWalletReady}
        onClick={() => setIsWalletModalOpen(true)}
        type="button"
      >
        {isWalletReady ? "Connect Wallet" : "Finding wallets"}
      </button>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 sm:px-8">
      <header className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-teal-300">
            StratIn Execution Spike
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
            USDC into tokenized-equity SPL assets.
          </h1>
        </div>
        {renderWalletControl()}
      </header>

      <section className="grid gap-6 py-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-lg font-semibold text-white">Wallet</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-300">
              <p>
                Address:{" "}
                {displayWalletAddress
                  ? shortenAddress(displayWalletAddress)
                  : "not connected"}
              </p>
              <p>Status: {hasMounted ? walletStatus : "pending"}</p>
              <p>Tx versions: {supportedVersions}</p>
              <p>
                Kit sign/send:{" "}
                {hasMounted && canSignAndSend ? "available" : "not available"}
              </p>
              <p>
                SOL:{" "}
                {displaySolBalance === null
                  ? "-"
                  : formatAtomic(displaySolBalance, 9)}
              </p>
              <p>USDC: {displayUsdcBalance ?? "0"}</p>
            </div>
            <button
              className="mt-4 rounded-md border border-white/10 px-3 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-60"
              disabled={!walletAddress || isRefreshingBalances}
              onClick={() => void refreshBalances()}
              type="button"
            >
              Refresh Balances
            </button>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-lg font-semibold text-white">Test Strategy</h2>
            <div className="mt-4 space-y-3">
              {TEST_STRATEGY.map((leg) => {
                const asset = getAsset(leg.mint);
                return (
                  <div
                    className="flex items-center justify-between text-sm"
                    key={leg.mint}
                  >
                    <span className="text-white">{asset?.symbol}</span>
                    <span className="text-slate-300">
                      {leg.weightBps / 100}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Investment</h2>
              <p className="mt-1 text-sm text-slate-400">
                USDC retained allocation is not swapped.
              </p>
            </div>
            <label className="block">
              <span className="text-sm text-slate-300">USDC amount</span>
              <input
                className="mt-2 w-40 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-right text-white outline-none focus:border-teal-300/60"
                inputMode="decimal"
                onChange={(event) => setInvestmentInput(event.target.value)}
                value={investmentInput}
              />
            </label>
          </div>

          <div className="mt-6 overflow-hidden rounded-md border border-white/10">
            <div className="grid grid-cols-[1fr_1fr_1fr] bg-black/30 px-4 py-2 text-xs uppercase tracking-[0.14em] text-slate-400">
              <span>Asset</span>
              <span className="text-right">Target</span>
              <span className="text-right">Expected Output</span>
            </div>
            {(allocation?.legs ?? []).map((leg: AllocationLeg) => {
              const quote = quotes[leg.mint];
              const asset = getAsset(leg.mint);
              return (
                <div
                  className="grid grid-cols-[1fr_1fr_1fr] border-t border-white/10 px-4 py-3 text-sm"
                  key={leg.mint}
                >
                  <div>
                    <p className="font-medium text-white">{leg.symbol}</p>
                    <p className="text-xs text-slate-500">
                      {leg.requiresSwap ? "swap leg" : "retained"}
                    </p>
                  </div>
                  <p className="text-right text-slate-200">
                    ${formatAtomic(leg.targetAmountUsdAtomic, 6)}
                  </p>
                  <div className="text-right">
                    <p className="text-slate-200">
                      {quote && asset
                        ? `${formatAtomic(quote.outAmountAtomic, asset.decimals)} ${asset.symbol}`
                        : leg.requiresSwap
                          ? "-"
                          : `${formatAtomic(leg.targetAmountAtomic, 6)} USDC`}
                    </p>
                    {quote?.priceImpactPct ? (
                      <p className="text-xs text-slate-500">
                        Impact {quote.priceImpactPct}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              className="rounded-md border border-teal-300/40 px-4 py-2 text-sm font-medium text-teal-100 hover:bg-teal-300/10 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!allocation || isQuoting}
              onClick={() => void requestQuotes()}
              type="button"
            >
              {isQuoting ? "Quoting" : "Get Quotes"}
            </button>
            <button
              className="rounded-md bg-teal-300 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-teal-950/30 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={
                !walletAddress ||
                isExecuting ||
                swapLegs.some((leg) => !quotes[leg.mint])
              }
              onClick={() => void executeBasket()}
              type="button"
            >
              {isExecuting ? "Executing" : "Execute Sequentially"}
            </button>
          </div>

          {Object.keys(quotes).length > 0 ? (
            <div className="mt-5 rounded-md bg-black/25 p-4 text-sm text-slate-300">
              <p className="font-medium text-white">Route preview</p>
              <div className="mt-3 space-y-2">
                {swapLegs.map((leg) => (
                  <p key={leg.mint}>
                    {leg.symbol}:{" "}
                    {quotes[leg.mint]?.routeLabels.join(" -> ") || "no route"}
                  </p>
                ))}
              </div>
            </div>
          ) : null}

          {statuses.length > 0 ? (
            <div className="mt-5 rounded-md bg-black/25 p-4 text-sm">
              <p className="font-medium text-white">Execution status</p>
              <div className="mt-3 space-y-2">
                {statuses.map((status) => {
                  const asset = getAsset(status.mint);
                  return (
                    <div className="flex flex-col gap-1" key={status.mint}>
                      <p className="text-slate-200">
                        {asset?.symbol}: {status.status}
                      </p>
                      {status.signature ? (
                        <p className="break-all text-xs text-teal-200">
                          {status.signature}
                        </p>
                      ) : null}
                      {status.error ? (
                        <p className="break-all text-xs text-red-300">
                          {status.error}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

          <div className="mt-6 rounded-md border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-medium text-white">Resulting balances</p>
            <div className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
              {TEST_STRATEGY.map((leg) => {
                const asset = getAsset(leg.mint);
                return (
                  <p key={leg.mint}>
                    {asset?.symbol}:{" "}
                    {balances.get(leg.mint)?.uiAmountString ?? "0"}
                  </p>
                );
              })}
            </div>
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

            {error ? (
              <p className="mt-4 text-sm text-red-300">{error}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
