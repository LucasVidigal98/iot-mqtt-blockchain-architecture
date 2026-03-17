export type LogLevel = "info" | "warn" | "error";

export function log(level: LogLevel, event: string, data: object = {}): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(data as Record<string, unknown>)
  };

  console.log(JSON.stringify(payload));
}
