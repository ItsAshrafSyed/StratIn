import { proxyRpcRequest } from "../rpc-proxy";
import { getServerSolanaRpcUrl } from "./rpc-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return proxyRpcRequest({
    request,
    upstreamUrl: getServerSolanaRpcUrl(),
    label: "Solana RPC",
  });
}
