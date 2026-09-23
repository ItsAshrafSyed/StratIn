"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getBase58Decoder, getTransactionDecoder } from "@solana/kit";
import {
  JupiterExecutionProvider,
  type ExecutionQuote,
} from "@stratin/execution";
import {
  calculateFeeBreakdown,
  SUPPORTED_TOKENIZED_EQUITIES,
  USDC_MINT,
  type FeeConfig,
  type StrategyDetail,
} from "@stratin/shared";
import {
  calculateAllocation,
  type AllocationLeg,
} from "@stratin/strategy-engine";
import { useStratInWallet } from "../../components/wallet";
import { appConfig } from "../../config";
import {
  getFeeConfig,
  getStrategy,
  recordInvestment,
  refreshStrategyNav,
} from "../../lib/api";
import { getAsset } from "../../lib/assets";
import { buildUsdcFeeTransferTransaction } from "../../lib/fee-transfer";
import {
  confirmSignature,
  fetchSolBalanceLamports,
  fetchTokenBalances,
  type TokenBalance,
} from "../../lib/solana-rpc";
import {
  formatAtomic,
  formatDate,
  parseDecimalToAtomic,
  shortenAddress,
} from "../../lib/format";
import { requireStratInTransactionSupport } from "../../lib/transaction-version";

const SLIPPAGE_BPS = 100;
const MIN_SOL_FOR_FEES_LAMPORTS = 5_000_000n;

type QuoteByMint = Record<string, ExecutionQuote>;
type LegStatus = {
  mint: string;
  status: "idle" | "signing" | "confirmed" | "failed";
  signature?: string;
  error?: string;
};

function decodeBase64Transaction(serializedTransactionBase64: string) {
  const bytes = Uint8Array.from(atob(serializedTransactionBase64), (char) =>
    char.charCodeAt(0),
  );
  return getTransactionDecoder().decode(bytes);
}

function hasSignAndSendTransactions(signer: unknown): signer is {
  signAndSendTransactions(
    transactions: readonly unknown[],
  ): Promise<readonly Uint8Array[]>;
} {
  return (
    typeof signer === "object" &&
    signer !== null &&
    "signAndSendTransactions" in signer &&
    typeof signer.signAndSendTransactions === "function"
  );
}

export default function StrategyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [strategyId, setStrategyId] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<StrategyDetail | null>(null);
  const [investmentInput, setInvestmentInput] = useState("10");
  const [balances, setBalances] = useState<Map<string, TokenBalance>>(
    new Map(),
  );
  const [solBalanceLamports, setSolBalanceLamports] = useState<bigint | null>(
    null,
  );
  const [quotes, setQuotes] = useState<QuoteByMint>({});
  const [feeConfig, setFeeConfig] = useState<FeeConfig | null>(null);
  const [feeSignature, setFeeSignature] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<LegStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isRefreshingNav, setIsRefreshingNav] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { hasMounted, walletAddress, connectedWallet } = useStratInWallet();
  const provider = useMemo(
    () => new JupiterExecutionProvider(appConfig.jupiterSwapApiBaseUrl),
    [],
  );
  const canSignAndSend = hasSignAndSendTransactions(connectedWallet?.signer);
  const investmentAmountAtomic = useMemo(() => {
    try {
      return parseDecimalToAtomic(investmentInput, 6);
    } catch {
      return 0n;
    }
  }, [investmentInput]);
  const allocation = useMemo(() => {
    if (!strategy || investmentAmountAtomic <= 0n) {
      return null;
    }

    return calculateAllocation({
      investmentAmountAtomic,
      allocations: strategy.allocations.map((item) => ({
        mint: item.assetMint,
        weightBps: item.weightBps,
      })),
    });
  }, [investmentAmountAtomic, strategy]);
  const feeBreakdown = useMemo(() => {
    if (!feeConfig || !allocation) {
      return null;
    }

    return calculateFeeBreakdown(
      "INVEST",
      allocation.investmentAmountAtomic,
      feeConfig,
    );
  }, [allocation, feeConfig]);
  const swapLegs = allocation?.legs.filter((leg) => leg.requiresSwap) ?? [];

  useEffect(() => {
    void params.then(({ id }) => setStrategyId(id));
  }, [params]);

  useEffect(() => {
    if (!strategyId) {
      return;
    }

    setIsLoading(true);
    void Promise.all([getStrategy(strategyId), getFeeConfig()])
      .then(([strategyResponse, feeResponse]) => {
        setStrategy(strategyResponse.strategy);
        setFeeConfig(feeResponse.config);
      })
      .catch((loadError) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load strategy.",
        ),
      )
      .finally(() => setIsLoading(false));
  }, [strategyId]);

  async function loadBalances(address: string) {
    const mints = SUPPORTED_TOKENIZED_EQUITIES.map((asset) => asset.mint);
    const [nextSolBalance, nextBalances] = await Promise.all([
      fetchSolBalanceLamports(address),
      fetchTokenBalances(address, mints),
    ]);
    setSolBalanceLamports(nextSolBalance);
    setBalances(nextBalances);
    return { nextSolBalance, nextBalances };
  }

  useEffect(() => {
    if (walletAddress) {
      void loadBalances(walletAddress).catch((balanceError) => {
        setSolBalanceLamports(null);
        setBalances(new Map());
        setError(
          balanceError instanceof Error
            ? `Wallet balances are temporarily unavailable: ${balanceError.message}`
            : "Wallet balances are temporarily unavailable.",
        );
      });
    }
  }, [walletAddress]);

  async function requestQuotes() {
    if (!allocation) {
      setError("Enter a valid investment amount.");
      return;
    }

    setIsQuoting(true);
    setError(null);
    setSuccess(null);
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

  async function invest() {
    if (
      !strategy ||
      !strategyId ||
      !allocation ||
      !walletAddress ||
      !connectedWallet
    ) {
      setError("Connect a wallet and review the investment first.");
      return;
    }

    setIsExecuting(true);
    setError(null);
    setSuccess(null);

    try {
      const { nextBalances, nextSolBalance } =
        await loadBalances(walletAddress);
      const balancesBeforeExecution = nextBalances;
      const usdcBalance = nextBalances.get(USDC_MINT)?.amountAtomic ?? 0n;
      const totalRequiredUsdc =
        allocation.investmentAmountAtomic +
        (feeBreakdown?.totalFeeAtomic ?? 0n);

      if (usdcBalance < totalRequiredUsdc) {
        throw new Error(
          `Insufficient USDC. App sees ${formatAtomic(usdcBalance, 6)} USDC, required ${formatAtomic(totalRequiredUsdc, 6)} USDC including transparent fees.`,
        );
      }

      if (nextSolBalance < MIN_SOL_FOR_FEES_LAMPORTS) {
        throw new Error("Add more SOL for transaction fees before investing.");
      }

      if (!canSignAndSend || !connectedWallet.signer) {
        throw new Error(
          "Connected wallet does not expose Kit signAndSendTransactions.",
        );
      }
      requireStratInTransactionSupport(
        connectedWallet.supportedTransactionVersions,
      );

      const missingQuote = swapLegs.find((leg) => !quotes[leg.mint]);
      if (missingQuote) {
        throw new Error(`Missing quote for ${missingQuote.symbol}.`);
      }

      const confirmedSignatures: string[] = [];
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
          const built = await provider.buildTransaction({
            quote: quotes[leg.mint],
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
          throw new Error(
            `Investment transaction build failed at ${leg.symbol}. ${message}`,
          );
        }
      }

      let signatureBytesByLeg: readonly Uint8Array[];
      try {
        signatureBytesByLeg =
          await connectedWallet.signer.signAndSendTransactions(
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
        throw new Error(`Batched investment signing failed. ${message}`);
      }

      for (const [index, item] of builtTransactions.entries()) {
        const signatureBytes = signatureBytesByLeg[index];
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
          throw new Error(
            `Investment stopped at ${item.leg.symbol}. ${message}`,
          );
        }

        try {
          await confirmSignature(signature);
          confirmedSignatures.push(signature);
          setStatuses((current) =>
            current.map((status) =>
              status.mint === item.leg.mint
                ? { mint: item.leg.mint, status: "confirmed", signature }
                : status,
            ),
          );
        } catch (confirmError) {
          const message =
            confirmError instanceof Error
              ? confirmError.message
              : "Confirmation failed.";
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
          throw new Error(
            `Investment confirmation failed at ${item.leg.symbol}. Successful legs were not recorded as a complete strategy investment. ${message}`,
          );
        }
      }

      let confirmedFeeSignatures: string[] = [];
      if (feeBreakdown && feeBreakdown.totalFeeAtomic > 0n) {
        const feeTransaction = await buildUsdcFeeTransferTransaction({
          payerWallet: walletAddress,
          targets: [
            {
              recipientWallet: strategy.creatorWallet,
              amountAtomic: feeBreakdown.strategistFeeAtomic,
            },
            {
              recipientWallet: feeConfig?.protocolTreasury ?? "",
              amountAtomic: feeBreakdown.protocolFeeAtomic,
            },
          ],
        });

        if (feeTransaction) {
          const [signatureBytes] =
            await connectedWallet.signer.signAndSendTransactions([
              feeTransaction,
            ]);
          const signature = signatureBytes
            ? getBase58Decoder().decode(signatureBytes)
            : "";

          if (!signature) {
            throw new Error("Wallet did not return a fee transfer signature.");
          }

          await confirmSignature(signature);
          confirmedFeeSignatures = [signature];
          setFeeSignature(signature);
        }
      }

      const balancesAfterExecution = (await loadBalances(walletAddress))
        .nextBalances;
      const positions = allocation.legs.map((leg) => {
        if (!leg.requiresSwap) {
          return {
            assetMint: leg.mint,
            quantityAtomic: leg.targetAmountAtomic.toString(),
          };
        }

        const before =
          balancesBeforeExecution.get(leg.mint)?.amountAtomic ?? 0n;
        const after = balancesAfterExecution.get(leg.mint)?.amountAtomic ?? 0n;
        const received =
          after > before
            ? after - before
            : (quotes[leg.mint]?.outAmountAtomic ?? 0n);

        return {
          assetMint: leg.mint,
          quantityAtomic: received.toString(),
        };
      });

      await recordInvestment(strategyId, {
        investorWallet: walletAddress,
        initialAmountUsdcAtomic: allocation.investmentAmountAtomic.toString(),
        transactionSignatures: confirmedSignatures,
        fee:
          feeBreakdown && feeBreakdown.totalFeeAtomic > 0n
            ? {
                actionAmountAtomic: feeBreakdown.actionAmountAtomic.toString(),
                strategistFeeAtomic:
                  feeBreakdown.strategistFeeAtomic.toString(),
                protocolFeeAtomic: feeBreakdown.protocolFeeAtomic.toString(),
                transactionSignatures: confirmedFeeSignatures,
              }
            : undefined,
        positions,
      });
      setSuccess("Investment recorded after all swap legs confirmed.");
    } catch (investError) {
      setError(
        investError instanceof Error
          ? investError.message
          : "Investment failed.",
      );
    } finally {
      setIsExecuting(false);
    }
  }

  async function refreshNav() {
    if (!strategyId) {
      return;
    }

    setIsRefreshingNav(true);
    setError(null);

    try {
      await refreshStrategyNav(strategyId);
      const response = await getStrategy(strategyId);
      setStrategy(response.strategy);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Failed to refresh NAV.",
      );
    } finally {
      setIsRefreshingNav(false);
    }
  }

  if (isLoading) {
    return (
      <main className="mx-auto max-w-6xl px-5 py-8 text-slate-300 sm:px-8">
        Loading strategy...
      </main>
    );
  }

  if (!strategy) {
    return (
      <main className="mx-auto max-w-6xl px-5 py-8 text-red-300 sm:px-8">
        {error ?? "Strategy not found."}
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
      <Link className="text-sm text-slate-300 hover:text-white" href="/explore">
        {"<-"} Explore
      </Link>
      <section className="mt-5 grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-semibold text-white">
              {strategy.name}
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              by {shortenAddress(strategy.creatorWallet)}
            </p>
            <p className="mt-4 max-w-2xl text-slate-300">
              {strategy.description}
            </p>
            <p className="mt-3 text-sm text-slate-400">
              Current Version{" "}
              <span className="text-white">#{strategy.currentVersion}</span>
            </p>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">NAV</h2>
                <p className="mt-2 text-3xl font-semibold text-white">
                  {strategy.latestNavSnapshot
                    ? formatAtomic(
                        BigInt(strategy.latestNavSnapshot.navUsdcAtomic),
                        6,
                      )
                    : "-"}
                </p>
              </div>
              <button
                className="rounded-md border border-teal-300/40 px-3 py-2 text-sm text-teal-100 disabled:opacity-60"
                disabled={isRefreshingNav}
                onClick={() => void refreshNav()}
                type="button"
              >
                {isRefreshingNav ? "Refreshing" : "Refresh NAV"}
              </button>
            </div>
            <h2 className="mt-6 text-lg font-semibold text-white">
              Performance
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {[
                ["1W", strategy.performance?.oneWeek],
                ["1M", strategy.performance?.oneMonth],
                ["3M", strategy.performance?.threeMonths],
                ["Since inception", strategy.performance?.sinceInception],
              ].map(([period, returnBps]) => (
                <div
                  className="flex justify-between border-b border-white/10 py-2"
                  key={period}
                >
                  <span className="text-slate-400">{period}</span>
                  <span className="text-white">
                    {returnBps === null || returnBps === undefined
                      ? "-"
                      : `${Number(returnBps) / 100}%`}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-slate-400">
              Live since {formatDate(strategy.createdAt)}
            </p>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-lg font-semibold text-white">
              Stocks & Weights
            </h2>
            <div className="mt-4 space-y-3">
              {strategy.allocations.map((allocationItem) => {
                const asset = getAsset(allocationItem.assetMint);
                return (
                  <div
                    className="flex justify-between text-sm"
                    key={allocationItem.assetMint}
                  >
                    <span className="text-white">
                      {asset?.symbol ?? allocationItem.assetMint}
                    </span>
                    <span className="text-slate-300">
                      {allocationItem.weightBps / 100}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-lg font-semibold text-white">
              About Strategist
            </h2>
            <div className="mt-4 flex justify-between text-sm">
              <span className="text-slate-400">
                {shortenAddress(strategy.creatorWallet)}
              </span>
              <span className="text-white">
                Strategies {strategy.strategistStrategyCount}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-lg font-semibold text-white">
              Strategy History
            </h2>
            <div className="mt-4 space-y-3 text-sm">
              {(strategy.versions ?? [])
                .slice()
                .reverse()
                .map((version) => (
                  <div
                    className="flex items-start justify-between gap-4 border-b border-white/10 py-2"
                    key={version.id}
                  >
                    <div>
                      <p className="text-white">Version {version.version}</p>
                      <p className="text-slate-500">
                        {formatDate(version.createdAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={
                          version.verificationStatus === "VERIFIED"
                            ? "text-teal-200"
                            : version.verificationStatus === "FAILED"
                              ? "text-red-300"
                              : "text-slate-400"
                        }
                      >
                        {version.verificationStatus === "VERIFIED"
                          ? "Verified on Solana"
                          : version.verificationStatus === "PENDING"
                            ? "Verification pending"
                            : version.verificationStatus === "FAILED"
                              ? "Verification failed"
                              : "Unverified"}
                      </p>
                      {version.solanaTransactionSignature ? (
                        <p className="mt-1 max-w-48 truncate text-xs text-slate-500">
                          {version.solanaTransactionSignature}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        <aside className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">Invest</h2>
          <label className="mt-4 block">
            <span className="text-sm text-slate-300">Amount</span>
            <input
              className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-right text-white"
              inputMode="decimal"
              value={investmentInput}
              onChange={(event) => setInvestmentInput(event.target.value)}
            />
          </label>
          <p className="mt-3 text-sm text-slate-400">
            USDC balance: {balances.get(USDC_MINT)?.uiAmountString ?? "0"}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            SOL:{" "}
            {solBalanceLamports === null
              ? "-"
              : formatAtomic(solBalanceLamports, 9)}
          </p>
          {!walletAddress && hasMounted ? (
            <p className="mt-3 text-sm text-amber-200">
              Connect a wallet to invest.
            </p>
          ) : null}

          <div className="mt-5 space-y-3">
            {(allocation?.legs ?? []).map((leg: AllocationLeg) => {
              const quote = quotes[leg.mint];
              const asset = getAsset(leg.mint);
              return (
                <div
                  className="flex justify-between gap-4 text-sm"
                  key={leg.mint}
                >
                  <span className="text-slate-300">{leg.symbol}</span>
                  <span className="text-right text-white">
                    ${formatAtomic(leg.targetAmountUsdAtomic, 6)}
                    {quote && asset ? (
                      <span className="block text-xs text-slate-500">
                        {formatAtomic(quote.outAmountAtomic, asset.decimals)}{" "}
                        {asset.symbol}
                      </span>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>

          {feeBreakdown ? (
            <div className="mt-5 border-t border-white/10 pt-4 text-sm">
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Portfolio Investment</span>
                <span className="text-white">
                  {formatAtomic(feeBreakdown.actionAmountAtomic, 6)} USDC
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Strategist Fee</span>
                <span className="text-white">
                  {formatAtomic(feeBreakdown.strategistFeeAtomic, 6)} USDC
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Protocol Fee</span>
                <span className="text-white">
                  {formatAtomic(feeBreakdown.protocolFeeAtomic, 6)} USDC
                </span>
              </div>
              <div className="mt-2 flex justify-between border-t border-white/10 pt-3 font-semibold">
                <span className="text-slate-200">Estimated Total</span>
                <span className="text-white">
                  {formatAtomic(
                    feeBreakdown.actionAmountAtomic +
                      feeBreakdown.totalFeeAtomic,
                    6,
                  )}{" "}
                  USDC
                </span>
              </div>
            </div>
          ) : null}

          <div className="mt-5 flex gap-3">
            <button
              className="rounded-md border border-teal-300/40 px-3 py-2 text-sm text-teal-100 disabled:opacity-60"
              disabled={!allocation || isQuoting}
              onClick={() => void requestQuotes()}
              type="button"
            >
              {isQuoting ? "Reviewing" : "Review Investment"}
            </button>
            <button
              className="rounded-md bg-teal-300 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
              disabled={
                !walletAddress ||
                isExecuting ||
                swapLegs.some((leg) => !quotes[leg.mint])
              }
              onClick={() => void invest()}
              type="button"
            >
              {isExecuting ? "Investing" : "Invest"}
            </button>
          </div>

          {statuses.length > 0 ? (
            <div className="mt-5 space-y-2 text-sm">
              {statuses.map((status) => {
                const asset = getAsset(status.mint);
                return (
                  <div key={status.mint}>
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
          ) : null}
          {success ? (
            <p className="mt-4 text-sm text-teal-200">{success}</p>
          ) : null}
          {feeSignature ? (
            <p className="mt-2 break-all text-xs text-teal-200">
              Fee: {feeSignature}
            </p>
          ) : null}
          {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
        </aside>
      </section>
    </main>
  );
}
