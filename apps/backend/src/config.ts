export interface BackendConfig {
  mqttUrl: string;
  mqttTopicFilter: string;
  mongoUri: string;
  mongoDatabase: string;
  mongoCollection: string;
  ledgerMode: "mock" | "ethereum";
  ethereumRpcUrl: string;
  ethereumPrivateKey: string;
  integrityRegistryAddress: string;
}

export function loadConfig(): BackendConfig {
  const ledgerModeValue = process.env.LEDGER_MODE?.toLowerCase();
  const ledgerMode: "mock" | "ethereum" = ledgerModeValue === "ethereum" ? "ethereum" : "mock";

  const config: BackendConfig = {
    mqttUrl: process.env.MQTT_URL ?? "mqtt://localhost:1883",
    mqttTopicFilter: process.env.MQTT_TOPIC_FILTER ?? "iot/buildings/+/sensors/+/+",
    mongoUri: process.env.MONGO_URI ?? "mongodb://localhost:27017",
    mongoDatabase: process.env.MONGO_DB ?? "iot_experiment",
    mongoCollection: process.env.MONGO_COLLECTION ?? "sensor_readings",
    ledgerMode,
    ethereumRpcUrl: process.env.ETH_RPC_URL ?? "http://localhost:8545",
    ethereumPrivateKey: process.env.ETH_PRIVATE_KEY ?? "",
    integrityRegistryAddress: process.env.INTEGRITY_REGISTRY_ADDRESS ?? ""
  };

  if (config.ledgerMode === "ethereum") {
    if (!config.ethereumPrivateKey.trim()) {
      throw new Error("ETH_PRIVATE_KEY is required when LEDGER_MODE=ethereum");
    }

    if (!config.integrityRegistryAddress.trim()) {
      throw new Error("INTEGRITY_REGISTRY_ADDRESS is required when LEDGER_MODE=ethereum");
    }
  }

  return config;
}
