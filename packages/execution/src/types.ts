import type { AllocationLeg } from "@stratin/strategy-engine";

export type QuoteRequest = Readonly<{
  inputMint: string;
  outputMint: string;
  amountAtomic: bigint;
  slippageBps: number;
}>;

export type ExecutionQuote = Readonly<{
  inputMint: string;
  outputMint: string;
  inAmountAtomic: bigint;
  outAmountAtomic: bigint;
  slippageBps: number;
  priceImpactPct?: string;
  routeLabels: readonly string[];
  rawQuote: unknown;
}>;

export type BuildTransactionRequest = Readonly<{
  quote: ExecutionQuote;
  userPublicKey: string;
}>;

export type BuiltExecutionTransaction = Readonly<{
  serializedTransactionBase64: string;
  lastValidBlockHeight?: number;
}>;

export type ExecutionProvider = Readonly<{
  id: string;
  getQuote(request: QuoteRequest): Promise<ExecutionQuote>;
  buildTransaction(request: BuildTransactionRequest): Promise<BuiltExecutionTransaction>;
}>;

export type ExecutableAllocationLeg = AllocationLeg & Readonly<{
  quote?: ExecutionQuote;
}>;
