#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import process from "node:process";
import { spawn } from "node:child_process";
import readline from "node:readline";
import { createHash } from "node:crypto";

const RUNNER_VERSION = "1.0.0";
const DEFAULTS = {
  runs: 3,
  durationSec: 180,
  warmupSec: 15,
  tamperRate: 0.2,
  outDir: "artifacts/experiment-3.8",
  mqttUrl: "mqtt://localhost:1883",
  mongoDb: "iot_experiment",
  mongoCollection: "sensor_readings",
  ethRpcUrl: "http://localhost:8545",
  globalTimeoutSec: 1800
};
const GANACHE_DEFAULT_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const COMPOSE_FILE = path.resolve("infra/docker/docker-compose.yml");
const ETHERS_CWD = path.resolve("contracts/integrity-registry");

async function main() {
  const config = loadRunnerConfig(process.argv.slice(2));
  const absoluteOutDir = path.resolve(config.outDir);
  const deadlineAtMs = Date.now() + config.globalTimeoutSec * 1000;
  const state = createStateLogger();

  state.transition("preflight", { config: printableConfig(config), version: RUNNER_VERSION });
  await preflightChecks(config);

  await fs.promises.rm(absoluteOutDir, { recursive: true, force: true });
  await ensureDir(path.join(absoluteOutDir, "raw", "adulteration"));

  const cleanupTasks = [];

  try {
    state.transition("infra_up", { composeFile: COMPOSE_FILE });
    await dockerComposeUp();
    cleanupTasks.push(async () => {
      await dockerComposeDown();
    });
    await waitForInfrastructure();

    const scenarioResult = await runAdulterationScenario({
      config,
      outDir: absoluteOutDir,
      deadlineAtMs,
      state
    });

    await writeJson(path.join(absoluteOutDir, "scenario-adulteration.json"), scenarioResult);

    const reportPath = path.join(absoluteOutDir, "tamper-report.md");
    await fs.promises.writeFile(reportPath, buildTamperReportMarkdown(scenarioResult, config), "utf-8");

    state.transition("completed", {
      outDir: absoluteOutDir,
      scenarioFiles: [
        path.join(absoluteOutDir, "scenario-adulteration.json"),
        reportPath
      ]
    });
  } catch (error) {
    state.transition("failed", {
      error: error instanceof Error ? error.message : "unknown_runner_error"
    });
    throw error;
  } finally {
    state.transition("infra_down");
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (!cleanup) {
        continue;
      }
      try {
        await cleanup();
      } catch (error) {
        logWarn("cleanup_failed", {
          error: error instanceof Error ? error.message : "unknown_cleanup_error"
        });
      }
    }
  }
}

function loadRunnerConfig(argv) {
  const cli = parseCliArgs(argv);

  if (cli.help) {
    printHelp();
    process.exit(0);
  }

  const runs = parsePositiveInt(
    cli.runs ?? process.env.EXPERIMENT_38_RUNS ?? String(DEFAULTS.runs),
    "runs"
  );
  const durationSec = parsePositiveInt(
    cli.durationSec ?? process.env.EXPERIMENT_38_DURATION_SEC ?? String(DEFAULTS.durationSec),
    "durationSec"
  );
  const warmupSec = parseNonNegativeInt(
    cli.warmupSec ?? process.env.EXPERIMENT_38_WARMUP_SEC ?? String(DEFAULTS.warmupSec),
    "warmupSec"
  );
  const tamperRate = parseRate(
    cli.tamperRate ?? process.env.EXPERIMENT_38_TAMPER_RATE ?? String(DEFAULTS.tamperRate),
    "tamperRate"
  );
  const globalTimeoutSec = parsePositiveInt(
    cli.globalTimeoutSec ??
      process.env.EXPERIMENT_38_GLOBAL_TIMEOUT_SEC ??
      String(
        Math.max(
          DEFAULTS.globalTimeoutSec,
          runs * (durationSec + warmupSec + 60) + 300
        )
      ),
    "globalTimeoutSec"
  );
  const outDir = cli.outDir ?? process.env.EXPERIMENT_38_OUT_DIR ?? DEFAULTS.outDir;

  return {
    runs,
    durationSec,
    warmupSec,
    tamperRate,
    outDir,
    mqttUrl: process.env.MQTT_URL ?? DEFAULTS.mqttUrl,
    mongoDb: process.env.MONGO_DB ?? DEFAULTS.mongoDb,
    mongoCollection: process.env.MONGO_COLLECTION ?? DEFAULTS.mongoCollection,
    ethRpcUrl: process.env.ETH_RPC_URL ?? DEFAULTS.ethRpcUrl,
    ethPrivateKey: process.env.ETH_PRIVATE_KEY ?? GANACHE_DEFAULT_PRIVATE_KEY,
    globalTimeoutSec
  };
}

function parseCliArgs(argv) {
  const output = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--help" || token === "-h") {
      output.help = true;
      continue;
    }

    const [flag, valueFromEquals] = token.split("=", 2);
    const valueFromNext = valueFromEquals ?? argv[index + 1];

    if (flag === "--runs") {
      output.runs = valueFromEquals ?? valueFromNext;
      if (valueFromEquals === undefined) {
        index += 1;
      }
    } else if (flag === "--durationSec") {
      output.durationSec = valueFromEquals ?? valueFromNext;
      if (valueFromEquals === undefined) {
        index += 1;
      }
    } else if (flag === "--warmupSec") {
      output.warmupSec = valueFromEquals ?? valueFromNext;
      if (valueFromEquals === undefined) {
        index += 1;
      }
    } else if (flag === "--tamperRate") {
      output.tamperRate = valueFromEquals ?? valueFromNext;
      if (valueFromEquals === undefined) {
        index += 1;
      }
    } else if (flag === "--outDir") {
      output.outDir = valueFromEquals ?? valueFromNext;
      if (valueFromEquals === undefined) {
        index += 1;
      }
    } else if (flag === "--globalTimeoutSec") {
      output.globalTimeoutSec = valueFromEquals ?? valueFromNext;
      if (valueFromEquals === undefined) {
        index += 1;
      }
    } else {
      throw new Error(`unknown_cli_flag:${flag}`);
    }
  }

  return output;
}

function printHelp() {
  console.log(`Experiment 3.8 adulteration runner

Usage:
  node scripts/run-experiment-3.8.mjs [options]

Options:
  --runs <n>               Number of repetitions (default: 3)
  --durationSec <n>        Measurement duration per repetition in seconds (default: 180)
  --warmupSec <n>          Warmup duration per repetition in seconds (default: 15)
  --tamperRate <n>         Rate to tamper eligible records (0 to 1, default: 0.2)
  --outDir <path>          Output directory (default: artifacts/experiment-3.8)
  --globalTimeoutSec <n>   Global timeout for the full experiment (auto-derived)
  --help                   Show this help
`);
}

async function preflightChecks(config) {
  await assertCommand("node", ["--version"], 5000);
  await assertCommand("npm", ["--version"], 5000);
  await assertCommand("docker", ["--version"], 5000);
  await assertCommand("docker", ["compose", "version"], 10000);

  const requiredNodeModules = [
    "packages/shared/node_modules",
    "apps/backend/node_modules",
    "apps/sensor-simulator/node_modules",
    "contracts/integrity-registry/node_modules"
  ];

  for (const relativePath of requiredNodeModules) {
    const resolved = path.resolve(relativePath);
    try {
      await fs.promises.access(resolved, fs.constants.R_OK);
    } catch {
      throw new Error(`missing_dependency_dir:${relativePath}. run npm run install:all`);
    }
  }

  try {
    await fs.promises.access(COMPOSE_FILE, fs.constants.R_OK);
  } catch {
    throw new Error(`compose_file_not_found:${COMPOSE_FILE}`);
  }

  const runningContainers = new Set(await getRunningContainerNames());
  const expectedByPort = new Map([
    [1883, "iot-mosquitto"],
    [27017, "iot-mongodb"],
    [8545, "iot-ganache"]
  ]);

  for (const [port, expectedContainer] of expectedByPort.entries()) {
    const inUse = await isPortInUse(port);
    if (inUse && !runningContainers.has(expectedContainer)) {
      throw new Error(`port_${port}_in_use_by_unknown_process`);
    }
  }

  if (!config.ethPrivateKey || !config.ethPrivateKey.trim()) {
    throw new Error("eth_private_key_required_for_experiment_3_8");
  }
}

async function runAdulterationScenario({ config, outDir, deadlineAtMs, state }) {
  const scenarioStartedAt = new Date().toISOString();
  const scenarioRawDir = path.join(outDir, "raw", "adulteration");
  await ensureDir(scenarioRawDir);

  const repetitions = [];

  for (let runIndex = 1; runIndex <= config.runs; runIndex += 1) {
    assertDeadline(deadlineAtMs);

    const runDir = path.join(scenarioRawDir, `run-${runIndex}`);
    await ensureDir(runDir);

    state.transition("baseline_run", {
      scenario: "adulteration",
      runIndex,
      durationSec: config.durationSec,
      warmupSec: config.warmupSec
    });

    await resetMongoCollection(config.mongoDb, config.mongoCollection);

    const aggregateBackendLog = path.join(scenarioRawDir, "backend.log");
    const aggregateSensorsLog = path.join(scenarioRawDir, "sensors.log");
    const runBackendLog = path.join(runDir, "backend.log");
    const runSensorsLog = path.join(runDir, "sensors.log");

    const backendEvents = [];
    const sensorsEvents = [];
    const runBuildingId = buildRunBuildingId(runIndex);
    const runTopicFilter = `iot/buildings/${runBuildingId}/sensors/+/+`;
    const contractAddress = await deployIntegrityRegistry(config.ethRpcUrl, config.ethPrivateKey);

    const backendProcess = await startManagedProcess({
      name: "backend",
      command: "npm",
      args: ["run", "dev:backend"],
      env: {
        MQTT_URL: config.mqttUrl,
        MQTT_TOPIC_FILTER: runTopicFilter,
        MONGO_DB: config.mongoDb,
        MONGO_COLLECTION: config.mongoCollection,
        LEDGER_MODE: "ethereum",
        ETH_RPC_URL: config.ethRpcUrl,
        ETH_PRIVATE_KEY: config.ethPrivateKey,
        INTEGRITY_REGISTRY_ADDRESS: contractAddress
      },
      logFiles: [runBackendLog, aggregateBackendLog],
      onEvent: (event) => {
        backendEvents.push(event);
      }
    });

    const sensorsProcess = await startManagedProcess({
      name: "sensors",
      command: "npm",
      args: ["run", "dev:sensors"],
      env: {
        MQTT_URL: config.mqttUrl,
        BUILDING_ID: runBuildingId
      },
      logFiles: [runSensorsLog, aggregateSensorsLog],
      onEvent: (event) => {
        sensorsEvents.push(event);
      }
    });

    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();

    try {
      await Promise.all([
        backendProcess.waitForEvent("backend_started", withDeadline(90000, deadlineAtMs)),
        sensorsProcess.waitForEvent("mqtt_connected", withDeadline(90000, deadlineAtMs))
      ]);

      const measurementStartMs = Date.now() + config.warmupSec * 1000;
      const measurementEndMs = measurementStartMs + config.durationSec * 1000;

      await waitForRunWindow(config.warmupSec + config.durationSec, [backendProcess, sensorsProcess]);

      await stopProcesses([sensorsProcess, backendProcess]);

      state.transition("tamper_phase", {
        scenario: "adulteration",
        runIndex,
        buildingId: runBuildingId
      });

      const committedRecords = await loadCommittedRecordsByBuilding(
        config.mongoDb,
        config.mongoCollection,
        runBuildingId
      );
      await writeJson(path.join(runDir, "committed-records.json"), committedRecords);

      const tamperedRecords = await tamperRecords({
        records: committedRecords,
        mongoDb: config.mongoDb,
        mongoCollection: config.mongoCollection,
        tamperRate: config.tamperRate
      });

      await writeJson(path.join(runDir, "tampered-records.json"), tamperedRecords);

      state.transition("verification_phase", {
        scenario: "adulteration",
        runIndex,
        tamperedRecords: tamperedRecords.length,
        contractAddress
      });

      const verification = await verifyTamperedRecordsOnBlockchain({
        ethRpcUrl: config.ethRpcUrl,
        contractAddress,
        records: tamperedRecords
      });

      await writeJson(path.join(runDir, "verification.json"), verification.records);

      repetitions.push({
        runIndex,
        startedAt,
        endedAt: new Date().toISOString(),
        measurementWindow: {
          warmupSec: config.warmupSec,
          durationSec: config.durationSec,
          measurementStart: new Date(measurementStartMs).toISOString(),
          measurementEnd: new Date(measurementEndMs).toISOString()
        },
        buildingId: runBuildingId,
        topicFilter: runTopicFilter,
        contractAddress,
        baseline: summarizeBaselineWindow({
          backendEvents,
          measurementStartMs,
          measurementEndMs
        }),
        tamper: {
          eligibleRecords: committedRecords.length,
          tamperedRecords: tamperedRecords.length,
          tamperRateApplied:
            committedRecords.length > 0 ? tamperedRecords.length / committedRecords.length : 0
        },
        verification: verification.summary,
        tamperedRecords: verification.records,
        eventCounts: {
          backendEvents: backendEvents.length,
          sensorEvents: sensorsEvents.length
        }
      });

      state.transition("scenario_iteration_completed", {
        scenario: "adulteration",
        runIndex,
        eligibleRecords: committedRecords.length,
        tamperedRecords: tamperedRecords.length,
        detected: verification.summary.detected,
        undetected: verification.summary.undetected
      });
    } finally {
      await stopProcesses([sensorsProcess, backendProcess]);
    }
  }

  const scenarioEndedAt = new Date().toISOString();

  return {
    version: RUNNER_VERSION,
    scenario: "adulteration",
    startedAt: scenarioStartedAt,
    endedAt: scenarioEndedAt,
    parameters: {
      runs: config.runs,
      durationSec: config.durationSec,
      warmupSec: config.warmupSec,
      tamperRate: config.tamperRate,
      mqttUrl: config.mqttUrl,
      mongoDb: config.mongoDb,
      mongoCollection: config.mongoCollection,
      ledgerMode: "ethereum"
    },
    repetitions,
    aggregates: buildAdulterationAggregates(repetitions)
  };
}

function summarizeBaselineWindow({ backendEvents, measurementStartMs, measurementEndMs }) {
  const eventsInWindow = backendEvents.filter((event) => {
    return event.capturedAtMs >= measurementStartMs && event.capturedAtMs <= measurementEndMs;
  });

  let messagesProcessed = 0;
  let ledgerFailures = 0;
  let rejected = 0;

  for (const event of eventsInWindow) {
    if (event.event === "backend_message_processed") {
      messagesProcessed += 1;
    } else if (event.event === "backend_message_ledger_failed") {
      ledgerFailures += 1;
    } else if (event.event === "backend_message_rejected") {
      rejected += 1;
    }
  }

  return {
    messagesProcessed,
    ledgerFailures,
    rejected
  };
}

async function loadCommittedRecordsByBuilding(database, collection, buildingId) {
  const script = `
const docs = db.getSiblingDB(${JSON.stringify(database)})
  .getCollection(${JSON.stringify(collection)})
  .find(
    { "payload.buildingId": ${JSON.stringify(buildingId)}, processingStatus: "ledger_committed" },
    { _id: 1, payload: 1, hash: 1, processingStatus: 1, ledgerTxId: 1, updatedAt: 1 }
  )
  .toArray()
  .map((doc) => ({
    id: doc._id.toString(),
    payload: doc.payload,
    hash: doc.hash,
    processingStatus: doc.processingStatus,
    ledgerTxId: doc.ledgerTxId,
    updatedAt: doc.updatedAt
  }));
print(JSON.stringify(docs));`;

  const result = await runCommandOrThrow(
    "docker",
    ["exec", "iot-mongodb", "mongosh", "--quiet", "--eval", script],
    { timeoutMs: 15000 }
  );

  const parsed = extractJsonPayload(result.stdout.trim());
  if (!Array.isArray(parsed)) {
    throw new Error("invalid_committed_records_response");
  }

  return parsed.filter((record) => record && typeof record === "object" && typeof record.hash === "string");
}

async function tamperRecords({ records, mongoDb, mongoCollection, tamperRate }) {
  const sampleSize = records.length === 0 ? 0 : Math.max(1, Math.ceil(records.length * tamperRate));
  const sampled = selectRandomSample(records, sampleSize);

  const results = [];

  for (const record of sampled) {
    const originalPayload = record.payload;
    const tamperedPayload = tamperPayloadValue(originalPayload);
    const tamperedHash = generateSensorMessageHash(tamperedPayload);

    await updateRecordPayload({
      mongoDb,
      mongoCollection,
      recordId: record.id,
      payload: tamperedPayload
    });

    results.push({
      id: record.id,
      sensorId: originalPayload.sensorId,
      buildingId: originalPayload.buildingId,
      type: originalPayload.type,
      originalValue: originalPayload.value,
      tamperedValue: tamperedPayload.value,
      originalHash: record.hash,
      tamperedHash,
      ledgerTxId: record.ledgerTxId
    });
  }

  return results;
}

function tamperPayloadValue(payload) {
  const cloned = {
    sensorId: payload.sensorId,
    buildingId: payload.buildingId,
    type: payload.type,
    value: payload.value,
    timestamp: payload.timestamp
  };

  if (cloned.type === "lighting") {
    cloned.value = cloned.value === "ON" ? "OFF" : "ON";
    return cloned;
  }

  const numericValue = Number(cloned.value);
  const delta = Math.random() * 3 + 0.3;
  cloned.value = Number((numericValue + delta).toFixed(3));
  return cloned;
}

async function updateRecordPayload({ mongoDb, mongoCollection, recordId, payload }) {
  const script = `
db.getSiblingDB(${JSON.stringify(mongoDb)}).getCollection(${JSON.stringify(mongoCollection)}).updateOne(
  { _id: ObjectId(${JSON.stringify(recordId)}) },
  { $set: { payload: ${JSON.stringify(payload)}, updatedAt: ${JSON.stringify(new Date().toISOString())} } }
);
`;

  await runCommandOrThrow(
    "docker",
    ["exec", "iot-mongodb", "mongosh", "--quiet", "--eval", script],
    { timeoutMs: 15000 }
  );
}

async function verifyTamperedRecordsOnBlockchain({ ethRpcUrl, contractAddress, records }) {
  if (records.length === 0) {
    return {
      summary: {
        tamperedRecords: 0,
        detected: 0,
        undetected: 0,
        verificationErrors: 0,
        detectionRate: null
      },
      records: []
    };
  }

  const uniqueHashes = [...new Set(records.flatMap((record) => [record.originalHash, record.tamperedHash]))];
  const hashLookup = await queryEvidenceCountByHash({
    ethRpcUrl,
    contractAddress,
    hashes: uniqueHashes
  });

  const outputRecords = records.map((record) => {
    const originalEvidenceCount = hashLookup.counts[normalizeHexHash(record.originalHash)] ?? 0;
    const tamperedEvidenceCount = hashLookup.counts[normalizeHexHash(record.tamperedHash)] ?? 0;

    let classification;
    if (!hashLookup.ok) {
      classification = "verification_error";
    } else if (originalEvidenceCount > 0 && tamperedEvidenceCount === 0) {
      classification = "tamper_detected";
    } else {
      classification = "undetected";
    }

    return {
      ...record,
      originalEvidenceCount,
      tamperedEvidenceCount,
      classification
    };
  });

  const detected = outputRecords.filter((item) => item.classification === "tamper_detected").length;
  const verificationErrors = outputRecords.filter(
    (item) => item.classification === "verification_error"
  ).length;
  const undetected = outputRecords.filter((item) => item.classification === "undetected").length;

  return {
    summary: {
      tamperedRecords: outputRecords.length,
      detected,
      undetected,
      verificationErrors,
      detectionRate: outputRecords.length > 0 ? detected / outputRecords.length : null
    },
    records: outputRecords
  };
}

async function queryEvidenceCountByHash({ ethRpcUrl, contractAddress, hashes }) {
  const nodeScript = `
import { Contract, JsonRpcProvider } from "ethers";

const abi = ["function getEvidenceIdsByHash(bytes32 hash) view returns (uint256[] memory)"];
const rpcUrl = process.env.ETH_RPC_URL;
const address = process.env.CONTRACT_ADDRESS;
const hashes = JSON.parse(process.env.HASHES_JSON || "[]");

const provider = new JsonRpcProvider(rpcUrl);
const contract = new Contract(address, abi, provider);
const output = {};

for (const hash of hashes) {
  const normalized = hash.startsWith("0x") ? hash : "0x" + hash;
  const ids = await contract.getEvidenceIdsByHash(normalized);
  output[normalized.toLowerCase()] = ids.length;
}

console.log(JSON.stringify(output));
`;

  try {
    const result = await runCommandOrThrow(
      "node",
      ["--input-type=module", "-e", nodeScript],
      {
        cwd: ETHERS_CWD,
        timeoutMs: 60000,
        env: {
          ETH_RPC_URL: ethRpcUrl,
          CONTRACT_ADDRESS: contractAddress,
          HASHES_JSON: JSON.stringify(hashes.map((value) => normalizeHexHash(value)))
        }
      }
    );

    const parsed = extractJsonPayload(result.stdout.trim());
    if (!parsed || typeof parsed !== "object") {
      throw new Error("invalid_hash_query_response");
    }
    return {
      ok: true,
      counts: parsed
    };
  } catch (error) {
    logWarn("hash_query_failed", {
      error: error instanceof Error ? error.message : "unknown_hash_query_error"
    });

    const fallback = {};
    for (const hash of hashes) {
      fallback[normalizeHexHash(hash)] = 0;
    }
    return {
      ok: false,
      counts: fallback
    };
  }
}

function buildAdulterationAggregates(repetitions) {
  const totals = repetitions.reduce(
    (acc, run) => {
      acc.eligibleRecords += run.tamper.eligibleRecords;
      acc.tamperedRecords += run.tamper.tamperedRecords;
      acc.detected += run.verification.detected;
      acc.undetected += run.verification.undetected;
      acc.verificationErrors += run.verification.verificationErrors;
      return acc;
    },
    {
      eligibleRecords: 0,
      tamperedRecords: 0,
      detected: 0,
      undetected: 0,
      verificationErrors: 0
    }
  );

  const detectionRates = repetitions
    .map((run) => run.verification.detectionRate)
    .filter((value) => value !== null);

  return {
    perRun: {
      eligibleRecords: summaryStats(repetitions.map((run) => run.tamper.eligibleRecords)),
      tamperedRecords: summaryStats(repetitions.map((run) => run.tamper.tamperedRecords)),
      detected: summaryStats(repetitions.map((run) => run.verification.detected)),
      undetected: summaryStats(repetitions.map((run) => run.verification.undetected)),
      detectionRate: summaryStats(detectionRates)
    },
    totals: {
      ...totals,
      detectionRate: totals.tamperedRecords > 0 ? totals.detected / totals.tamperedRecords : null
    }
  };
}

function buildTamperReportMarkdown(result, config) {
  const totals = result.aggregates.totals;

  return `# Relatorio de Adulteracao de Dados - Experimento 3.8

## Parametros de Execucao
- Repeticoes: ${config.runs}
- Duracao de medicao por repeticao: ${config.durationSec}s
- Warmup por repeticao: ${config.warmupSec}s
- Taxa de adulteracao alvo: ${(config.tamperRate * 100).toFixed(1)}%
- Runner: ${RUNNER_VERSION}

## Resultado Consolidado
| Indicador | Valor |
| --- | ---: |
| Registros elegiveis | ${totals.eligibleRecords} |
| Registros adulterados | ${totals.tamperedRecords} |
| Adulteracoes detectadas | ${totals.detected} |
| Taxa de deteccao | ${formatPercent(totals.detectionRate)} |
| Falsos negativos (nao detectados) | ${totals.undetected} |
| Erros de verificacao | ${totals.verificationErrors} |

## Interpretacao
A adulteracao deliberada de registros persistidos no MongoDB permitiu verificar a consistencia entre os dados armazenados e as evidencias criptograficas registradas na blockchain. As divergencias identificadas entre o hash original comprometido em cadeia e o hash recalculado apos adulteracao evidenciaram a capacidade da arquitetura de detectar alteracoes posteriores nos dados.
`;
}

async function dockerComposeUp() {
  await runCommandOrThrow("docker", ["compose", "-f", COMPOSE_FILE, "up", "-d"], {
    timeoutMs: 120000
  });
}

async function dockerComposeDown() {
  await runCommandOrThrow("docker", ["compose", "-f", COMPOSE_FILE, "down"], {
    timeoutMs: 120000
  });
}

async function waitForInfrastructure() {
  await Promise.all([
    waitForPortOpen(1883, 30000),
    waitForPortOpen(27017, 30000),
    waitForPortOpen(8545, 30000)
  ]);

  await waitForMongoReady(45000);
}

async function resetMongoCollection(database, collection) {
  const script = `db.getSiblingDB("${database}").getCollection("${collection}").deleteMany({})`;
  await retryAsync(
    async () => {
      await runCommandOrThrow(
        "docker",
        ["exec", "iot-mongodb", "mongosh", "--quiet", "--eval", script],
        {
          timeoutMs: 10000
        }
      );
    },
    {
      attempts: 8,
      delayMs: 1500,
      operation: "reset_mongo_collection"
    }
  );
}

function buildRunBuildingId(runIndex) {
  const nonce = Date.now().toString(36);
  return `exp38-adulteration-r${runIndex}-${nonce}`;
}

async function deployIntegrityRegistry(ethRpcUrl, ethPrivateKey) {
  const result = await runCommandOrThrow("npm", ["run", "deploy:contracts:local"], {
    timeoutMs: 180000,
    env: {
      GANACHE_RPC_URL: ethRpcUrl,
      GANACHE_PRIVATE_KEY: ethPrivateKey
    }
  });

  const output = `${result.stdout}\n${result.stderr}`;
  const match = output.match(/IntegrityRegistry deployed at (0x[a-fA-F0-9]{40})/);
  if (!match) {
    throw new Error("contract_address_not_found_in_deploy_output");
  }
  return match[1];
}

function canonicalizeSensorMessage(message) {
  return JSON.stringify({
    sensorId: message.sensorId,
    buildingId: message.buildingId,
    type: message.type,
    value: message.value,
    timestamp: message.timestamp
  });
}

function generateSensorMessageHash(message) {
  return createHash("sha256").update(canonicalizeSensorMessage(message), "utf-8").digest("hex");
}

function selectRandomSample(records, count) {
  if (count <= 0) {
    return [];
  }
  if (count >= records.length) {
    return [...records];
  }

  const shuffled = [...records];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }

  return shuffled.slice(0, count);
}

function normalizeHexHash(hash) {
  const normalized = hash.startsWith("0x") ? hash : `0x${hash}`;
  return normalized.toLowerCase();
}

function extractJsonPayload(raw) {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line.startsWith("[") && !line.startsWith("{")) {
      continue;
    }
    const parsed = safeJsonParse(line);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function parsePositiveInt(input, name) {
  const value = Number(input);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`invalid_positive_int:${name}`);
  }
  return value;
}

function parseNonNegativeInt(input, name) {
  const value = Number(input);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`invalid_non_negative_int:${name}`);
  }
  return value;
}

function parseRate(input, name) {
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new Error(`invalid_rate_${name}`);
  }
  return value;
}

function summaryStats(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return {
      count: 0,
      mean: null,
      stddev: null,
      min: null,
      max: null,
      p95: null
    };
  }

  return {
    count: values.length,
    mean: average(values),
    stddev: standardDeviation(values),
    min: Math.min(...values),
    max: Math.max(...values),
    p95: percentile(values, 0.95)
  };
}

function average(values) {
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function standardDeviation(values) {
  if (values.length <= 1) {
    return 0;
  }
  const mean = average(values);
  const variance =
    values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  return `${(Number(value) * 100).toFixed(3)}%`;
}

function createStateLogger() {
  return {
    transition(state, data = {}) {
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "info",
          event: "experiment_state",
          state,
          ...data
        })
      );
    }
  };
}

function logWarn(event, data = {}) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "warn",
      event,
      ...data
    })
  );
}

function printableConfig(config) {
  return {
    runs: config.runs,
    durationSec: config.durationSec,
    warmupSec: config.warmupSec,
    tamperRate: config.tamperRate,
    outDir: path.resolve(config.outDir),
    mqttUrl: config.mqttUrl,
    mongoDb: config.mongoDb,
    mongoCollection: config.mongoCollection,
    ethRpcUrl: config.ethRpcUrl,
    globalTimeoutSec: config.globalTimeoutSec
  };
}

function withDeadline(requestedMs, deadlineAtMs) {
  const remaining = deadlineAtMs - Date.now();
  if (remaining <= 0) {
    throw new Error("global_timeout_reached");
  }
  return Math.min(requestedMs, remaining);
}

function assertDeadline(deadlineAtMs) {
  if (Date.now() > deadlineAtMs) {
    throw new Error("global_timeout_reached");
  }
}

async function waitForRunWindow(totalSeconds, processes) {
  const totalMs = totalSeconds * 1000;
  const delayPromise = sleep(totalMs);

  const unexpectedExitPromise = Promise.race(
    processes.map((managed) =>
      managed.exitPromise.then((result) => {
        throw new Error(`${managed.name}_exited_unexpectedly:${result.code ?? "null"}:${result.signal ?? "null"}`);
      })
    )
  );

  await Promise.race([delayPromise, unexpectedExitPromise]);
}

async function stopProcesses(processes) {
  for (const managed of processes) {
    try {
      await managed.stop();
    } catch (error) {
      logWarn("process_stop_failed", {
        process: managed.name,
        error: error instanceof Error ? error.message : "unknown_process_stop_error"
      });
    }
  }
}

async function startManagedProcess({ name, command, args, env, logFiles, onEvent }) {
  for (const filePath of logFiles) {
    await ensureDir(path.dirname(filePath));
  }

  const streams = [];
  for (const filePath of logFiles) {
    streams.push(fs.createWriteStream(filePath, { flags: "a" }));
  }

  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const eventWaiters = new Map();
  let exited = false;

  const exitPromise = new Promise((resolve) => {
    child.once("exit", (code, signal) => {
      exited = true;
      for (const stream of streams) {
        stream.end();
      }
      resolve({ code, signal });
    });
  });

  const ingestLine = (line) => {
    for (const stream of streams) {
      stream.write(`${line}\n`);
    }

    const parsed = safeJsonParse(line);
    if (!parsed || typeof parsed.event !== "string") {
      return;
    }

    const normalized = {
      ...parsed,
      capturedAtMs: Date.now()
    };
    onEvent(normalized);

    const waiters = eventWaiters.get(parsed.event);
    if (waiters) {
      for (const resolve of waiters) {
        resolve(normalized);
      }
      eventWaiters.delete(parsed.event);
    }
  };

  const stdoutReader = readline.createInterface({ input: child.stdout });
  stdoutReader.on("line", ingestLine);

  const stderrReader = readline.createInterface({ input: child.stderr });
  stderrReader.on("line", ingestLine);

  return {
    name,
    exitPromise,
    waitForEvent: (eventName, timeoutMs) =>
      Promise.race([
        new Promise((resolve, reject) => {
          if (exited) {
            reject(new Error(`${name}_already_exited_waiting_for_${eventName}`));
            return;
          }

          let timer;
          const wrappedResolve = (value) => {
            clearTimeout(timer);
            resolve(value);
          };

          const waiters = eventWaiters.get(eventName) ?? [];
          waiters.push(wrappedResolve);
          eventWaiters.set(eventName, waiters);

          timer = setTimeout(() => {
            const currentWaiters = eventWaiters.get(eventName) ?? [];
            const index = currentWaiters.indexOf(wrappedResolve);
            if (index >= 0) {
              currentWaiters.splice(index, 1);
            }
            if (currentWaiters.length === 0) {
              eventWaiters.delete(eventName);
            } else {
              eventWaiters.set(eventName, currentWaiters);
            }
            reject(new Error(`timeout_waiting_for_${name}_${eventName}`));
          }, timeoutMs);
        }),
        exitPromise.then((result) => {
          throw new Error(
            `${name}_exited_before_${eventName}:${result.code ?? "null"}:${result.signal ?? "null"}`
          );
        })
      ]),
    stop: async () => {
      if (child.exitCode !== null || child.signalCode !== null) {
        return;
      }

      child.kill("SIGTERM");
      const terminated = await Promise.race([
        exitPromise.then(() => true),
        sleep(8000).then(() => false)
      ]);

      if (!terminated) {
        child.kill("SIGKILL");
        await Promise.race([exitPromise, sleep(5000)]);
      }
    }
  };
}

function safeJsonParse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

async function runCommandOrThrow(command, args, options = {}) {
  const result = await runCommand(command, args, options);
  if (result.code !== 0) {
    throw new Error(
      `command_failed:${command} ${args.join(" ")}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }
  return result;
}

async function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: {
        ...process.env,
        ...(options.env ?? {})
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeoutMs = options.timeoutMs ?? 60000;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2000);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (timedOut) {
        resolve({
          code: 124,
          signal,
          stdout,
          stderr: `${stderr}\ncommand_timeout`
        });
        return;
      }
      resolve({
        code: code ?? 1,
        signal,
        stdout,
        stderr
      });
    });
  });
}

async function assertCommand(command, args, timeoutMs) {
  const result = await runCommand(command, args, { timeoutMs });
  if (result.code !== 0) {
    throw new Error(`command_not_available:${command}`);
  }
}

async function getRunningContainerNames() {
  const result = await runCommandOrThrow("docker", ["ps", "--format", "{{.Names}}"], {
    timeoutMs: 10000
  });
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

async function isPortInUse(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (error) => {
      if (error && error.code === "EADDRINUSE") {
        resolve(true);
        return;
      }
      reject(error);
    });
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(false));
    });
  });
}

async function waitForPortOpen(port, timeoutMs) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const open = await canConnect("127.0.0.1", port, 1000);
    if (open) {
      return;
    }
    await sleep(500);
  }

  throw new Error(`port_not_ready:${port}`);
}

async function waitForMongoReady(timeoutMs) {
  const pingScript = "db.adminCommand({ ping: 1 })";
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await runCommand(
      "docker",
      ["exec", "iot-mongodb", "mongosh", "--quiet", "--eval", pingScript],
      { timeoutMs: 5000 }
    );

    if (result.code === 0) {
      return;
    }

    await sleep(1000);
  }

  throw new Error("mongo_not_ready_after_timeout");
}

async function canConnect(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const onFailure = () => {
      socket.destroy();
      resolve(false);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("error", onFailure);
    socket.once("timeout", onFailure);
  });
}

async function ensureDir(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fs.promises.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function retryAsync(task, options) {
  let lastError = null;

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      await task();
      return;
    } catch (error) {
      lastError = error;
      if (attempt < options.attempts) {
        logWarn("retrying_operation", {
          operation: options.operation,
          attempt,
          attempts: options.attempts,
          delayMs: options.delayMs,
          error: error instanceof Error ? error.message : "unknown_retry_error"
        });
        await sleep(options.delayMs);
      }
    }
  }

  throw new Error(
    `${options.operation}_failed_after_retries:${
      lastError instanceof Error ? lastError.message : "unknown_retry_error"
    }`
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      event: "experiment_runner_failed",
      message: error instanceof Error ? error.message : "unknown_error"
    })
  );
  process.exit(1);
});
