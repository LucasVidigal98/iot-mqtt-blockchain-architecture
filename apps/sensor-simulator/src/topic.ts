import type { SensorType } from "@iot/shared";

export function buildTopic(
  template: string,
  params: { buildingId: string; type: SensorType; sensorId: string }
): string {
  return template
    .replaceAll("{buildingId}", params.buildingId)
    .replaceAll("{type}", params.type)
    .replaceAll("{sensorId}", params.sensorId);
}
