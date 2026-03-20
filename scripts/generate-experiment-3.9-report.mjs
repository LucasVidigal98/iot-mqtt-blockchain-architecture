#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULTS = {
  exp37Dir: "artifacts/experiment-3.7",
  exp38Dir: "artifacts/experiment-3.8",
  outFile: "artifacts/experiment-3.9/evaluation-report.md"
};

async function main() {
  const config = loadConfig(process.argv.slice(2));
  const exp37Dir = path.resolve(config.exp37Dir);
  const exp38Dir = path.resolve(config.exp38Dir);
  const outFile = path.resolve(config.outFile);

  const traditionalPath = path.join(exp37Dir, "scenario-traditional.json");
  const blockchainPath = path.join(exp37Dir, "scenario-blockchain.json");
  const adulterationPath = path.join(exp38Dir, "scenario-adulteration.json");

  const [traditional, blockchain, adulteration] = await Promise.all([
    readRequiredJson(traditionalPath),
    readRequiredJson(blockchainPath),
    readRequiredJson(adulterationPath)
  ]);

  const report = buildReport({
    traditional,
    blockchain,
    adulteration,
    sources: {
      traditionalPath,
      blockchainPath,
      adulterationPath
    }
  });

  await fs.promises.mkdir(path.dirname(outFile), { recursive: true });
  await fs.promises.writeFile(outFile, report, "utf-8");

  process.stdout.write(
    `[report:3.9] Report generated at ${outFile}\n`
  );
}

function loadConfig(argv) {
  const cli = parseCliArgs(argv);
  if (cli.help) {
    printHelp();
    process.exit(0);
  }

  return {
    exp37Dir: cli.exp37Dir ?? DEFAULTS.exp37Dir,
    exp38Dir: cli.exp38Dir ?? DEFAULTS.exp38Dir,
    outFile: cli.outFile ?? DEFAULTS.outFile
  };
}

function parseCliArgs(argv) {
  const result = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      result.help = true;
      continue;
    }

    if (!arg.startsWith("--")) {
      throw new Error(`Invalid argument: ${arg}`);
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const key = rawKey?.trim();
    if (!key) {
      throw new Error(`Invalid argument: ${arg}`);
    }

    if (inlineValue !== undefined) {
      result[key] = inlineValue;
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      result[key] = next;
      i += 1;
      continue;
    }

    result[key] = "true";
  }

  return result;
}

async function readRequiredJson(filePath) {
  try {
    const content = await fs.promises.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(`Required file not found: ${filePath}`);
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in file: ${filePath}`);
    }
    throw error;
  }
}

function buildReport({ traditional, blockchain, adulteration, sources }) {
  const perf = extractPerformanceMetrics(traditional, blockchain);
  const integrity = extractIntegrityMetrics(adulteration);

  const lines = [];
  lines.push("# Relatorio Consolidado de Metricas - Secao 3.9");
  lines.push("");
  lines.push("## Contexto e parametros de execucao");
  lines.push("");
  lines.push("- Escopo da avaliacao: hibrido (Experimento 3.7 + Experimento 3.8).");
  lines.push(`- Fonte 3.7 (tradicional): \`${sources.traditionalPath}\``);
  lines.push(`- Fonte 3.7 (blockchain): \`${sources.blockchainPath}\``);
  lines.push(`- Fonte 3.8 (adulteracao): \`${sources.adulterationPath}\``);
  lines.push(`- Runs 3.7: ${safeNumber(traditional?.parameters?.runs)} (duracao ${safeNumber(traditional?.parameters?.durationSec)}s, warmup ${safeNumber(traditional?.parameters?.warmupSec)}s).`);
  lines.push(`- Runs 3.8: ${safeNumber(adulteration?.parameters?.runs)} (duracao ${safeNumber(adulteration?.parameters?.durationSec)}s, warmup ${safeNumber(adulteration?.parameters?.warmupSec)}s).`);
  lines.push(`- Janela temporal 3.7: ${safeText(traditional?.startedAt)} ate ${safeText(blockchain?.endedAt)}.`);
  lines.push(`- Janela temporal 3.8: ${safeText(adulteration?.startedAt)} ate ${safeText(adulteration?.endedAt)}.`);
  lines.push("");
  lines.push("## Tabela 1 - Comparacao de desempenho (Experimento 3.7)");
  lines.push("");
  lines.push("| Metrica | Tradicional | Blockchain | Variacao Blockchain vs Tradicional |");
  lines.push("| --- | ---: | ---: | ---: |");
  lines.push(`| Messages processed (media por run) | ${fmtCount(perf.messagesProcessedTraditional)} | ${fmtCount(perf.messagesProcessedBlockchain)} | ${fmtVariation(perf.messagesProcessedVariation)} |`);
  lines.push(`| Throughput (msg/s) | ${fmt(perf.throughputTraditional)} | ${fmt(perf.throughputBlockchain)} | ${fmtVariation(perf.throughputVariation)} |`);
  lines.push(`| Latencia media (ms) | ${fmt(perf.latencyAvgTraditional)} | ${fmt(perf.latencyAvgBlockchain)} | ${fmtVariation(perf.latencyAvgVariation)} |`);
  lines.push(`| Latencia p95 (ms) | ${fmt(perf.latencyP95Traditional)} | ${fmt(perf.latencyP95Blockchain)} | ${fmtVariation(perf.latencyP95Variation)} |`);
  lines.push(`| Taxa de falha | ${fmtPercent(perf.failureRateTraditional)} | ${fmtPercent(perf.failureRateBlockchain)} | ${fmtVariation(perf.failureRateVariation)} |`);
  lines.push("");
  lines.push("## Tabela 2 - Integridade e auditoria (Experimento 3.8)");
  lines.push("");
  lines.push("| Indicador | Valor |");
  lines.push("| --- | ---: |");
  lines.push(`| Registros elegiveis | ${fmtCount(integrity.eligibleRecords)} |`);
  lines.push(`| Registros adulterados | ${fmtCount(integrity.tamperedRecords)} |`);
  lines.push(`| Adulteracoes detectadas | ${fmtCount(integrity.detected)} |`);
  lines.push(`| Falsos negativos (undetected) | ${fmtCount(integrity.undetected)} |`);
  lines.push(`| Erros de verificacao | ${fmtCount(integrity.verificationErrors)} |`);
  lines.push(`| Taxa de deteccao | ${fmtPercent(integrity.detectionRate)} |`);
  lines.push("");
  lines.push("## Resultados objetivos");
  lines.push("");
  lines.push(`- O cenario com blockchain apresentou variacao de ${fmtVariation(perf.latencyAvgVariation)} na latencia media e ${fmtVariation(perf.latencyP95Variation)} na latencia p95.`);
  lines.push(`- O throughput variou ${fmtVariation(perf.throughputVariation)} entre os cenarios, com ${fmtCount(perf.messagesProcessedTraditional)} vs ${fmtCount(perf.messagesProcessedBlockchain)} mensagens processadas por run.`);
  lines.push(`- A taxa de falha ficou em ${fmtPercent(perf.failureRateTraditional)} (tradicional) e ${fmtPercent(perf.failureRateBlockchain)} (blockchain).`);
  lines.push(`- Na verificacao de integridade, ${fmtCount(integrity.detected)} de ${fmtCount(integrity.tamperedRecords)} adulteracoes foram detectadas (${fmtPercent(integrity.detectionRate)}).`);
  lines.push("");
  lines.push("## Discussao tecnica");
  lines.push("");
  lines.push("A comparacao do Experimento 3.7 evidencia o custo operacional da persistencia de evidencias em blockchain, principalmente sobre as metricas de latencia. Em contrapartida, o Experimento 3.8 demonstra ganho funcional de auditabilidade, pois alteracoes deliberadas de dados persistidos puderam ser verificadas contra evidencias registradas em cadeia.");
  if (safeNumber(traditional?.parameters?.runs) === 1 || safeNumber(adulteration?.parameters?.runs) === 1) {
    lines.push("Como os resultados foram obtidos com apenas uma repeticao em pelo menos um dos experimentos, as inferencias estatisticas devem ser interpretadas com cautela e idealmente confirmadas com mais runs.");
  }
  lines.push("");
  lines.push("## Ameacas a validade");
  lines.push("");
  lines.push("- Tamanho amostral reduzido quando `runs=1`, com baixa representatividade estatistica.");
  lines.push("- Execucao em ambiente local, sujeito a interferencia de carga de CPU, disco, rede e containers.");
  lines.push("- Dependencia de estabilidade da infraestrutura (MongoDB, broker MQTT, Ganache) durante a janela de medicao.");
  lines.push("");
  lines.push("## Conclusao da secao 3.9");
  lines.push("");
  lines.push("A avaliacao hibrida (3.7 + 3.8) sustenta que a blockchain introduz sobrecarga de desempenho, sobretudo em latencia, ao mesmo tempo em que fortalece garantias de integridade, rastreabilidade e auditoria por meio da verificacao criptografica de adulteracoes pos-registro.");
  lines.push("");
  lines.push("## Formula de comparacao utilizada no 3.7");
  lines.push("");
  lines.push("`variacao% = ((blockchain - tradicional) / tradicional) * 100`");
  lines.push("");
  lines.push(`_Relatorio gerado automaticamente em ${new Date().toISOString()}._`);
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function extractPerformanceMetrics(traditional, blockchain) {
  const t = traditional?.aggregates?.perRun ?? {};
  const b = blockchain?.aggregates?.perRun ?? {};

  const messagesProcessedTraditional = asNumber(t?.messagesProcessed?.mean);
  const messagesProcessedBlockchain = asNumber(b?.messagesProcessed?.mean);
  const throughputTraditional = asNumber(t?.throughputMps?.mean);
  const throughputBlockchain = asNumber(b?.throughputMps?.mean);
  const latencyAvgTraditional = asNumber(t?.latencyAvgMs?.mean);
  const latencyAvgBlockchain = asNumber(b?.latencyAvgMs?.mean);
  const latencyP95Traditional = asNumber(t?.latencyP95Ms?.mean);
  const latencyP95Blockchain = asNumber(b?.latencyP95Ms?.mean);
  const failureRateTraditional = asNumber(t?.failureRate?.mean);
  const failureRateBlockchain = asNumber(b?.failureRate?.mean);

  return {
    messagesProcessedTraditional,
    messagesProcessedBlockchain,
    messagesProcessedVariation: computeVariation(messagesProcessedTraditional, messagesProcessedBlockchain),
    throughputTraditional,
    throughputBlockchain,
    throughputVariation: computeVariation(throughputTraditional, throughputBlockchain),
    latencyAvgTraditional,
    latencyAvgBlockchain,
    latencyAvgVariation: computeVariation(latencyAvgTraditional, latencyAvgBlockchain),
    latencyP95Traditional,
    latencyP95Blockchain,
    latencyP95Variation: computeVariation(latencyP95Traditional, latencyP95Blockchain),
    failureRateTraditional,
    failureRateBlockchain,
    failureRateVariation: computeVariation(failureRateTraditional, failureRateBlockchain)
  };
}

function extractIntegrityMetrics(adulteration) {
  const totals = adulteration?.aggregates?.totals ?? {};
  return {
    eligibleRecords: asNumber(totals.eligibleRecords),
    tamperedRecords: asNumber(totals.tamperedRecords),
    detected: asNumber(totals.detected),
    undetected: asNumber(totals.undetected),
    verificationErrors: asNumber(totals.verificationErrors),
    detectionRate: asNumber(totals.detectionRate)
  };
}

function computeVariation(traditional, blockchain) {
  if (!Number.isFinite(traditional) || !Number.isFinite(blockchain)) {
    return null;
  }
  if (traditional === 0) {
    return null;
  }
  return ((blockchain - traditional) / traditional) * 100;
}

function asNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function fmt(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return Number(value).toFixed(3);
}

function fmtCount(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return String(Math.round(Number(value)));
}

function fmtPercent(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return `${(Number(value) * 100).toFixed(3)}%`;
}

function fmtVariation(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return `${Number(value).toFixed(3)}%`;
}

function safeText(value) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return "n/a";
}

function safeNumber(value) {
  return Number.isFinite(value) ? value : "n/a";
}

function printHelp() {
  process.stdout.write(
    [
      "Usage: node scripts/generate-experiment-3.9-report.mjs [options]",
      "",
      "Options:",
      "  --exp37Dir <path>  Directory containing scenario-traditional.json and scenario-blockchain.json",
      "  --exp38Dir <path>  Directory containing scenario-adulteration.json",
      "  --outFile <path>   Output markdown file path",
      "  --help, -h         Show this help message"
    ].join("\n") + "\n"
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "unknown_error";
  process.stderr.write(`[report:3.9] ${message}\n`);
  process.exit(1);
});
