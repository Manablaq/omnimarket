import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

type HexAddress = `0x${string}`;

const client = createClient({
  chain: testnetBradbury,
});

const contractAddress = process.env.GENLAYER_OMNIMARKET_CONTRACT_ADDRESS as HexAddress;

export async function createExampleMarket() {
  const seedLiquidity = BigInt("2000000000000000000");
  const closeTime = BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60);
  const sources = [
    "https://api.github.com/repos/genlayerlabs/genlayer-project-boilerplate",
    "https://github.com/genlayerlabs/genlayer-project-boilerplate",
    "https://raw.githubusercontent.com/genlayerlabs/genlayer-project-boilerplate/main/README.md",
    "https://api.github.com/repos/genlayerlabs/genlayer-project-boilerplate/contents",
    "https://github.com/genlayerlabs/genlayer-project-boilerplate/blob/main/README.md",
  ];
  return client.writeContract({
    address: contractAddress,
    functionName: "create_market",
    args: [
      "Will genlayerlabs/genlayer-project-boilerplate exist on GitHub?",
      "Yes",
      "No",
      "Outcome 0 wins only if the GitHub API identifies the repository as existing.",
      ...sources,
      closeTime,
      seedLiquidity,
    ],
    value: seedLiquidity,
  });
}

export async function getYesPrice(marketId: bigint) {
  return client.readContract({
    address: contractAddress,
    functionName: "get_price_bps",
    args: [marketId, 0],
  });
}
