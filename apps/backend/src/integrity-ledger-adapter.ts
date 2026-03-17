export interface RegisterEvidenceInput {
  hash: string;
  sensorId: string;
  buildingId: string;
  eventTimestamp: string;
}

export interface RegisterEvidenceOutput {
  txId: string;
  committedAt: string;
}

export interface IntegrityLedgerAdapter {
  registerEvidence(input: RegisterEvidenceInput): Promise<RegisterEvidenceOutput>;
}
