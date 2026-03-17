# Sensor Simulator (TypeScript)

## Escopo atual
- 3 sensores de temperatura: `temp-01`, `temp-02`, `temp-03`
- 2 sensores de iluminacao: `light-01`, `light-02`
- Topico MQTT padrao: `iot/buildings/{buildingId}/sensors/{type}/{sensorId}`
- Payload JSON: `sensorId`, `buildingId`, `type`, `value`, `timestamp`

## Como executar
1. Instale dependencias do monorepo:
   - `npm run install:all`
2. Suba o broker MQTT:
   - `docker compose -f infra/docker/docker-compose.yml up -d`
3. Rode o simulador:
   - `npm run dev:sensors`

## Variaveis de ambiente
- `MQTT_URL` (padrao: `mqtt://localhost:1883`)
- `BUILDING_ID` (padrao: `building-A`)
- `TOPIC_TEMPLATE` (padrao: `iot/buildings/{buildingId}/sensors/{type}/{sensorId}`)
- `TEMPERATURE_INTERVAL_MS` (padrao: `5000`)
- `LIGHT_MIN_INTERVAL_MS` (padrao: `30000`)
- `LIGHT_MAX_INTERVAL_MS` (padrao: `60000`)
- `METRICS_INTERVAL_MS` (padrao: `60000`)
- `SIMULATION_SEED` (padrao: `42`)
- `TEMPERATURE_SENSOR_IDS` (padrao: `temp-01,temp-02,temp-03`)
- `LIGHT_SENSOR_IDS` (padrao: `light-01,light-02`)

## Observacoes
- Todo codigo Node.js foi implementado em TypeScript.
- O payload e validado antes da publicacao usando o pacote compartilhado `@iot/shared`.
