const CONTRACT_ADDRESS = process.env.GENLAYER_OMNIMARKET_V3_CONTRACT_ADDRESS?.trim() ?? "";
const PUBLIC_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_OMNIMARKET_V3_CONTRACT_ADDRESS?.trim() ?? "";
const RPC_URL = process.env.GENLAYER_RPC_URL?.trim() ?? "";
const CHAIN_ID = process.env.GENLAYER_CHAIN_ID?.trim().toLowerCase() || "bradbury";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

export async function GET() {
  const serverAddressValid = /^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS);
  const publicAddressValid = /^0x[0-9a-fA-F]{40}$/.test(PUBLIC_CONTRACT_ADDRESS);
  const addressMatch = serverAddressValid && publicAddressValid && CONTRACT_ADDRESS.toLowerCase() === PUBLIC_CONTRACT_ADDRESS.toLowerCase();
  const configured = serverAddressValid && addressMatch && CHAIN_ID === "bradbury" && Boolean(RPC_URL);

  return json({
    ok: configured,
    service: "omnimarket-v3-api",
    status: configured ? "configured" : "misconfigured",
    chain: CHAIN_ID,
    rpcConfigured: Boolean(RPC_URL),
    serverAddressValid,
    publicAddressValid,
    addressMatch,
    checkedAt: new Date().toISOString(),
  }, configured ? 200 : 503);
}
