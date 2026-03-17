import type { SensorMessage } from "@iot/shared";
import { generateSensorMessageHash } from "./hash-service.js";
import type { IntegrityLedgerAdapter } from "./integrity-ledger-adapter.js";
import type { SensorRepository } from "./repository/sensor-repository.js";
import type { ProcessingResult } from "./types.js";

export interface ProcessingDependencies {
  repository: SensorRepository;
  ledgerAdapter: IntegrityLedgerAdapter;
}

export async function processSensorMessage(
  payload: SensorMessage,
  receivedAt: string,
  dependencies: ProcessingDependencies
): Promise<ProcessingResult> {
  const record = await dependencies.repository.insertInitial(payload, receivedAt);
  const hash = generateSensorMessageHash(payload);

  try {
    const ledgerResult = await dependencies.ledgerAdapter.registerEvidence({
      hash,
      sensorId: payload.sensorId,
      buildingId: payload.buildingId,
      eventTimestamp: payload.timestamp
    });

    await dependencies.repository.markProcessed(record.id, {
      hash,
      processingStatus: "ledger_committed",
      ledgerRefMock: ledgerResult.txId,
      processingError: null,
      updatedAt: new Date().toISOString()
    });

    return {
      ok: true,
      recordId: record.id,
      hash
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "unknown_ledger_error";

    await dependencies.repository.markProcessed(record.id, {
      hash,
      processingStatus: "ledger_failed",
      ledgerRefMock: null,
      processingError: errorMessage,
      updatedAt: new Date().toISOString()
    });

    return {
      ok: false,
      recordId: record.id,
      hash,
      error: errorMessage
    };
  }
}
