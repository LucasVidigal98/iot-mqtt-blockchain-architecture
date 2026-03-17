import { createHash } from "node:crypto";
import type {
  IntegrityLedgerAdapter,
  RegisterEvidenceInput,
  RegisterEvidenceOutput
} from "./integrity-ledger-adapter.js";

export class IntegrityLedgerMockAdapter implements IntegrityLedgerAdapter {
  async registerEvidence(input: RegisterEvidenceInput): Promise<RegisterEvidenceOutput> {
    const txId = createHash("sha256")
      .update(`${input.hash}:${input.sensorId}:${input.buildingId}:${input.eventTimestamp}`, "utf-8")
      .digest("hex")
      .slice(0, 32);

    return {
      txId: `mock-tx-${txId}`,
      committedAt: new Date().toISOString()
    };
  }
}
