# Backend Processing (TypeScript)

## Escopo atual
- Consome mensagens MQTT como subscriber
- Valida payload JSON v1 via `@iot/shared`
- Persiste dados no MongoDB
- Gera hash SHA-256 por mensagem valida
- Registra evidencia via adapter mock de ledger (preparacao para 3.6)

Fluxo implementado:
`Sensor -> MQTT -> Backend -> MongoDB -> Hash -> LedgerAdapterMock`

## Estrutura da aplicacao
- `apps/backend/src/mqtt-consumer.ts`: conexao MQTT, subscribe e despacho das mensagens
- `apps/backend/src/message-validator.ts`: parse + validacao de contrato
- `apps/backend/src/repository/mongo-sensor-repository.ts`: persistencia no MongoDB
- `apps/backend/src/hash-service.ts`: canonicalizacao e hash SHA-256
- `apps/backend/src/integrity-ledger-adapter.ts`: interface do ledger
- `apps/backend/src/integrity-ledger-mock.ts`: implementacao mock do ledger
- `apps/backend/src/pipeline.ts`: orquestracao de processamento
- `apps/backend/src/index.ts`: bootstrap, logs e metricas

## Variaveis de ambiente
- `MQTT_URL` (padrao: `mqtt://localhost:1883`)
- `MQTT_TOPIC_FILTER` (padrao: `iot/buildings/+/sensors/+/+`)
- `MONGO_URI` (padrao: `mongodb://localhost:27017`)
- `MONGO_DB` (padrao: `iot_experiment`)
- `MONGO_COLLECTION` (padrao: `sensor_readings`)

## Como executar localmente
1. Instale dependencias:
- `npm run install:all`
2. Suba infraestrutura:
- `docker compose -f infra/docker/docker-compose.yml up -d`
3. Rode backend:
- `npm run dev:backend`
4. Rode simulador em outro terminal:
- `npm run dev:sensors`

## Testes
- `npm run test:backend`

## Colecao MongoDB
Cada registro possui:
- `payload` (mensagem original validada)
- `receivedAt`
- `hash`
- `processingStatus` (`stored`, `ledger_committed`, `ledger_failed`)
- `ledgerRefMock`
- `processingError`
- `updatedAt`
