import mqtt from "mqtt";

export interface IncomingMqttMessage {
  topic: string;
  rawPayload: string;
  receivedAt: string;
}

export interface MqttConsumer {
  connect(): Promise<void>;
  close(): Promise<void>;
}

export function createMqttConsumer(params: {
  mqttUrl: string;
  topicFilter: string;
  onMessage: (message: IncomingMqttMessage) => Promise<void>;
  onLog: (level: "info" | "warn" | "error", event: string, data?: Record<string, unknown>) => void;
}): MqttConsumer {
  const client = mqtt.connect(params.mqttUrl, {
    reconnectPeriod: 1000,
    manualConnect: true
  });

  let connected = false;

  client.on("connect", () => {
    connected = true;
    params.onLog("info", "mqtt_connected", { mqttUrl: params.mqttUrl });

    client.subscribe(params.topicFilter, (error: Error | null) => {
      if (error) {
        params.onLog("error", "mqtt_subscribe_failed", {
          topicFilter: params.topicFilter,
          error: error.message
        });
        return;
      }

      params.onLog("info", "mqtt_subscribed", {
        topicFilter: params.topicFilter
      });
    });
  });

  client.on("reconnect", () => {
    params.onLog("warn", "mqtt_reconnecting", { mqttUrl: params.mqttUrl });
  });

  client.on("error", (error: Error) => {
    params.onLog("error", "mqtt_client_error", { error: error.message });
  });

  client.on("close", () => {
    if (connected) {
      params.onLog("warn", "mqtt_connection_closed_unexpected");
    }

    connected = false;
  });

  client.on("message", (topic, payloadBuffer) => {
    const message: IncomingMqttMessage = {
      topic,
      rawPayload: payloadBuffer.toString("utf-8"),
      receivedAt: new Date().toISOString()
    };

    void params.onMessage(message).catch((error: unknown) => {
      params.onLog("error", "mqtt_message_handler_failed", {
        topic,
        error: error instanceof Error ? error.message : "unknown_handler_error"
      });
    });
  });

  return {
    async connect(): Promise<void> {
      if (client.connected) {
        return;
      }

      await new Promise<void>((resolve) => {
        client.once("connect", () => resolve());
        client.connect();
      });
    },
    async close(): Promise<void> {
      if (!client.connected) {
        return;
      }

      await new Promise<void>((resolve) => {
        client.end(true, {}, () => resolve());
      });
    }
  };
}
