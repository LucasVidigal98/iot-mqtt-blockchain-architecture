import type { SensorMessage } from "@iot/shared";
import type { ProcessingStatus } from "../types.js";

export interface PersistedRecordMeta {
  id: string;
  receivedAt: string;
}

export interface SensorRepository {
  connect(): Promise<void>;
  close(): Promise<void>;
  insertInitial(payload: SensorMessage, receivedAt: string): Promise<PersistedRecordMeta>;
  markProcessed(
    id: string,
    update: {
      hash: string;
      processingStatus: ProcessingStatus;
      ledgerTxId: string | null;
      processingError: string | null;
      updatedAt: string;
    }
  ): Promise<void>;
}
