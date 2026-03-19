#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import process from "node:process";
import { spawn } from "node:child_process";
import readline from "node:readline";

const RUNNER_VERSION = "2.0.0";
const DEFAULTS = {
  runs: 3,
  durationSec: 180,
  warmupSec: 15,
  outDir: "artifacts/experiment-3.7",
  mqttUrl: "mqtt://localhost:1883",
  mongoDb: "iot_experiment",
  mongoCollection: "sensor_readings",
  ethRpcUrl: "http://localhost:8545",
  globalTimeoutSec: 1800
};
const GANACHE_DEFAULT_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const COMPOSE_FILE = path.resolve("infra/docker/docker-compose.yml");

const SCENARIOS = [
  { name: "traditional", ledgerMode: "mock" },
  { name: "blockchain", ledgerMode: "ethereum" }
];

async function main() {
  const config = loadRunnerConfig(process.argv.slice(2));
  const absoluteOutDir = path.resolve(config.outDir);
  const deadlineAtMs = Date.now() + config.globalTimeoutSec * 1000;
  const state = createStateLogger();

  state.transition("preflight", { config: printableConfig(config), version: RUNNER_VERSION });
  await preflightChecks(config);

  await fs.promises.rm(absoluteOutDir, { recursive: true, force: true });
  await ensureDir(path.join(absoluteOutDir, "raw"));

  const cleanupTasks = [];

  try {
    state.transition("infra_up", { composeFile: COMPOSE_FILE });
    await dockerComposeUp();
    cleanupTasks.push(async () => {
      await dockerComposeDown();
    });
    await waitForInfrastructure();

    const scenarioResults = new Map();
    for (const scenario of SCENARIOS) {
      assertDeadline(deadlineAtMs);
      const result = await runScenario({
        scenario,
        config,
        outDir: absoluteOutDir,
        deadlineAtMs,
        state
      });
      scenarioResults.set(scenario.name, result);
      await writeJson(path.join(absoluteOutDir, `scenario-${scenario.name}.json`), result);
    }

    const traditional = scenarioResults.get("traditional");
    const blockchain = scenarioResults.get("blockchain");

    if (!traditional || !blockchain) {
      throw new Error("missing_scenario_result");
    }

    const comparisonPath = path.join(absoluteOutDir, "comparison.md");
    await fs.promises.writeFile(
      comparisonPath,
      buildComparisonMarkdown(traditional, blockchain, config),
      "utf-8"
    );

    state.transition("completed", {
      outDir: absoluteOutDir,
      scenarioFiles: [
        path.join(absoluteOutDir, "scenario-traditional.json"),
        path.join(absoluteOutDir, "scenario-blockchain.json"),
        comparisonPath
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
    cli.runs ?? process.env.EXPERIMENT_37_RUNS ?? String(DEFAULTS.runs),
    "runs"
  );
  const durationSec = parsePositiveInt(
    cli.durationSec ?? process.env.EXPERIMENT_37_DURATION_SEC ?? String(DEFAULTS.durationSec),
    "durationSec"
  );
  const warmupSec = parseNonNegativeInt(
    cli.warmupSec ?? process.env.EXPERIMENT_37_WARMUP_SEC ?? String(DEFAULTS.warmupSec),
    "warmupSec"
  );
  const globalTimeoutSec = parsePositiveInt(
    cli.globalTimeoutSec ??
      process.env.EXPERIMENT_37_GLOBAL_TIMEOUT_SEC ??
      String(
        Math.max(
          DEFAULTS.globalTimeoutSec,
          runs * 2 * (durationSec + warmupSec + 30) + 300
        )
      ),
    "globalTimeoutSec"
  );
  const outDir = cli.outDir ?? process.env.EXPERIMENT_37_OUT_DIR ?? DEFAULTS.outDir;

  return {
    runs,
    durationSec,
    warmupSec,
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
  console.log(`Experiment 3.7 deterministic runner

Usage:
  node scripts/run-experiment-3.7.mjs [options]

Options:
  --runs <n>               Number of repetitions per scenario (default: 3)
  --durationSec <n>        Measurement duration per repetition in seconds (default: 180)
  --warmupSec <n>          Warmup duration per repetition in seconds (default: 15)
  --outDir <path>          Output directory (default: artifacts/experiment-3.7)
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
    throw new Error("eth_private_key_required_for_blockchain_scenario");
  }
}

async function runScenario({ scenario, config, outDir, deadlineAtMs, state }) {
  const scenarioStartedAt = new Date().toISOString();
  const scenarioRawDir = path.join(outDir, "raw", scenario.name);
  await ensureDir(scenarioRawDir);

  state.transition("scenario_run", {
    scenario: scenario.name,
    runs: config.runs,
    durationSec: config.durationSec,
    warmupSec: config.warmupSec
  });

  const repetitions = [];

  for (let runIndex = 1; runIndex <= config.runs; runIndex += 1) {
    assertDeadline(deadlineAtMs);
    state.transition("scenario_iteration_started", { scenario: scenario.name, runIndex });

    await resetMongoCollection(config.mongoDb, config.mongoCollection);

    const runDir = path.join(scenarioRawDir, `run-${runIndex}`);
    await ensureDir(runDir);

    const aggregateBackendLog = path.join(scenarioRawDir, "backend.log");
    const aggregateSensorsLog = path.join(scenarioRawDir, "sensors.log");
    const runBackendLog = path.join(runDir, "backend.log");
    const runSensorsLog = path.join(runDir, "sensors.log");

    const backendEvents = [];
    const sensorsEvents = [];
    const runBuildingId = buildRunBuildingId(scenario.name, runIndex);
    const runTopicFilter = `iot/buildings/${runBuildingId}/sensors/+/+`;

    let contractAddress = null;
    if (scenario.ledgerMode === "ethereum") {
      contractAddress = await deployIntegrityRegistry(config.ethRpcUrl, config.ethPrivateKey);
    }

    const backendEnv = {
      MQTT_URL: config.mqttUrl,
      MQTT_TOPIC_FILTER: runTopicFilter,
      MONGO_DB: config.mongoDb,
      MONGO_COLLECTION: config.mongoCollection,
      LEDGER_MODE: scenario.ledgerMode
    };

    if (scenario.ledgerMode === "ethereum") {
      backendEnv.ETH_RPC_URL = config.ethRpcUrl;
      backendEnv.ETH_PRIVATE_KEY = config.ethPrivateKey;
      backendEnv.INTEGRITY_REGISTRY_ADDRESS = contractAddress;
    }

    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();

    const backendProcess = await startManagedProcess({
      name: "backend",
      command: "npm",
      args: ["run", "dev:backend"],
      env: backendEnv,
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

    let runResult;

    try {
      await Promise.all([
        backendProcess.waitForEvent("backend_started", withDeadline(90000, deadlineAtMs)),
        sensorsProcess.waitForEvent("mqtt_connected", withDeadline(90000, deadlineAtMs))
      ]);

      const measurementStartMs = Date.now() + config.warmupSec * 1000;
      const measurementEndMs = measurementStartMs + config.durationSec * 1000;
      const measurementStart = new Date(measurementStartMs).toISOString();
      const measurementEnd = new Date(measurementEndMs).toISOString();

      await waitForRunWindow(config.warmupSec + config.durationSec, [backendProcess, sensorsProcess]);

      const metrics = buildRunMetrics({
        backendEvents,
        measurementStartMs,
        measurementEndMs,
        durationSec: config.durationSec
      });

      runResult = {
        runIndex,
        startedAt,
        endedAt: new Date().toISOString(),
        measurementWindow: {
          warmupSec: config.warmupSec,
          durationSec: config.durationSec,
          measurementStart,
          measurementEnd
        },
        buildingId: runBuildingId,
        topicFilter: runTopicFilter,
        ledgerMode: scenario.ledgerMode,
        contractAddress,
        metrics,
        eventCounts: {
          backendEvents: backendEvents.length,
          sensorEvents: sensorsEvents.length
        }
      };
    } finally {
      await stopProcesses([sensorsProcess, backendProcess]);
    }

    repetitions.push(runResult);
    state.transition("scenario_iteration_completed", {
      scenario: scenario.name,
      runIndex,
      throughputMps: runResult.metrics.throughputMps,
      messagesProcessed: runResult.metrics.messagesProcessed
    });
  }

  const scenarioEndedAt = new Date().toISOString();
  const aggregates = buildScenarioAggregates(repetitions);

  return {
    version: RUNNER_VERSION,
    scenario: scenario.name,
    startedAt: scenarioStartedAt,
    endedAt: scenarioEndedAt,
    parameters: {
      runs: config.runs,
      durationSec: config.durationSec,
      warmupSec: config.warmupSec,
      mqttUrl: config.mqttUrl,
      mongoDb: config.mongoDb,
      mongoCollection: config.mongoCollection,
      ledgerMode: scenario.ledgerMode
    },
    repetitions,
    aggregates
  };
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

  // A porta do Mongo pode abrir antes de o mongod aceitar comandos via mongosh.
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

function buildRunBuildingId(scenarioName, runIndex) {
  const nonce = Date.now().toString(36);
  return `exp37-${scenarioName}-r${runIndex}-${nonce}`;
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

function buildRunMetrics({ backendEvents, measurementStartMs, measurementEndMs, durationSec }) {
  const eventsInWindow = backendEvents.filter((event) => {
    return event.capturedAtMs >= measurementStartMs && event.capturedAtMs <= measurementEndMs;
  });

  let messagesProcessed = 0;
  let messagesReceived = 0;
  let ledgerFailures = 0;
  let parseErrors = 0;
  let validationErrors = 0;
  const durations = [];

  for (const event of eventsInWindow) {
    if (event.event === "backend_message_processed") {
      messagesProcessed += 1;
      messagesReceived += 1;
      const durationMs = Number(event.durationMs);
      if (Number.isFinite(durationMs) && durationMs >= 0) {
        durations.push(durationMs);
      }
    } else if (event.event === "backend_message_ledger_failed") {
      ledgerFailures += 1;
      messagesReceived += 1;
    } else if (event.event === "backend_message_rejected") {
      messagesReceived += 1;
      if (event.reason === "invalid_json") {
        parseErrors += 1;
      } else {
        validationErrors += 1;
      }
    }
  }

  const failureTotal = ledgerFailures + parseErrors + validationErrors;
  const failureRate = messagesReceived > 0 ? failureTotal / messagesReceived : 0;
  const throughputMps = durationSec > 0 ? messagesProcessed / durationSec : 0;

  return {
    messagesReceived,
    messagesProcessed,
    throughputMps,
    failures: {
      ledgerFailures,
      parseErrors,
      validationErrors,
      totalFailures: failureTotal,
      failureRate
    },
    latencyMs: {
      count: durations.length,
      min: durations.length > 0 ? Math.min(...durations) : null,
      max: durations.length > 0 ? Math.max(...durations) : null,
      avg: durations.length > 0 ? average(durations) : null,
      p95: durations.length > 0 ? percentile(durations, 0.95) : null
    }
  };
}

function buildScenarioAggregates(repetitions) {
  const processedValues = repetitions.map((run) => run.metrics.messagesProcessed);
  const throughputValues = repetitions.map((run) => run.metrics.throughputMps);
  const latencyAvgValues = repetitions
    .map((run) => run.metrics.latencyMs.avg)
    .filter((value) => value !== null);
  const latencyP95Values = repetitions
    .map((run) => run.metrics.latencyMs.p95)
    .filter((value) => value !== null);
  const failureRateValues = repetitions.map((run) => run.metrics.failures.failureRate);

  const totals = repetitions.reduce(
    (acc, run) => {
      acc.messagesReceived += run.metrics.messagesReceived;
      acc.messagesProcessed += run.metrics.messagesProcessed;
      acc.ledgerFailures += run.metrics.failures.ledgerFailures;
      acc.parseErrors += run.metrics.failures.parseErrors;
      acc.validationErrors += run.metrics.failures.validationErrors;
      return acc;
    },
    {
      messagesReceived: 0,
      messagesProcessed: 0,
      ledgerFailures: 0,
      parseErrors: 0,
      validationErrors: 0
    }
  );

  const totalFailures = totals.ledgerFailures + totals.parseErrors + totals.validationErrors;

  return {
    perRun: {
      messagesProcessed: summaryStats(processedValues),
      throughputMps: summaryStats(throughputValues),
      latencyAvgMs: summaryStats(latencyAvgValues),
      latencyP95Ms: summaryStats(latencyP95Values),
      failureRate: summaryStats(failureRateValues)
    },
    totals: {
      ...totals,
      totalFailures,
      failureRate: totals.messagesReceived > 0 ? totalFailures / totals.messagesReceived : 0
    }
  };
}

function buildComparisonMarkdown(traditional, blockchain, config) {
  const trad = traditional.aggregates;
  const block = blockchain.aggregates;

  const rows = [
    [
      "Mensagens processadas (media por repeticao)",
      trad.perRun.messagesProcessed.mean,
      block.perRun.messagesProcessed.mean
    ],
    ["Throughput (msg/s)", trad.perRun.throughputMps.mean, block.perRun.throughputMps.mean],
    ["Latencia media (ms)", trad.perRun.latencyAvgMs.mean, block.perRun.latencyAvgMs.mean],
    ["Latencia p95 (ms)", trad.perRun.latencyP95Ms.mean, block.perRun.latencyP95Ms.mean],
    ["Taxa de falha", trad.perRun.failureRate.mean, block.perRun.failureRate.mean]
  ];

  const table = rows
    .map(([metric, traditionalValue, blockchainValue]) => {
      return `| ${metric} | ${formatMetric(metric, traditionalValue)} | ${formatMetric(
        metric,
        blockchainValue
      )} | ${formatPercentChange(traditionalValue, blockchainValue)} |`;
    })
    .join("\n");

  return `# Comparacao de Cenarios - Experimento 3.7

## Parametros de Execucao
- Repeticoes por cenario: ${config.runs}
- Duracao de medicao por repeticao: ${config.durationSec}s
- Warmup por repeticao: ${config.warmupSec}s
- Runner: ${RUNNER_VERSION}

## Resultado Consolidado
| Metrica | Tradicional | Blockchain | Variacao Blockchain vs Tradicional |
| --- | ---: | ---: | ---: |
${table}

## Totais
- Tradicional: ${traditional.aggregates.totals.messagesProcessed} mensagens processadas, taxa de falha ${formatPercent(
    traditional.aggregates.totals.failureRate
  )}
- Blockchain: ${blockchain.aggregates.totals.messagesProcessed} mensagens processadas, taxa de falha ${formatPercent(
    blockchain.aggregates.totals.failureRate
  )}
`;
}

function formatMetric(metric, value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  if (metric === "Taxa de falha") {
    return formatPercent(value);
  }
  return Number(value).toFixed(3);
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  return `${(Number(value) * 100).toFixed(3)}%`;
}

function formatPercentChange(base, current) {
  if (!Number.isFinite(base) || !Number.isFinite(current)) {
    return "n/a";
  }
  if (base === 0) {
    if (current === 0) {
      return "0.000%";
    }
    return "n/a";
  }
  return `${(((current - base) / base) * 100).toFixed(3)}%`;
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

          const wrappedResolve = (value) => {
            clearTimeout(timer);
            resolve(value);
          };

          const waiters = eventWaiters.get(eventName) ?? [];
          waiters.push(wrappedResolve);
          eventWaiters.set(eventName, waiters);

          const timer = setTimeout(() => {
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
