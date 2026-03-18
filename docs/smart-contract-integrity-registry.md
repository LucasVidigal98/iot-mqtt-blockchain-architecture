# Smart Contract - Integrity Registry (Solidity)

## Objetivo
Registrar na blockchain Ethereum (Ganache local) a evidencia de integridade de cada mensagem IoT processada no backend.

## Stack adotada
- Solidity `0.8.28`
- Hardhat + ethers (TypeScript)
- Ganache local via Docker (`localhost:8545`)

## Estrutura
- `contracts/integrity-registry/contracts/IntegrityRegistry.sol`
- `contracts/integrity-registry/scripts/deploy.ts`
- `contracts/integrity-registry/test/IntegrityRegistry.test.ts`
- `contracts/integrity-registry/hardhat.config.ts`

## Interface on-chain
- `registerEvidence(bytes32 hash, string sensorId, string buildingId, string eventTimestamp) returns (uint256 evidenceId)`
- `getEvidenceById(uint256 evidenceId)`
- `getEvidenceIdsByHash(bytes32 hash)`

Evento emitido:
- `EvidenceRegistered(evidenceId, hash, sensorId, buildingId, eventTimestamp, blockTimestamp, sender)`

## Como executar
1. Instalar dependencias do monorepo:
- `npm run install:all`
2. Subir infraestrutura (incluindo Ganache):
- `docker compose -f infra/docker/docker-compose.yml up -d`
3. Compilar contrato:
- `npm run build:contracts`
4. Executar testes do contrato:
- `npm run test:contracts`
5. Deploy local:
- `npm run deploy:contracts:local`

## Integracao com backend
1. Obter endereco do contrato apos o deploy.
2. Configurar backend:
- `LEDGER_MODE=ethereum`
- `ETH_RPC_URL=http://localhost:8545`
- `ETH_PRIVATE_KEY=<private-key-ganache>`
- `INTEGRITY_REGISTRY_ADDRESS=<endereco-do-contrato>`
3. Executar backend e simulador.

## Observacoes metodologicas
- Dados completos permanecem no MongoDB (off-chain).
- Blockchain registra hash + metadados minimos para auditoria e verificacao de integridade.
