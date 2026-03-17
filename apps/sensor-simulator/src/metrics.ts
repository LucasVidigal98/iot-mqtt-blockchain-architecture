export interface MetricsSnapshot {
  startedAt: string;
  uptimeMs: number;
  publishedTotal: number;
  publishErrors: number;
  validationErrors: number;
  droppedDisconnected: number;
  publishedBySensor: Record<string, number>;
}

export class MetricsCollector {
  private readonly startedAtDate = new Date();
  private readonly publishedBySensor = new Map<string, number>();

  private publishedTotal = 0;
  private publishErrors = 0;
  private validationErrors = 0;
  private droppedDisconnected = 0;

  incrementPublished(sensorId: string): void {
    this.publishedTotal += 1;
    this.publishedBySensor.set(sensorId, (this.publishedBySensor.get(sensorId) ?? 0) + 1);
  }

  incrementPublishError(): void {
    this.publishErrors += 1;
  }

  incrementValidationError(): void {
    this.validationErrors += 1;
  }

  incrementDroppedDisconnected(): void {
    this.droppedDisconnected += 1;
  }

  snapshot(): MetricsSnapshot {
    return {
      startedAt: this.startedAtDate.toISOString(),
      uptimeMs: Date.now() - this.startedAtDate.getTime(),
      publishedTotal: this.publishedTotal,
      publishErrors: this.publishErrors,
      validationErrors: this.validationErrors,
      droppedDisconnected: this.droppedDisconnected,
      publishedBySensor: Object.fromEntries(this.publishedBySensor.entries())
    };
  }
}
