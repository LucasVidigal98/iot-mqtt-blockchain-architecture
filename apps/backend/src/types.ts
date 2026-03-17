import type { SensorMessage } from "@iot/shared";

export type ProcessingStatus =
  | "stored"
  | "ledger_committed"
  | "ledger_failed"
  | "invalid_message";

export interface PersistedSensorRecord {
  id: string;
  payload: SensorMessage;
  receivedAt: string;
  hash: string | null;
  processingStatus: ProcessingStatus;
  ledgerRefMock: string | null;
  processingError: string | null;
  updatedAt: string;
}

export interface ProcessingResult {
  ok: boolean;
  recordId?: string;
  hash?: string;
  error?: string;
}
