export interface SimulatorConfig {
  mqttUrl: string;
  buildingId: string;
  topicTemplate: string;
  temperatureIntervalMs: number;
  lightMinIntervalMs: number;
  lightMaxIntervalMs: number;
  metricsIntervalMs: number;
  seed: number;
  temperatureSensorIds: string[];
  lightSensorIds: string[];
}

function parseNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for ${name}: ${raw}`);
  }

  return parsed;
}

function parseList(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function loadConfig(): SimulatorConfig {
  const lightMinIntervalMs = parseNumber("LIGHT_MIN_INTERVAL_MS", 30000);
  const lightMaxIntervalMs = parseNumber("LIGHT_MAX_INTERVAL_MS", 60000);

  if (lightMinIntervalMs > lightMaxIntervalMs) {
    throw new Error("LIGHT_MIN_INTERVAL_MS cannot be greater than LIGHT_MAX_INTERVAL_MS");
  }

  return {
    mqttUrl: process.env.MQTT_URL ?? "mqtt://localhost:1883",
    buildingId: process.env.BUILDING_ID ?? "building-A",
    topicTemplate:
      process.env.TOPIC_TEMPLATE ?? "iot/buildings/{buildingId}/sensors/{type}/{sensorId}",
    temperatureIntervalMs: parseNumber("TEMPERATURE_INTERVAL_MS", 5000),
    lightMinIntervalMs,
    lightMaxIntervalMs,
    metricsIntervalMs: parseNumber("METRICS_INTERVAL_MS", 60000),
    seed: parseNumber("SIMULATION_SEED", 42),
    temperatureSensorIds: parseList("TEMPERATURE_SENSOR_IDS", [
      "temp-01",
      "temp-02",
      "temp-03"
    ]),
    lightSensorIds: parseList("LIGHT_SENSOR_IDS", ["light-01", "light-02"])
  };
}
