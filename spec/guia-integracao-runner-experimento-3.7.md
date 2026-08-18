# Guia de Integração do Runner de Experimento 3.7

## 1. Objetivo e escopo
Este documento consolida os passos importantes adotados na implementação do runner `scripts/run-experiment-3.7.mjs` para servir como base de contexto em futuras integrações.

O runner automatiza o **Procedimento Experimental 3.7** em dois cenários:
- **Tradicional** (`LEDGER_MODE=mock`)
- **Blockchain** (`LEDGER_MODE=ethereum`, com deploy automático de contrato)

Resultado esperado de cada execução:
- Coleta de métricas comparáveis entre cenários
- Geração de artefatos estruturados para análise
- Execução reprodutível por comando único

## 2. Arquitetura de execução do runner
A execução foi desenhada como máquina de estados explícita:
- `preflight`: valida dependências e ambiente
- `infra_up`: sobe serviços com Docker Compose
- `scenario_run`: executa cenários e repetições
- `infra_down`: encerra infraestrutura com cleanup garantido

### 2.1 Preflight
Validações principais:
- binários disponíveis: `node`, `npm`, `docker`, `docker compose`
- diretórios de dependências (`node_modules`) dos pacotes necessários
- arquivo de compose existente (`infra/docker/docker-compose.yml`)
- checagem de portas em uso por processos esperados
- presença de chave Ethereum para cenário blockchain

### 2.2 Infraestrutura
Serviços usados:
- Mosquitto (`1883`)
- MongoDB (`27017`)
- Ganache (`8545`)

Ponto crítico implementado:
- Espera de prontidão real do Mongo (`mongosh ping`), além da abertura de porta

### 2.3 Execução dos cenários
Para cada cenário e repetição:
- Limpa coleção alvo no Mongo
- (Blockchain) faz deploy do contrato e captura endereço
- Sobe backend e simulador como subprocessos controlados
- Aguarda sinais de prontidão via logs:
  - backend: `backend_started`
  - sensor: `mqtt_connected`
- Aplica janela de `warmup + duration`
- Encerra processos com:
  - `SIGTERM` (graceful)
  - fallback `SIGKILL` (caso necessário)

### 2.4 Isolamento por repetição
Foi implementado isolamento para evitar interferência externa:
- `BUILDING_ID` único por repetição
- `MQTT_TOPIC_FILTER` específico da repetição no backend

Isso evita mistura de tráfego MQTT de outras execuções/processos.

## 3. Configuração e execução
## 3.1 Comando principal
No `package.json`:
- `npm run experiment:3.7`

## 3.2 Flags suportadas
- `--runs` (default: `3`)
- `--durationSec` (default: `180`)
- `--warmupSec` (default: `15`)
- `--outDir` (default: `artifacts/experiment-3.7`)
- `--globalTimeoutSec` (calculado automaticamente se não informado)

## 3.3 Variáveis de ambiente relevantes
- `MQTT_URL`
- `MONGO_DB`
- `MONGO_COLLECTION`
- `ETH_RPC_URL`
- `ETH_PRIVATE_KEY`

## 3.4 Exemplo de execução (smoke test)
```bash
npm run experiment:3.7 -- --runs=1 --durationSec=10 --warmupSec=2 --outDir=/tmp/experiment-3.7-smoke
```

## 4. Pipeline de métricas
Fonte principal:
- Parsing de logs JSON do backend (`backend.log`)

Eventos usados:
- sucesso: `backend_message_processed`
- falha de ledger: `backend_message_ledger_failed`
- rejeição: `backend_message_rejected`

Métricas calculadas:
- `messagesReceived`
- `messagesProcessed`
- `throughputMps` (`messagesProcessed / durationSec`)
- falhas (`ledgerFailures`, `parseErrors`, `validationErrors`, `failureRate`)
- latência de processamento (`durationMs`) com agregados:
  - `avg`
  - `p95`
  - `min`
  - `max`

## 5. Artefatos gerados
No diretório de saída (`--outDir`):
- `scenario-traditional.json`
- `scenario-blockchain.json`
- `comparison.md`
- `raw/traditional/*` e `raw/blockchain/*` com logs agregados e por repetição

## 6. Histórico de correções importantes
Estas correções foram decisivas para estabilizar o runner:

1. **Readiness real de Mongo**
- Problema: `ECONNREFUSED` ao limpar coleção logo após `infra_up`
- Causa: porta aberta sem banco totalmente pronto
- Correção: `waitForMongoReady` com `mongosh ping`

2. **Retry no reset de coleção**
- Problema: falha intermitente no `deleteMany` inicial
- Correção: `retryAsync` com tentativas e delay para `resetMongoCollection`

3. **Isolamento por tópico/building**
- Problema: métricas inconsistentes por interferência de tráfego externo
- Correção: `buildingId` único + filtro MQTT dedicado por repetição

4. **Controle robusto de subprocessos**
- Problema: travamentos e encerramento incompleto
- Correção: espera por eventos de prontidão, timeout por etapa, shutdown com `SIGTERM` e fallback

5. **Diagnóstico de falhas de ledger em análise**
- Problema observado em execuções reais: erro de nonce no Ganache/ethers
- Sintoma típico: `the tx doesn't have the correct nonce`
- Impacto: aumento de `ledgerFailures`, queda de `messagesProcessed`, possíveis `n/a` em métricas de latência

## 7. Troubleshooting para futuras integrações
## 7.1 Sintoma: execução para em `scenario_iteration_started`
Como validar:
- Verificar `raw/<scenario>/backend.log` e `sensors.log`
- Buscar `backend_started` e `mqtt_connected`

Causas prováveis:
- backend/sensor não subiram
- dependências ausentes
- infraestrutura indisponível

Ação recomendada:
- executar `npm run install:all`
- validar `docker compose` e portas
- repetir com smoke test curto

## 7.2 Sintoma: `ledgerFailures` altos no blockchain
Como validar:
- Buscar `backend_message_ledger_failed` no `backend.log`
- Inspecionar campo `error`

Causa provável comum:
- erro de nonce (`tx has nonce`, `correct nonce`)

Ação recomendada:
- reiniciar infraestrutura local
- limpar estado do Ganache
- rerodar o cenário blockchain

## 7.3 Sintoma: métricas de blockchain zeradas ou `n/a`
Como validar:
- verificar `messagesProcessed` no `scenario-blockchain.json`
- checar volume de `ledgerFailures`

Causa provável:
- nenhuma mensagem processada com sucesso na janela de medição

Ação recomendada:
- executar novo run
- confirmar ausência de interferência externa
- validar erros de ledger antes de usar resultados no TCC

## 8. Checklist: antes de integrar
- `npm run install:all` executado
- Docker e `docker compose` funcionais
- `.env` com parâmetros Ethereum válidos (quando aplicável)
- smoke test curto executado com sucesso
- arquivos `scenario-*.json` e `comparison.md` gerados
- métricas coerentes (especialmente `messagesProcessed` e `ledgerFailures`)
- logs brutos arquivados para auditoria/reprodutibilidade

## 9. Referência rápida de arquivos
- Runner: `scripts/run-experiment-3.7.mjs`
- Script NPM: `package.json` (`experiment:3.7`)
- Saídas padrão: `artifacts/experiment-3.7/`
- Metodologia-base: `text-meta-data/metodology.md` (seções 3.7 e 3.8)
