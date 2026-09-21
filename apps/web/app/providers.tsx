"use client";

import { createClient } from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { walletSigner } from "@solana/kit-plugin-wallet";
import { ClientProvider } from "@solana/react";
import { appConfig } from "./config";

export const solanaClient = createClient()
  .use(walletSigner({ chain: appConfig.walletChain }))
  .use(solanaRpc({ rpcUrl: appConfig.solanaRpcUrl }));

export type StratInSolanaClient = Awaited<typeof solanaClient>;

export default function Providers({ children }: { children: React.ReactNode }) {
  return <ClientProvider client={solanaClient}>{children}</ClientProvider>;
}
