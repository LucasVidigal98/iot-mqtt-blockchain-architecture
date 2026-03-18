import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SensorMessage } from "@iot/shared";
import type { IntegrityLedgerAdapter, RegisterEvidenceInput } from "./integrity-ledger-adapter.js";
import { processSensorMessage } from "./pipeline.js";
import type { SensorRepository } from "./repository/sensor-repository.js";

class InMemoryRepository implements SensorRepository {
  public inserted = new Map<
    string,
    {
      payload: SensorMessage;
      receivedAt: string;
      hash: string | null;
      processingStatus: string;
      ledgerTxId: string | null;
      processingError: string | null;
    }
  >();

  private id = 0;

  async connect(): Promise<void> {
    return Promise.resolve();
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }

  async insertInitial(payload: SensorMessage, receivedAt: string): Promise<{ id: string; receivedAt: string }> {
    const recordId = String(++this.id);
    this.inserted.set(recordId, {
      payload,
      receivedAt,
      hash: null,
      processingStatus: "stored",
      ledgerTxId: null,
      processingError: null
    });

    return { id: recordId, receivedAt };
  }

  async markProcessed(
    id: string,
    update: {
      hash: string;
      processingStatus: "stored" | "ledger_committed" | "ledger_failed" | "invalid_message";
      ledgerTxId: string | null;
      processingError: string | null;
      updatedAt: string;
    }
  ): Promise<void> {
    const record = this.inserted.get(id);

    if (!record) {
      throw new Error("record_not_found");
    }

    record.hash = update.hash;
    record.processingStatus = update.processingStatus;
    record.ledgerTxId = update.ledgerTxId;
    record.processingError = update.processingError;
  }
}

class SuccessfulLedgerAdapter implements IntegrityLedgerAdapter {
  public calls: RegisterEvidenceInput[] = [];

  async registerEvidence(input: RegisterEvidenceInput): Promise<{ txId: string; committedAt: string }> {
    this.calls.push(input);
    return {
      txId: "mock-tx-1",
      committedAt: new Date().toISOString()
    };
  }
}

class FailingLedgerAdapter implements IntegrityLedgerAdapter {
  async registerEvidence(): Promise<{ txId: string; committedAt: string }> {
    throw new Error("ledger_down");
  }
}

describe("processSensorMessage", () => {
  const payload: SensorMessage = {
    sensorId: "temp-01",
    buildingId: "building-A",
    type: "temperature",
    value: 24.32,
    timestamp: "2026-03-16T20:00:00.000Z"
  };

  it("persists, hashes and commits with adapter", async () => {
    const repository = new InMemoryRepository();
    const adapter = new SuccessfulLedgerAdapter();

    const result = await processSensorMessage(payload, "2026-03-16T20:00:01.000Z", {
      repository,
      ledgerAdapter: adapter
    });

    assert.equal(result.ok, true);
    assert.equal(adapter.calls.length, 1);
    assert.equal(adapter.calls[0]?.sensorId, "temp-01");

    const record = repository.inserted.get(result.recordId ?? "");
    assert.ok(record);
    assert.equal(record?.processingStatus, "ledger_committed");
    assert.equal(record?.ledgerTxId, "mock-tx-1");
    assert.equal(record?.hash, result.hash);
  });

  it("marks failure when adapter fails but preserves record", async () => {
    const repository = new InMemoryRepository();
    const adapter = new FailingLedgerAdapter();

    const result = await processSensorMessage(payload, "2026-03-16T20:00:01.000Z", {
      repository,
      ledgerAdapter: adapter
    });

    assert.equal(result.ok, false);

    const record = repository.inserted.get(result.recordId ?? "");
    assert.ok(record);
    assert.equal(record?.processingStatus, "ledger_failed");
    assert.equal(record?.processingError, "ledger_down");
    assert.ok(record?.hash);
  });

  it("generates deterministic hash for same payload", async () => {
    const repository = new InMemoryRepository();
    const adapter = new SuccessfulLedgerAdapter();

    const resultA = await processSensorMessage(payload, "2026-03-16T20:00:01.000Z", {
      repository,
      ledgerAdapter: adapter
    });

    const resultB = await processSensorMessage(payload, "2026-03-16T20:00:02.000Z", {
      repository,
      ledgerAdapter: adapter
    });

    assert.equal(resultA.hash, resultB.hash);
  });
});
