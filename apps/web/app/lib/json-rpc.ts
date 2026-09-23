type JsonRpcResponse<T> = {
  result?: T;
  error?: { message: string };
};

export async function jsonRpcRequest<T>({
  url,
  label,
  method,
  params,
}: {
  url: string;
  label: string;
  method: string;
  params: unknown[];
}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params,
    }),
  });
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    const body = await response.text();
    throw new Error(
      `${label} ${method} expected JSON from ${url}, got ${response.status} ${
        response.statusText || "response"
      } (${contentType || "no content-type"}). Preview: ${body.slice(0, 120)}`,
    );
  }

  const payload = (await response.json()) as JsonRpcResponse<T>;

  if (!response.ok || payload.error) {
    throw new Error(
      `${label} ${method} failed: ${payload.error?.message ?? response.statusText}`,
    );
  }

  if (payload.result === undefined) {
    throw new Error(`${label} ${method} returned no result.`);
  }

  return payload.result;
}
