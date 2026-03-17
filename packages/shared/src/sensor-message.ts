export type SensorType = "temperature" | "lighting";

export type LightingValue = "ON" | "OFF";

export interface SensorMessage {
  sensorId: string;
  buildingId: string;
  type: SensorType;
  value: number | LightingValue;
  timestamp: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateSensorMessage(payload: SensorMessage): ValidationResult {
  if (!payload.sensorId.trim()) {
    return { valid: false, error: "sensorId must not be empty" };
  }

  if (!payload.buildingId.trim()) {
    return { valid: false, error: "buildingId must not be empty" };
  }

  if (!isValidTimestamp(payload.timestamp)) {
    return { valid: false, error: "timestamp must be an ISO 8601 date" };
  }

  if (payload.type === "temperature" && typeof payload.value !== "number") {
    return { valid: false, error: "temperature sensors require numeric value" };
  }

  if (
    payload.type === "lighting" &&
    payload.value !== "ON" &&
    payload.value !== "OFF"
  ) {
    return { valid: false, error: "lighting sensors require ON/OFF value" };
  }

  return { valid: true };
}

export function isValidTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}
