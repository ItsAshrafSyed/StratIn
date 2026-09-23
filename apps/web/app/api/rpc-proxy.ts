export async function proxyRpcRequest({
  request,
  upstreamUrl,
  label,
}: {
  request: Request;
  upstreamUrl: string;
  label: string;
}) {
  try {
    const response = await fetch(upstreamUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
      cache: "no-store",
    });

    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : `Unknown ${label} proxy error.`;

    return Response.json(
      { error: `${label} proxy failed: ${message}` },
      { status: 502 },
    );
  }
}
