import mqtt from "mqtt";
import {
  type LightingValue,
  type SensorMessage,
  type SensorType,
  validateSensorMessage
} from "@iot/shared";
import { loadConfig } from "./config.js";
import { log } from "./logger.js";
import { MetricsCollector } from "./metrics.js";
import { SeededRandom } from "./random.js";
import { buildTopic } from "./topic.js";

const config = loadConfig();
const rng = new SeededRandom(config.seed);
const metrics = new MetricsCollector();

const mqttClient = mqtt.connect(config.mqttUrl, {
  reconnectPeriod: 1000
});

const timers = new Set<NodeJS.Timeout>();
const lightState = new Map<string, LightingValue>();
let started = false;

function scheduleInterval(handler: () => void, intervalMs: number): void {
  const timer = setInterval(handler, intervalMs);
  timers.add(timer);
}

function scheduleTimeout(handler: () => void, timeoutMs: number): void {
  const timer = setTimeout(() => {
    timers.delete(timer);
    handler();
  }, timeoutMs);
  timers.add(timer);
}

function buildTemperatureValue(): number {
  const value = rng.nextBetween(18.0, 30.0);
  return Number(value.toFixed(2));
}

function buildMessage(sensorId: string, type: SensorType, value: number | LightingValue): SensorMessage {
  return {
    sensorId,
    buildingId: config.buildingId,
    type,
    value,
    timestamp: new Date().toISOString()
  };
}

function publishMessage(message: SensorMessage): void {
  const validation = validateSensorMessage(message);

  if (!validation.valid) {
    metrics.incrementValidationError();
    log("warn", "sensor_message_validation_failed", {
      sensorId: message.sensorId,
      reason: validation.error
    });
    return;
  }

  if (!mqttClient.connected) {
    metrics.incrementDroppedDisconnected();
    log("warn", "mqtt_client_disconnected_drop", {
      sensorId: message.sensorId
    });
    return;
  }

  const topic = buildTopic(config.topicTemplate, {
    buildingId: message.buildingId,
    type: message.type,
    sensorId: message.sensorId
  });

  mqttClient.publish(topic, JSON.stringify(message), { qos: 0 }, (error?: Error) => {
    if (error) {
      metrics.incrementPublishError();
      log("error", "mqtt_publish_failed", {
        sensorId: message.sensorId,
        topic,
        error: error.message
      });
      return;
    }

    metrics.incrementPublished(message.sensorId);
    log("info", "sensor_message_published", {
      sensorId: message.sensorId,
      topic,
      payload: message
    });
  });
}

function startTemperatureSensors(): void {
  for (const sensorId of config.temperatureSensorIds) {
    publishMessage(buildMessage(sensorId, "temperature", buildTemperatureValue()));

    scheduleInterval(() => {
      publishMessage(buildMessage(sensorId, "temperature", buildTemperatureValue()));
    }, config.temperatureIntervalMs);
  }
}

function scheduleNextLightingPublish(sensorId: string): void {
  const interval = rng.nextInt(config.lightMinIntervalMs, config.lightMaxIntervalMs);

  scheduleTimeout(() => {
    const previous = lightState.get(sensorId) ?? "OFF";
    const nextState: LightingValue = previous === "OFF" ? "ON" : "OFF";

    lightState.set(sensorId, nextState);
    publishMessage(buildMessage(sensorId, "lighting", nextState));
    scheduleNextLightingPublish(sensorId);
  }, interval);
}

function startLightingSensors(): void {
  for (const sensorId of config.lightSensorIds) {
    lightState.set(sensorId, "OFF");
    scheduleNextLightingPublish(sensorId);
  }
}

function startMetricsReporter(): void {
  scheduleInterval(() => {
    log("info", "simulation_metrics", metrics.snapshot());
  }, config.metricsIntervalMs);
}

function startSimulationOnce(): void {
  if (started) {
    return;
  }

  started = true;

  log("info", "simulation_started", {
    mqttUrl: config.mqttUrl,
    buildingId: config.buildingId,
    temperatureSensors: config.temperatureSensorIds,
    lightSensors: config.lightSensorIds,
    topicTemplate: config.topicTemplate,
    temperatureIntervalMs: config.temperatureIntervalMs,
    lightMinIntervalMs: config.lightMinIntervalMs,
    lightMaxIntervalMs: config.lightMaxIntervalMs,
    seed: config.seed
  });

  startTemperatureSensors();
  startLightingSensors();
  startMetricsReporter();
}

function shutdown(signal: string): void {
  log("info", "simulation_shutdown_requested", { signal });

  for (const timer of timers) {
    clearTimeout(timer);
    clearInterval(timer);
  }

  log("info", "simulation_final_metrics", metrics.snapshot());

  mqttClient.end(true, () => {
    log("info", "mqtt_connection_closed");
    process.exit(0);
  });
}

mqttClient.on("connect", () => {
  log("info", "mqtt_connected", { mqttUrl: config.mqttUrl });
  startSimulationOnce();
});

mqttClient.on("reconnect", () => {
  log("warn", "mqtt_reconnecting", { mqttUrl: config.mqttUrl });
});

mqttClient.on("close", () => {
  log("warn", "mqtt_connection_closed_unexpected");
});

mqttClient.on("error", (error: Error) => {
  log("error", "mqtt_client_error", { error: error.message });
});

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
