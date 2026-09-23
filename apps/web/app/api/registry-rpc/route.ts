import { proxyRpcRequest } from "../rpc-proxy";
import { getServerRegistryRpcUrl } from "./rpc-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return proxyRpcRequest({
    request,
    upstreamUrl: getServerRegistryRpcUrl(),
    label: "Registry RPC",
  });
}
