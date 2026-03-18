import { MongoClient, ObjectId, type Collection } from "mongodb";
import type { SensorMessage } from "@iot/shared";
import type { ProcessingStatus } from "../types.js";
import type { PersistedRecordMeta, SensorRepository } from "./sensor-repository.js";

interface MongoStoredRecord {
  _id?: ObjectId;
  payload: SensorMessage;
  receivedAt: string;
  hash: string | null;
  processingStatus: ProcessingStatus;
  ledgerTxId: string | null;
  processingError: string | null;
  updatedAt: string;
}

export class MongoSensorRepository implements SensorRepository {
  private readonly client: MongoClient;
  private collection: Collection<MongoStoredRecord> | null = null;

  constructor(
    private readonly uri: string,
    private readonly database: string,
    private readonly collectionName: string
  ) {
    this.client = new MongoClient(this.uri);
  }

  async connect(): Promise<void> {
    await this.client.connect();
    this.collection = this.client.db(this.database).collection<MongoStoredRecord>(this.collectionName);
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  async insertInitial(payload: SensorMessage, receivedAt: string): Promise<PersistedRecordMeta> {
    if (!this.collection) {
      throw new Error("Mongo collection is not initialized");
    }

    const now = new Date().toISOString();

    const record: MongoStoredRecord = {
      payload,
      receivedAt,
      hash: null,
      processingStatus: "stored",
      ledgerTxId: null,
      processingError: null,
      updatedAt: now
    };

    const result = await this.collection.insertOne(record);

    return {
      id: result.insertedId.toHexString(),
      receivedAt
    };
  }

  async markProcessed(
    id: string,
    update: {
      hash: string;
      processingStatus: ProcessingStatus;
      ledgerTxId: string | null;
      processingError: string | null;
      updatedAt: string;
    }
  ): Promise<void> {
    if (!this.collection) {
      throw new Error("Mongo collection is not initialized");
    }

    await this.collection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          hash: update.hash,
          processingStatus: update.processingStatus,
          ledgerTxId: update.ledgerTxId,
          processingError: update.processingError,
          updatedAt: update.updatedAt
        }
      }
    );
  }
}
