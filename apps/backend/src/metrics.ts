export interface MetricsSnapshot {
  startedAt: string;
  uptimeMs: number;
  messagesReceived: number;
  messagesProcessed: number;
  validationErrors: number;
  parseErrors: number;
  ledgerFailures: number;
}

export class MetricsCollector {
  private readonly startedAtDate = new Date();

  private messagesReceived = 0;
  private messagesProcessed = 0;
  private validationErrors = 0;
  private parseErrors = 0;
  private ledgerFailures = 0;

  incrementReceived(): void {
    this.messagesReceived += 1;
  }

  incrementProcessed(): void {
    this.messagesProcessed += 1;
  }

  incrementValidationError(): void {
    this.validationErrors += 1;
  }

  incrementParseError(): void {
    this.parseErrors += 1;
  }

  incrementLedgerFailure(): void {
    this.ledgerFailures += 1;
  }

  snapshot(): MetricsSnapshot {
    return {
      startedAt: this.startedAtDate.toISOString(),
      uptimeMs: Date.now() - this.startedAtDate.getTime(),
      messagesReceived: this.messagesReceived,
      messagesProcessed: this.messagesProcessed,
      validationErrors: this.validationErrors,
      parseErrors: this.parseErrors,
      ledgerFailures: this.ledgerFailures
    };
  }
}
