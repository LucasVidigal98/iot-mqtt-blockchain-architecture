import { validateSensorMessage, type SensorMessage } from "@iot/shared";

export interface ParsedMessageResult {
  valid: boolean;
  payload?: SensorMessage;
  error?: string;
}

export function parseAndValidateMessage(rawPayload: string): ParsedMessageResult {
  let parsedUnknown: unknown;

  try {
    parsedUnknown = JSON.parse(rawPayload);
  } catch {
    return {
      valid: false,
      error: "invalid_json"
    };
  }

  const payload = parsedUnknown as SensorMessage;

  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof payload.sensorId !== "string" ||
    typeof payload.buildingId !== "string" ||
    typeof payload.type !== "string" ||
    typeof payload.timestamp !== "string" ||
    !(typeof payload.value === "number" || typeof payload.value === "string")
  ) {
    return {
      valid: false,
      error: "invalid_message_shape"
    };
  }

  const validationResult = validateSensorMessage(payload);

  if (!validationResult.valid) {
    return {
      valid: false,
      error: validationResult.error ?? "validation_failed"
    };
  }

  return {
    valid: true,
    payload
  };
}
