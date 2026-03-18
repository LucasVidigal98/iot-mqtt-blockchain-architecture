# Backend Processing (TypeScript)

## Escopo atual
- Consome mensagens MQTT como subscriber
- Valida payload JSON v1 via `@iot/shared`
- Persiste dados no MongoDB
- Gera hash SHA-256 por mensagem valida
- Registra evidencia via adapter de ledger:
  - `mock` (padrao)
  - `ethereum` (Ganache + smart contract)

Fluxo implementado:
`Sensor -> MQTT -> Backend -> MongoDB -> Hash -> LedgerAdapter`

## Estrutura da aplicacao
- `apps/backend/src/mqtt-consumer.ts`: conexao MQTT, subscribe e despacho das mensagens
- `apps/backend/src/message-validator.ts`: parse + validacao de contrato
- `apps/backend/src/repository/mongo-sensor-repository.ts`: persistencia no MongoDB
- `apps/backend/src/hash-service.ts`: canonicalizacao e hash SHA-256
- `apps/backend/src/integrity-ledger-adapter.ts`: interface do ledger
- `apps/backend/src/integrity-ledger-mock.ts`: implementacao mock do ledger
- `apps/backend/src/integrity-ledger-ethereum.ts`: implementacao real com ethers
- `apps/backend/src/pipeline.ts`: orquestracao de processamento
- `apps/backend/src/index.ts`: bootstrap, logs e metricas

## Variaveis de ambiente
- `MQTT_URL` (padrao: `mqtt://localhost:1883`)
- `MQTT_TOPIC_FILTER` (padrao: `iot/buildings/+/sensors/+/+`)
- `MONGO_URI` (padrao: `mongodb://localhost:27017`)
- `MONGO_DB` (padrao: `iot_experiment`)
- `MONGO_COLLECTION` (padrao: `sensor_readings`)
- `LEDGER_MODE` (`mock` ou `ethereum`, padrao: `mock`)
- `ETH_RPC_URL` (padrao: `http://localhost:8545`)
- `ETH_PRIVATE_KEY` (obrigatoria quando `LEDGER_MODE=ethereum`)
- `INTEGRITY_REGISTRY_ADDRESS` (obrigatoria quando `LEDGER_MODE=ethereum`)

## Como executar localmente
1. Instale dependencias:
- `npm run install:all`
2. Suba infraestrutura:
- `docker compose -f infra/docker/docker-compose.yml up -d`
3. Rode backend:
- `npm run dev:backend`
4. Rode simulador em outro terminal:
- `npm run dev:sensors`

## Modo Ethereum (sessao 3.6)
1. Com Ganache ativo, deploy do contrato:
- `npm run deploy:contracts:local`
2. Copie o endereco exibido no deploy.
3. Execute o backend com variaveis:
- `LEDGER_MODE=ethereum`
- `ETH_RPC_URL=http://localhost:8545`
- `ETH_PRIVATE_KEY=<private-key-da-carteira-ganache>`
- `INTEGRITY_REGISTRY_ADDRESS=<endereco-do-contrato>`

## Testes
- Backend: `npm run test:backend`
- Smart contract: `npm run test:contracts`

## Colecao MongoDB
Cada registro possui:
- `payload` (mensagem original validada)
- `receivedAt`
- `hash`
- `processingStatus` (`stored`, `ledger_committed`, `ledger_failed`)
- `ledgerTxId`
- `processingError`
- `updatedAt`
