export interface BackendConfig {
  mqttUrl: string;
  mqttTopicFilter: string;
  mongoUri: string;
  mongoDatabase: string;
  mongoCollection: string;
}

export function loadConfig(): BackendConfig {
  return {
    mqttUrl: process.env.MQTT_URL ?? "mqtt://localhost:1883",
    mqttTopicFilter: process.env.MQTT_TOPIC_FILTER ?? "iot/buildings/+/sensors/+/+",
    mongoUri: process.env.MONGO_URI ?? "mongodb://localhost:27017",
    mongoDatabase: process.env.MONGO_DB ?? "iot_experiment",
    mongoCollection: process.env.MONGO_COLLECTION ?? "sensor_readings"
  };
}
