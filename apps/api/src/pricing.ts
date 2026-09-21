import { USDC_MINT } from "@stratin/shared";
import type { PriceProvider } from "@stratin/strategy-engine";

const DEFAULT_JUPITER_BASE_URL = "https://lite-api.jup.ag/swap/v1";

type JupiterQuoteResponse = {
  inAmount: string;
  outAmount: string;
  error?: string;
};

export class JupiterPriceProvider implements PriceProvider {
  constructor(private readonly baseUrl = DEFAULT_JUPITER_BASE_URL) {}

  async getUsdValue(assetMint: string, quantityAtomic: bigint): Promise<bigint> {
    if (assetMint === USDC_MINT) {
      return quantityAtomic;
    }
    return this.quote(assetMint, USDC_MINT, quantityAtomic);
  }

  async getQuantityForUsdValue(assetMint: string, usdcAmountAtomic: bigint): Promise<bigint> {
    if (assetMint === USDC_MINT) {
      return usdcAmountAtomic;
    }
    return this.quote(USDC_MINT, assetMint, usdcAmountAtomic);
  }

  private async quote(inputMint: string, outputMint: string, amountAtomic: bigint): Promise<bigint> {
    if (amountAtomic < 0n) {
      throw new Error("Cannot quote a negative amount.");
    }

    if (amountAtomic === 0n) {
      return 0n;
    }

    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: amountAtomic.toString(),
      slippageBps: "100",
      restrictIntermediateTokens: "true",
      instructionVersion: "V2",
      asLegacyTransaction: "false"
    });
    const response = await fetch(`${this.baseUrl}/quote?${params.toString()}`);
    const quote = (await response.json()) as JupiterQuoteResponse;

    if (!response.ok || quote.error) {
      throw new Error(quote.error ?? `Jupiter price quote failed with status ${response.status}.`);
    }

    return BigInt(quote.outAmount);
  }
}
