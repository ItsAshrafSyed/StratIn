type SolanaWalletChain = "solana:mainnet" | "solana:devnet" | "solana:testnet" | "solana:localnet" | `${string}:${string}`;

function parseWalletChain(value: string | undefined): SolanaWalletChain {
  if (!value) {
    return "solana:mainnet";
  }

  if (!value.includes(":")) {
    throw new Error("NEXT_PUBLIC_WALLET_CHAIN must be a Wallet Standard chain such as solana:mainnet.");
  }

  return value as SolanaWalletChain;
}

export const appConfig = {
  solanaRpcProxyUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_PROXY_URL ?? "/api/solana-rpc",
  solanaRpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
  registryRpcProxyUrl: process.env.NEXT_PUBLIC_REGISTRY_SOLANA_RPC_PROXY_URL ?? "/api/registry-rpc",
  registrySolanaRpcUrl: process.env.NEXT_PUBLIC_REGISTRY_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
  walletChain: parseWalletChain(process.env.NEXT_PUBLIC_WALLET_CHAIN),
  registryNetwork: process.env.NEXT_PUBLIC_REGISTRY_NETWORK ?? "mainnet",
  jupiterSwapApiBaseUrl:
    process.env.NEXT_PUBLIC_JUPITER_SWAP_API_BASE_URL ?? "https://lite-api.jup.ag/swap/v1",
  apiBaseUrl: process.env.NEXT_PUBLIC_STRATIN_API_URL ?? "http://localhost:8788"
} as const;
