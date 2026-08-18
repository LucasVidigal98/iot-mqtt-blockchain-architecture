# Blockchain as a Security Layer in IoT Networks (MQTT + MongoDB + Ethereum)

[Português (Brasil)](README.md) | [English (US)](README.en-US.md)

Experimental project developed as part of an undergraduate thesis to evaluate the use of blockchain as a complementary integrity and auditing layer in a corporate IoT architecture.

## Objective

Compare two IoT data processing architectures:

1. **Traditional**: sensors -> MQTT -> backend -> MongoDB.
2. **With blockchain**: sensors -> MQTT -> backend -> MongoDB + cryptographic evidence registration in an Ethereum smart contract.

In addition to comparing performance, the project also measures the ability to detect post-registration tampering in the database.

## Project Contribution

The proposal does not replace the traditional database with blockchain. Instead, it uses blockchain to register **integrity proofs** (hash + minimal metadata), while keeping the complete data off-chain (MongoDB). This enables auditing and traceability without disrupting the conventional flow of IoT systems.

## Experimental Architecture

![Solution architecture](docs/arquitetura-solucao.jpeg)

```text
Simulated sensors (Node.js/TS)
          |
          v
     MQTT (Mosquitto)
          |
          v
Backend (Node.js/TS) --> MongoDB (complete data)
          |
          v
  SHA-256 + Smart Contract (Ethereum/Ganache)
```

### Components

- `apps/sensor-simulator`: simulation of 5 sensors (3 temperature, 2 lighting), with MQTT publishing.
- `apps/backend`: MQTT consumption, validation, persistence, hash generation, and ledger registration (`mock` or `ethereum`).
- `contracts/integrity-registry`: Solidity smart contract for registering integrity evidence.
- `packages/shared`: IoT message payload types and validation.
- `infra/docker`: local infrastructure with Mosquitto, MongoDB, and Ganache.
- `scripts`: automation for experiments 3.7 and 3.8, and the consolidated report 3.9.
- `artifacts`: experiment outputs and reports in Markdown/JSON.

## Tech Stack

- Node.js + TypeScript
- MQTT (Mosquitto broker)
- MongoDB
- Local Ethereum network (Ganache)
- Solidity + Hardhat + ethers
- Docker Compose

## IoT Message Structure

JSON payload validated by the shared package:

```json
{
  "sensorId": "temp-01",
  "buildingId": "building-A",
  "type": "temperature",
  "value": 22.4,
  "timestamp": "2026-03-12T20:00:00Z"
}
```

## How to Run (Step by Step)

### 1) Prerequisites

- Node.js 20+
- npm 10+
- Docker + Docker Compose

### 2) Install dependencies

```bash
npm run install:all
```

### 3) Start the local infrastructure

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

Exposed services:

- Mosquitto: `localhost:1883`
- MongoDB: `localhost:27017`
- Ganache: `localhost:8545`

### 4) Run the application manually

Terminal A (backend):

```bash
npm run dev:backend
```

Terminal B (sensors):

```bash
npm run dev:sensors
```

## Backend Modes

### Traditional mode (without a real blockchain)

Default: `LEDGER_MODE=mock`

```bash
LEDGER_MODE=mock npm run dev:backend
```

### Blockchain mode (Ethereum)

1. Deploy the contract locally:

```bash
npm run deploy:contracts:local
```

2. Configure the environment variables (example):

```bash
LEDGER_MODE=ethereum
ETH_RPC_URL=http://localhost:8545
ETH_PRIVATE_KEY=<ganache-private-key>
INTEGRITY_REGISTRY_ADDRESS=<contract-address>
```

3. Start the backend.

Note: the project already includes a `.env` file with an example local configuration.

## Running the Thesis Experiments

### Experiment 3.7 (Traditional vs. Blockchain)

```bash
npm run experiment:3.7
```

Default artifacts:

- `artifacts/experiment-3.7/scenario-traditional.json`
- `artifacts/experiment-3.7/scenario-blockchain.json`
- `artifacts/experiment-3.7/comparison.md`

Smoke test:

```bash
npm run experiment:3.7 -- --runs=1 --durationSec=10 --warmupSec=2 --outDir=/tmp/experiment-3.7-smoke
```

### Experiment 3.8 (Data Tampering)

```bash
npm run experiment:3.8
```

Default artifacts:

- `artifacts/experiment-3.8/scenario-adulteration.json`
- `artifacts/experiment-3.8/tamper-report.md`

Smoke test:

```bash
npm run experiment:3.8 -- --runs=1 --durationSec=20 --warmupSec=5 --tamperRate=0.2 --outDir=/tmp/experiment-3.8-smoke
```

### Experiment 3.9 (Consolidated Report)

```bash
npm run report:3.9
```

Output:

- `artifacts/experiment-3.9/evaluation-report.md`

## Evaluated Metrics

### Performance (Experiment 3.7)

- `messagesProcessed`
- `throughputMps`
- `latencyAvgMs`
- `latencyP95Ms`
- `failureRate`

Variation formula used in the comparison:

```text
variation% = ((blockchain - traditional) / traditional) * 100
```

### Integrity/Auditing (Experiment 3.8)

- `eligibleRecords`
- `tamperedRecords`
- `detected`
- `undetected`
- `verificationErrors`
- `detectionRate`

## Consolidated Results (Reference Run)

Based on the versioned artifacts (`artifacts/experiment-3.7-10-run`, `artifacts/experiment-3.8-10-run`, `artifacts/experiment-3.9`):

- The blockchain scenario showed a significant increase in average and p95 latency.
- Throughput decreased moderately in the blockchain scenario.
- The recorded tampering detection rate was **100%** (with no false negatives in the analyzed dataset).

Interpretation: there is a trade-off between performance and integrity/traceability guarantees.

## Tests

```bash
npm run test:backend
npm run test:contracts
```

## Additional Documentation

- `docs/sensor-simulator.md`
- `docs/backend-processing.md`
- `docs/smart-contract-integrity-registry.md`
- `text-meta-data/metodology.md`

## License

This project is licensed under the MIT License. See `LICENSE`.
