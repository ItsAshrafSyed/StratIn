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
  calculateRebalanceFeeBasis,
  SUPPORTED_TOKENIZED_EQUITIES,
  USDC_MINT,
  type FeeConfig,
  type StrategyDetail,
  type StrategyInvestment,
  type StrategyVersionDto,
} from "@stratin/shared";
import {
  calculateRebalanceTrades,
  type RebalanceTradeIntent,
} from "@stratin/strategy-engine";
import { useStratInWallet } from "../../components/wallet";
import { appConfig } from "../../config";
import {
  getFeeConfig,
  getInvestment,
  getStrategy,
  listStrategyVersions,
  recordRebalance,
} from "../../lib/api";
import { getAsset } from "../../lib/assets";
import { buildUsdcFeeTransferTransaction } from "../../lib/fee-transfer";
import { formatAtomic } from "../../lib/format";
import {
  confirmSignature,
  fetchSolBalanceLamports,
  fetchTokenBalances,
} from "../../lib/solana-rpc";
import { requireStratInTransactionSupport } from "../../lib/transaction-version";

const MIN_SOL_FOR_FEES_LAMPORTS = 5_000_000n;
const SLIPPAGE_BPS = 100;

type ValuedPosition = {
  assetMint: string;
  quantityAtomic: bigint;
  valueUsdcAtomic: bigint;
};

type ExecutableTrade = RebalanceTradeIntent & {
  amountInAtomic: bigint;
  quote?: ExecutionQuote;
};

type LegStatus = {
  key: string;
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

function positionMap(
  positions: readonly { assetMint: string; quantityAtomic: string }[],
) {
  return new Map(
    positions.map((position) => [
      position.assetMint,
      BigInt(position.quantityAtomic),
    ]),
  );
}

export default function RebalancePage({
  params,
}: {
  params: Promise<{ investmentId: string }>;
}) {
  const [investmentId, setInvestmentId] = useState<string | null>(null);
  const [investment, setInvestment] = useState<StrategyInvestment | null>(null);
  const [strategy, setStrategy] = useState<StrategyDetail | null>(null);
  const [versions, setVersions] = useState<StrategyVersionDto[]>([]);
  const [valuedPositions, setValuedPositions] = useState<ValuedPosition[]>([]);
  const [trades, setTrades] = useState<ExecutableTrade[]>([]);
  const [feeConfig, setFeeConfig] = useState<FeeConfig | null>(null);
  const [feeSignature, setFeeSignature] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<LegStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { walletAddress, connectedWallet } = useStratInWallet();
  const provider = useMemo(
    () => new JupiterExecutionProvider(appConfig.jupiterSwapApiBaseUrl),
    [],
  );
  const canSignAndSend = hasSignAndSendTransactions(connectedWallet?.signer);
  const previousVersion = versions.find(
    (version) => version.version === investment?.strategyVersion,
  );
  const currentVersion = versions.find(
    (version) => version.version === strategy?.currentVersion,
  );
  const rebalanceActionAmountAtomic = useMemo(
    () => calculateRebalanceFeeBasis(trades),
    [trades],
  );
  const feeBreakdown = useMemo(() => {
    if (!feeConfig || rebalanceActionAmountAtomic === 0n) {
      return null;
    }

    return calculateFeeBreakdown(
      "REBALANCE",
      rebalanceActionAmountAtomic,
      feeConfig,
    );
  }, [feeConfig, rebalanceActionAmountAtomic]);

  useEffect(() => {
    void params.then(({ investmentId: id }) => setInvestmentId(id));
  }, [params]);

  useEffect(() => {
    if (!investmentId) {
      return;
    }

    setIsLoading(true);
    void getInvestment(investmentId)
      .then(async (investmentResponse) => {
        setInvestment(investmentResponse.investment);
        const [strategyResponse, versionsResponse, feeResponse] =
          await Promise.all([
            getStrategy(investmentResponse.investment.strategyId),
            listStrategyVersions(investmentResponse.investment.strategyId),
            getFeeConfig(),
          ]);
        setStrategy(strategyResponse.strategy);
        setVersions(versionsResponse.versions);
        setFeeConfig(feeResponse.config);
      })
      .catch((loadError) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load rebalance.",
        ),
      )
      .finally(() => setIsLoading(false));
  }, [investmentId]);

  async function reviewRebalance() {
    if (!investment?.positions || investment.positions.length === 0) {
      setError("Investment positions are missing.");
      return;
    }

    if (!strategy) {
      setError("Strategy is missing.");
      return;
    }

    setIsReviewing(true);
    setError(null);
    setSuccess(null);
    setTrades([]);

    try {
      const nextValuedPositions: ValuedPosition[] = [];
      for (const position of investment.positions) {
        const quantityAtomic = BigInt(position.quantityAtomic);
        if (position.assetMint === USDC_MINT) {
          nextValuedPositions.push({
            assetMint: position.assetMint,
            quantityAtomic,
            valueUsdcAtomic: quantityAtomic,
          });
          continue;
        }

        const quote = await provider.getQuote({
          inputMint: position.assetMint,
          outputMint: USDC_MINT,
          amountAtomic: quantityAtomic,
          slippageBps: SLIPPAGE_BPS,
        });
        nextValuedPositions.push({
          assetMint: position.assetMint,
          quantityAtomic,
          valueUsdcAtomic: quote.outAmountAtomic,
        });
      }

      const rebalance = calculateRebalanceTrades({
        positions: nextValuedPositions,
        targetAllocations: strategy.allocations,
      });
      const nextTrades: ExecutableTrade[] = [];

      for (const trade of rebalance.trades) {
        const sourcePosition = nextValuedPositions.find(
          (position) => position.assetMint === trade.assetMint,
        );
        const amountInAtomic =
          trade.side === "SELL"
            ? ((sourcePosition?.quantityAtomic ?? 0n) * trade.valueUsdcAtomic) /
              (sourcePosition?.valueUsdcAtomic ?? 1n)
            : trade.valueUsdcAtomic;
        const quote = await provider.getQuote({
          inputMint: trade.side === "SELL" ? trade.assetMint : USDC_MINT,
          outputMint: trade.side === "SELL" ? USDC_MINT : trade.assetMint,
          amountAtomic: amountInAtomic,
          slippageBps: SLIPPAGE_BPS,
        });
        nextTrades.push({ ...trade, amountInAtomic, quote });
      }

      setValuedPositions(nextValuedPositions);
      setTrades(nextTrades);
      if (nextTrades.length === 0) {
        setSuccess(
          "No rebalance trades are required for this attributed position.",
        );
      }
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : "Failed to review rebalance.",
      );
    } finally {
      setIsReviewing(false);
    }
  }

  async function executeRebalance() {
    if (!investment || !walletAddress || !connectedWallet || !strategy) {
      setError("Connect the investing wallet before rebalancing.");
      return;
    }

    if (investment.investorWallet !== walletAddress) {
      setError(
        "Connect the original investing wallet for this StratIn position.",
      );
      return;
    }

    setIsExecuting(true);
    setError(null);
    setSuccess(null);

    try {
      const mints = SUPPORTED_TOKENIZED_EQUITIES.map((asset) => asset.mint);
      const [solBalance, walletBalances] = await Promise.all([
        fetchSolBalanceLamports(walletAddress),
        fetchTokenBalances(walletAddress, mints),
      ]);

      if (solBalance < MIN_SOL_FOR_FEES_LAMPORTS) {
        throw new Error(
          "Add more SOL for transaction fees before rebalancing.",
        );
      }

      if (!canSignAndSend || !connectedWallet.signer) {
        throw new Error(
          "Connected wallet does not expose Kit signAndSendTransactions.",
        );
      }
      requireStratInTransactionSupport(
        connectedWallet.supportedTransactionVersions,
      );

      const userPublicKey = walletAddress;
      const signer = connectedWallet.signer;

      for (const position of investment.positions ?? []) {
        const asset = getAsset(position.assetMint);
        const walletQuantity =
          walletBalances.get(position.assetMint)?.amountAtomic ?? 0n;

        if (
          position.assetMint !== USDC_MINT &&
          walletQuantity < BigInt(position.quantityAtomic)
        ) {
          throw new Error(
            `Your wallet no longer contains enough ${asset?.symbol ?? position.assetMint} to perform this strategy rebalance.`,
          );
        }
      }

      if (trades.length === 0) {
        await reviewRebalance();
      }

      const executableTrades = trades.length > 0 ? trades : [];
      if (executableTrades.length === 0) {
        throw new Error("Review trades before executing the rebalance.");
      }
      const nextPositions = positionMap(investment.positions ?? []);
      const signatures: string[] = [];
      setStatuses(
        executableTrades.map((trade) => ({
          key: `${trade.side}:${trade.assetMint}`,
          status: "idle",
        })),
      );

      async function executeTradeBatch(batch: readonly ExecutableTrade[]) {
        if (batch.length === 0) {
          return;
        }

        const builtTransactions: {
          key: string;
          trade: ExecutableTrade;
          transaction: ReturnType<typeof decodeBase64Transaction>;
        }[] = [];
        for (const trade of batch) {
          const key = `${trade.side}:${trade.assetMint}`;
          setStatuses((current) =>
            current.map((status) =>
              status.key === key ? { key, status: "signing" } : status,
            ),
          );

          try {
            if (!trade.quote) {
              throw new Error("Missing rebalance quote.");
            }

            const built = await provider.buildTransaction({
              quote: trade.quote,
              userPublicKey,
            });
            builtTransactions.push({
              key,
              trade,
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
                status.key === key
                  ? { key, status: "failed", error: message }
                  : status,
              ),
            );
            throw new Error(
              `Rebalance transaction build failed at ${getAsset(trade.assetMint)?.symbol ?? trade.assetMint}. ${message}`,
            );
          }
        }

        let signatureBytesByTrade: readonly Uint8Array[];
        try {
          signatureBytesByTrade = await signer.signAndSendTransactions(
            builtTransactions.map((item) => item.transaction),
          );
        } catch (signError) {
          const message =
            signError instanceof Error
              ? signError.message
              : "Wallet signing failed.";
          setStatuses((current) =>
            current.map((status) =>
              builtTransactions.some((item) => item.key === status.key)
                ? { ...status, status: "failed", error: message }
                : status,
            ),
          );
          throw new Error(`Batched rebalance signing failed. ${message}`);
        }

        for (const [index, item] of builtTransactions.entries()) {
          const signatureBytes = signatureBytesByTrade[index];
          const signature = signatureBytes
            ? getBase58Decoder().decode(signatureBytes)
            : "";

          if (!signature) {
            const message =
              "Wallet did not return a transaction signature for this leg.";
            setStatuses((current) =>
              current.map((status) =>
                status.key === item.key
                  ? { key: item.key, status: "failed", error: message }
                  : status,
              ),
            );
            throw new Error(
              `Rebalance stopped at ${getAsset(item.trade.assetMint)?.symbol ?? item.trade.assetMint}. ${message}`,
            );
          }

          try {
            await confirmSignature(signature);
            signatures.push(signature);

            if (item.trade.side === "SELL") {
              nextPositions.set(
                item.trade.assetMint,
                (nextPositions.get(item.trade.assetMint) ?? 0n) -
                  item.trade.amountInAtomic,
              );
              nextPositions.set(
                USDC_MINT,
                (nextPositions.get(USDC_MINT) ?? 0n) +
                  (item.trade.quote?.outAmountAtomic ?? 0n),
              );
            } else {
              nextPositions.set(
                USDC_MINT,
                (nextPositions.get(USDC_MINT) ?? 0n) -
                  item.trade.amountInAtomic,
              );
              nextPositions.set(
                item.trade.assetMint,
                (nextPositions.get(item.trade.assetMint) ?? 0n) +
                  (item.trade.quote?.outAmountAtomic ?? 0n),
              );
            }

            setStatuses((current) =>
              current.map((status) =>
                status.key === item.key
                  ? { key: item.key, status: "confirmed", signature }
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
                status.key === item.key
                  ? {
                      key: item.key,
                      status: "failed",
                      signature,
                      error: message,
                    }
                  : status,
              ),
            );
            throw new Error(
              `Rebalance confirmation failed at ${getAsset(item.trade.assetMint)?.symbol ?? item.trade.assetMint}. Successful legs were not recorded as fully synchronized. ${message}`,
            );
          }
        }
      }

      await executeTradeBatch(
        executableTrades.filter((trade) => trade.side === "SELL"),
      );
      await executeTradeBatch(
        executableTrades.filter((trade) => trade.side === "BUY"),
      );

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
          const [signatureBytes] = await signer.signAndSendTransactions([
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

      await recordRebalance(investment.id, {
        investorWallet: walletAddress,
        transactionSignatures: signatures,
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
        positions: [...nextPositions.entries()]
          .filter(([, quantityAtomic]) => quantityAtomic > 0n)
          .map(([assetMint, quantityAtomic]) => ({
            assetMint,
            quantityAtomic: quantityAtomic.toString(),
          })),
      });
      const refreshed = await getInvestment(investment.id);
      setInvestment(refreshed.investment);
      setSuccess("Rebalance recorded after all required legs confirmed.");
    } catch (rebalanceError) {
      setError(
        rebalanceError instanceof Error
          ? rebalanceError.message
          : "Rebalance failed.",
      );
    } finally {
      setIsExecuting(false);
    }
  }

  if (isLoading) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-8 text-slate-300 sm:px-8">
        Loading rebalance...
      </main>
    );
  }

  if (!investment || !strategy) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-8 text-red-300 sm:px-8">
        {error ?? "Investment not found."}
      </main>
    );
  }

  const isUpToDate = investment.strategyVersion >= strategy.currentVersion;

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
      <Link
        className="text-sm text-slate-300 hover:text-white"
        href="/my-investments"
      >
        {"<-"} My Investments
      </Link>
      <h1 className="mt-5 text-3xl font-semibold text-white">
        {strategy.name}
      </h1>
      <p className="mt-2 text-slate-300">
        Rebalance #{strategy.currentVersion}
      </p>

      {!investment.positions || investment.positions.length === 0 ? (
        <p className="mt-6 rounded-lg border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
          This investment was recorded before StratIn started storing per-asset
          attributed positions, so it cannot be safely rebalanced from the
          ledger yet. Create a fresh investment or backfill this investment from
          its original swap transactions.
        </p>
      ) : null}

      {isUpToDate ? (
        <p className="mt-6 rounded-lg border border-teal-300/20 bg-teal-300/10 p-4 text-sm text-teal-100">
          This StratIn position is up to date.
        </p>
      ) : null}

      <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.04] p-5">
        <h2 className="text-lg font-semibold text-white">Strategy Change</h2>
        <div className="mt-4 space-y-2 text-sm">
          {strategy.allocations.map((allocation) => {
            const previous = previousVersion?.allocations.find(
              (item) => item.assetMint === allocation.assetMint,
            );
            return (
              <div
                className="grid grid-cols-3 gap-3 border-b border-white/10 py-2"
                key={allocation.assetMint}
              >
                <span className="text-white">
                  {getAsset(allocation.assetMint)?.symbol ??
                    allocation.assetMint}
                </span>
                <span className="text-slate-400">
                  {previous ? `${previous.weightBps / 100}%` : "0%"}
                </span>
                <span className="text-teal-100">
                  to {allocation.weightBps / 100}%
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.04] p-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-white">
            Your Required Trades
          </h2>
          <button
            className="rounded-md border border-teal-300/40 px-3 py-2 text-sm text-teal-100 disabled:opacity-60"
            disabled={isReviewing || isUpToDate}
            onClick={() => void reviewRebalance()}
            type="button"
          >
            {isReviewing ? "Reviewing" : "Review Trades"}
          </button>
        </div>
        <div className="mt-4 space-y-3 text-sm">
          {trades.length === 0 ? (
            <p className="text-slate-400">
              Review to calculate required trades.
            </p>
          ) : null}
          {trades.map((trade) => (
            <div
              className="flex justify-between border-b border-white/10 py-2"
              key={`${trade.side}:${trade.assetMint}`}
            >
              <span
                className={
                  trade.side === "SELL" ? "text-amber-200" : "text-teal-200"
                }
              >
                {trade.side}{" "}
                {getAsset(trade.assetMint)?.symbol ?? trade.assetMint}
              </span>
              <span className="text-white">
                ${formatAtomic(trade.valueUsdcAtomic, 6)}
              </span>
            </div>
          ))}
        </div>
        {valuedPositions.length > 0 ? (
          <p className="mt-4 text-sm text-slate-400">
            Estimated execution is based on current Jupiter quotes for
            attributed StratIn positions only.
          </p>
        ) : null}
        {feeBreakdown ? (
          <div className="mt-5 border-t border-white/10 pt-4 text-sm">
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Rebalance Value</span>
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
          </div>
        ) : null}
        <button
          className="mt-5 rounded-md bg-teal-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
          disabled={
            !walletAddress || isExecuting || isUpToDate || trades.length === 0
          }
          onClick={() => void executeRebalance()}
          type="button"
        >
          {isExecuting ? "Rebalancing" : "Rebalance"}
        </button>
      </section>

      {statuses.length > 0 ? (
        <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.04] p-5 text-sm">
          {statuses.map((status) => (
            <div className="mt-2" key={status.key}>
              <p className="text-slate-200">
                {status.key}: {status.status}
              </p>
              {status.signature ? (
                <p className="break-all text-xs text-teal-200">
                  {status.signature}
                </p>
              ) : null}
              {status.error ? (
                <p className="break-all text-xs text-red-300">{status.error}</p>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}
      {success ? <p className="mt-4 text-sm text-teal-200">{success}</p> : null}
      {feeSignature ? (
        <p className="mt-2 break-all text-xs text-teal-200">
          Fee: {feeSignature}
        </p>
      ) : null}
      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
    </main>
  );
}
