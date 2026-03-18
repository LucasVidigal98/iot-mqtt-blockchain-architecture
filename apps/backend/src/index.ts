import { loadConfig } from "./config.js";
import { IntegrityLedgerEthereumAdapter } from "./integrity-ledger-ethereum.js";
import { IntegrityLedgerMockAdapter } from "./integrity-ledger-mock.js";
import { log } from "./logger.js";
import { parseAndValidateMessage } from "./message-validator.js";
import { MetricsCollector } from "./metrics.js";
import { createMqttConsumer } from "./mqtt-consumer.js";
import { processSensorMessage } from "./pipeline.js";
import { MongoSensorRepository } from "./repository/mongo-sensor-repository.js";

const config = loadConfig();
const metrics = new MetricsCollector();
const repository = new MongoSensorRepository(config.mongoUri, config.mongoDatabase, config.mongoCollection);
const ledgerAdapter =
  config.ledgerMode === "ethereum"
    ? new IntegrityLedgerEthereumAdapter({
        rpcUrl: config.ethereumRpcUrl,
        privateKey: config.ethereumPrivateKey,
        contractAddress: config.integrityRegistryAddress
      })
    : new IntegrityLedgerMockAdapter();
const ledgerStatusLabel = config.ledgerMode === "ethereum" ? "ethereum_committed" : "mock_committed";

const consumer = createMqttConsumer({
  mqttUrl: config.mqttUrl,
  topicFilter: config.mqttTopicFilter,
  onLog: log,
  onMessage: async (message) => {
    const startedAt = Date.now();
    metrics.incrementReceived();

    const parseResult = parseAndValidateMessage(message.rawPayload);

    if (!parseResult.valid || !parseResult.payload) {
      if (parseResult.error === "invalid_json") {
        metrics.incrementParseError();
      } else {
        metrics.incrementValidationError();
      }

      log("warn", "backend_message_rejected", {
        topic: message.topic,
        reason: parseResult.error,
        receivedAt: message.receivedAt,
        durationMs: Date.now() - startedAt
      });
      return;
    }

    const result = await processSensorMessage(parseResult.payload, message.receivedAt, {
      repository,
      ledgerAdapter
    });

    if (!result.ok) {
      metrics.incrementLedgerFailure();
      log("error", "backend_message_ledger_failed", {
        topic: message.topic,
        sensorId: parseResult.payload.sensorId,
        buildingId: parseResult.payload.buildingId,
        eventTimestamp: parseResult.payload.timestamp,
        recordId: result.recordId,
        hash: result.hash,
        error: result.error,
        durationMs: Date.now() - startedAt
      });
      return;
    }

    metrics.incrementProcessed();
    log("info", "backend_message_processed", {
      topic: message.topic,
      sensorId: parseResult.payload.sensorId,
      buildingId: parseResult.payload.buildingId,
      eventTimestamp: parseResult.payload.timestamp,
      receivedAt: message.receivedAt,
      recordId: result.recordId,
      hash: result.hash,
      ledgerStatus: ledgerStatusLabel,
      durationMs: Date.now() - startedAt
    });
  }
});

const metricsTimer = setInterval(() => {
  log("info", "backend_metrics", metrics.snapshot());
}, 60000);

async function bootstrap(): Promise<void> {
  await repository.connect();
  await consumer.connect();

  log("info", "backend_started", {
    mqttUrl: config.mqttUrl,
    mqttTopicFilter: config.mqttTopicFilter,
    mongoUri: config.mongoUri,
    mongoDatabase: config.mongoDatabase,
    mongoCollection: config.mongoCollection,
    ledgerMode: config.ledgerMode,
    ethereumRpcUrl: config.ethereumRpcUrl,
    integrityRegistryAddress: config.integrityRegistryAddress
  });
}

async function shutdown(signal: string): Promise<void> {
  clearInterval(metricsTimer);

  log("info", "backend_shutdown_requested", {
    signal
  });

  await consumer.close();
  await repository.close();

  log("info", "backend_shutdown_completed", {
    signal,
    finalMetrics: metrics.snapshot()
  });
}

void bootstrap().catch((error: unknown) => {
  log("error", "backend_bootstrap_failed", {
    error: error instanceof Error ? error.message : "unknown_bootstrap_error"
  });
  process.exit(1);
});

process.on("SIGINT", () => {
  void shutdown("SIGINT").finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM").finally(() => process.exit(0));
});
