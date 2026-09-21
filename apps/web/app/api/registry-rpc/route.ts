import { getServerRegistryRpcUrl } from "./rpc-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = await request.text();
    const response = await fetch(getServerRegistryRpcUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: payload,
      cache: "no-store"
    });
    const body = await response.text();

    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") ?? "application/json",
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown registry RPC proxy error.";

    return Response.json({ error: `Registry RPC proxy failed: ${message}` }, { status: 502 });
  }
}
