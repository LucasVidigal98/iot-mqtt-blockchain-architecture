export type LogLevel = "info" | "warn" | "error";

export function log(level: LogLevel, event: string, data: Record<string, unknown> = {}): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...data
  };

  console.log(JSON.stringify(payload));
}
