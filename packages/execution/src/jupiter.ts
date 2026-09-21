import type {
  BuildTransactionRequest,
  BuiltExecutionTransaction,
  ExecutionProvider,
  ExecutionQuote,
  QuoteRequest
} from "./types";

const DEFAULT_JUPITER_BASE_URL = "https://lite-api.jup.ag/swap/v1";

type JupiterQuoteResponse = {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  slippageBps: number;
  priceImpactPct?: string;
  routePlan?: {
    swapInfo?: {
      label?: string;
    };
  }[];
};

type JupiterSwapResponse = {
  swapTransaction?: string;
  lastValidBlockHeight?: number;
  error?: string;
};

export class JupiterExecutionProvider implements ExecutionProvider {
  readonly id = "jupiter";

  constructor(private readonly baseUrl = DEFAULT_JUPITER_BASE_URL) {}

  async getQuote({
    inputMint,
    outputMint,
    amountAtomic,
    slippageBps
  }: QuoteRequest): Promise<ExecutionQuote> {
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: amountAtomic.toString(),
      slippageBps: slippageBps.toString(),
      restrictIntermediateTokens: "true",
      instructionVersion: "V2",
      asLegacyTransaction: "false"
    });

    const response = await fetch(`${this.baseUrl}/quote?${params.toString()}`);
    const quote = (await response.json()) as JupiterQuoteResponse & { error?: string };

    if (!response.ok || quote.error) {
      throw new Error(quote.error ?? `Jupiter quote failed with status ${response.status}.`);
    }

    const routeLabels =
      quote.routePlan?.flatMap((route) => (route.swapInfo?.label ? [route.swapInfo.label] : [])) ??
      [];

    return {
      inputMint: quote.inputMint,
      outputMint: quote.outputMint,
      inAmountAtomic: BigInt(quote.inAmount),
      outAmountAtomic: BigInt(quote.outAmount),
      slippageBps: quote.slippageBps,
      priceImpactPct: quote.priceImpactPct,
      routeLabels,
      rawQuote: quote
    };
  }

  async buildTransaction({
    quote,
    userPublicKey
  }: BuildTransactionRequest): Promise<BuiltExecutionTransaction> {
    const response = await fetch(`${this.baseUrl}/swap`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        quoteResponse: quote.rawQuote,
        userPublicKey,
        dynamicComputeUnitLimit: true,
        dynamicSlippage: true,
        asLegacyTransaction: false,
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: {
            maxLamports: 1_000_000,
            priorityLevel: "high"
          }
        }
      })
    });
    const swap = (await response.json()) as JupiterSwapResponse;

    if (!response.ok || swap.error || !swap.swapTransaction) {
      throw new Error(swap.error ?? `Jupiter swap build failed with status ${response.status}.`);
    }

    return {
      serializedTransactionBase64: swap.swapTransaction,
      lastValidBlockHeight: swap.lastValidBlockHeight
    };
  }
}
