import { createHash } from "node:crypto";
import type { SensorMessage } from "@iot/shared";

interface CanonicalSensorPayload {
  sensorId: string;
  buildingId: string;
  type: SensorMessage["type"];
  value: SensorMessage["value"];
  timestamp: string;
}

export function canonicalizeSensorMessage(message: SensorMessage): string {
  const canonical: CanonicalSensorPayload = {
    sensorId: message.sensorId,
    buildingId: message.buildingId,
    type: message.type,
    value: message.value,
    timestamp: message.timestamp
  };

  return JSON.stringify(canonical);
}

export function generateSensorMessageHash(message: SensorMessage): string {
  return createHash("sha256").update(canonicalizeSensorMessage(message), "utf-8").digest("hex");
}
