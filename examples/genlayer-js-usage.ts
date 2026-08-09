import { createClient } from "genlayer-js";

const client = createClient({
  endpoint: process.env.GENLAYER_RPC_URL!,
});

const contractAddress = process.env.OMNIMARKET_ADDRESS!;

export async function createExampleMarket() {
  return client.writeContract({
    address: contractAddress,
    functionName: "create_market",
    args: [
      "Will genlayerlabs/genlayer-project-boilerplate exist on GitHub?",
      "Yes",
      "No",
      "Outcome 0 wins only if the GitHub API identifies the repository as existing.",
      "https://api.github.com/repos/genlayerlabs/genlayer-project-boilerplate",
      9999999999n,
      10000n,
    ],
  });
}

export async function getYesPrice(marketId: bigint) {
  return client.readContract({
    address: contractAddress,
    functionName: "get_price_bps",
    args: [marketId, 0],
  });
}

