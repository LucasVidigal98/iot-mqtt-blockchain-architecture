import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { IntegrityLedgerEthereumAdapter } from "./integrity-ledger-ethereum.js";

describe("IntegrityLedgerEthereumAdapter", () => {
  it("registers evidence and maps tx id/committedAt", async () => {
    const adapter = new IntegrityLedgerEthereumAdapter(
      {
        rpcUrl: "http://localhost:8545",
        privateKey: "0xabc",
        contractAddress: "0x1111111111111111111111111111111111111111"
      },
      {
        contract: {
          registerEvidence: async () => ({
            hash: "0xmocktx",
            wait: async () => ({ blockNumber: 7 })
          })
        },
        provider: {
          getBlock: async () => ({ timestamp: 1710000000 })
        }
      }
    );

    const result = await adapter.registerEvidence({
      hash: "f".repeat(64),
      sensorId: "temp-01",
      buildingId: "building-A",
      eventTimestamp: "2026-03-17T12:00:00.000Z"
    });

    assert.equal(result.txId, "0xmocktx");
    assert.equal(result.committedAt, "2024-03-09T16:00:00.000Z");
  });

  it("fails for invalid hash format", async () => {
    const adapter = new IntegrityLedgerEthereumAdapter(
      {
        rpcUrl: "http://localhost:8545",
        privateKey: "0xabc",
        contractAddress: "0x1111111111111111111111111111111111111111"
      },
      {
        contract: {
          registerEvidence: async () => ({
            hash: "0xmocktx",
            wait: async () => ({ blockNumber: null })
          })
        },
        provider: {
          getBlock: async () => null
        }
      }
    );

    await assert.rejects(
      adapter.registerEvidence({
        hash: "invalid-hash",
        sensorId: "temp-01",
        buildingId: "building-A",
        eventTimestamp: "2026-03-17T12:00:00.000Z"
      }),
      /invalid_sha256_hash/
    );
  });
});
