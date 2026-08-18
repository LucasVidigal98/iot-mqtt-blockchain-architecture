# Guia de Integração do Runner de Experimento 3.8

## 1. Objetivo e escopo
Este documento consolida os passos adotados na implementação do runner `scripts/run-experiment-3.8.mjs` para servir como base de contexto em futuras integrações.

O runner automatiza o **Experimento 3.8 — Simulação de Adulteração de Dados** em cenário com blockchain, com foco em:
- adulteração deliberada de registros no MongoDB
- recálculo de hash dos dados adulterados
- verificação das evidências registradas na blockchain
- geração de artefatos separados para análise no TCC

Resultado esperado de cada execução:
- detecção objetiva de adulteração pós-registro
- rastreabilidade por repetição e por registro adulterado
- saída separada do experimento 3.7 (sem alterar métricas existentes)

## 2. Arquitetura de execução do runner
A execução foi desenhada como máquina de estados explícita:
- `preflight`: valida dependências e ambiente
- `infra_up`: sobe serviços com Docker Compose
- `baseline_run`: executa coleta de dados válidos (backend + sensores)
- `tamper_phase`: adultera amostra de registros persistidos
- `verification_phase`: compara hashes adulterados com evidências em cadeia
- `infra_down`: encerra infraestrutura com cleanup garantido

### 2.1 Preflight
Validações principais:
- binários disponíveis: `node`, `npm`, `docker`, `docker compose`
- diretórios de dependências (`node_modules`) dos pacotes necessários
- arquivo de compose existente (`infra/docker/docker-compose.yml`)
- checagem de portas em uso por processos esperados
- presença de chave Ethereum para deploy/registro

### 2.2 Infraestrutura
Serviços usados:
- Mosquitto (`1883`)
- MongoDB (`27017`)
- Ganache (`8545`)

Ponto crítico implementado:
- espera de prontidão real do Mongo (`mongosh ping`) após subida de containers

### 2.3 Fluxo de repetição (run)
Para cada repetição:
- limpa coleção alvo no Mongo
- realiza deploy do contrato e captura endereço
- sobe backend e simulador como subprocessos controlados
- aguarda prontidão via logs:
  - backend: `backend_started`
  - sensor: `mqtt_connected`
- aplica janela de `warmup + duration`
- encerra processos com `SIGTERM` e fallback `SIGKILL`
- coleta registros `processingStatus = "ledger_committed"` do `buildingId` da repetição
- seleciona amostra aleatória por `tamperRate` (mínimo 1 se houver elegíveis)
- adultera apenas `payload.value`
- recalcula hash canônico do payload adulterado
- verifica evidência em cadeia via `getEvidenceIdsByHash`
- classifica cada registro adulterado em:
  - `tamper_detected`
  - `undetected`
  - `verification_error`

### 2.4 Isolamento por repetição
Foi implementado isolamento para evitar interferência externa:
- `BUILDING_ID` único por repetição (`exp38-adulteration-r<run>-<nonce>`)
- `MQTT_TOPIC_FILTER` específico da repetição no backend

## 3. Configuração e execução
### 3.1 Comando principal
No `package.json`:
- `npm run experiment:3.8`

### 3.2 Flags suportadas
- `--runs` (default: `3`)
- `--durationSec` (default: `180`)
- `--warmupSec` (default: `15`)
- `--tamperRate` (default: `0.2`)
- `--outDir` (default: `artifacts/experiment-3.8`)
- `--globalTimeoutSec` (calculado automaticamente se não informado)

### 3.3 Variáveis de ambiente relevantes
- `MQTT_URL`
- `MONGO_DB`
- `MONGO_COLLECTION`
- `ETH_RPC_URL`
- `ETH_PRIVATE_KEY`

### 3.4 Exemplo de execução (smoke test)
```bash
npm run experiment:3.8 -- --runs=1 --durationSec=20 --warmupSec=5 --tamperRate=0.2 --outDir=/tmp/experiment-3.8-smoke
```

## 4. Pipeline de verificação de adulteração
Fonte principal:
- registros persistidos no Mongo com `processingStatus = ledger_committed`
- consulta de evidência no smart contract por hash (`getEvidenceIdsByHash`)

Lógica de detecção por registro adulterado:
- `originalHash`: hash registrado pelo backend antes da adulteração
- `tamperedHash`: hash recalculado após adulteração de `payload.value`

Classificação:
- `tamper_detected`:
  - `originalEvidenceCount > 0` e `tamperedEvidenceCount == 0`
- `undetected`:
  - qualquer condição diferente da acima com consulta válida
- `verification_error`:
  - falha ao consultar blockchain (fallback controlado)

Métricas consolidadas do experimento 3.8:
- `eligibleRecords`
- `tamperedRecords`
- `detected`
- `undetected`
- `verificationErrors`
- `detectionRate`

## 5. Artefatos gerados
No diretório de saída (`--outDir`):
- `scenario-adulteration.json`
- `tamper-report.md`
- `raw/adulteration/backend.log`
- `raw/adulteration/sensors.log`
- `raw/adulteration/run-*/committed-records.json`
- `raw/adulteration/run-*/tampered-records.json`
- `raw/adulteration/run-*/verification.json`

Observação de isolamento:
- o runner 3.8 não sobrescreve arquivos de `artifacts/experiment-3.7`
- métricas e saídas do experimento 3.7 permanecem independentes

## 6. Estrutura de saída para Resultados e Discussões
O arquivo `tamper-report.md` foi desenhado para uso direto no TCC, contendo:
- parâmetros de execução
- tabela consolidada com:
  - registros elegíveis
  - registros adulterados
  - adulterações detectadas
  - taxa de detecção
  - falsos negativos (não detectados)
  - erros de verificação
- interpretação curta em linguagem impessoal/técnica

O arquivo `scenario-adulteration.json` mantém rastreabilidade detalhada por repetição e por registro adulterado (incluindo classificação).

## 7. Troubleshooting para futuras integrações
### 7.1 Sintoma: `eligibleRecords = 0`
Como validar:
- conferir `raw/adulteration/run-*/backend.log`
- buscar eventos `backend_message_processed` no `buildingId` da repetição

Causas prováveis:
- janela de medição curta para volume útil
- falhas de ledger elevadas no período

Ação recomendada:
- aumentar `durationSec` (ex.: 30 a 60s)
- reduzir interferências externas no host
- validar saúde do Ganache antes da execução

### 7.2 Sintoma: `verification_error` elevado
Como validar:
- verificar mensagens `hash_query_failed` nos logs do runner
- confirmar conectividade com RPC (`ETH_RPC_URL`) e endereço de contrato

Causas prováveis:
- indisponibilidade momentânea do Ganache
- falha de consulta ao contrato no processo de verificação

Ação recomendada:
- reiniciar infraestrutura local
- rerodar experimento após `docker compose down/up`

### 7.3 Sintoma: `undetected` > 0
Como validar:
- inspecionar `tampered-records.json` e `verification.json` por run
- conferir `originalEvidenceCount` e `tamperedEvidenceCount` por registro

Causas prováveis:
- cenário de inconsistência operacional durante verificação
- adulteração aplicada com condições não esperadas

Ação recomendada:
- rerodar com mais repetições (`--runs=3`)
- preservar artefatos brutos para auditoria

## 8. Checklist: antes de integrar
- `npm run install:all` executado
- Docker e `docker compose` funcionais
- `.env` com parâmetros Ethereum válidos
- smoke test do 3.8 executado com sucesso
- `scenario-adulteration.json` e `tamper-report.md` gerados
- métricas de detecção coerentes (`detected`, `undetected`, `detectionRate`)
- logs brutos arquivados para rastreabilidade

## 9. Referência rápida de arquivos
- Runner: `scripts/run-experiment-3.8.mjs`
- Script NPM: `package.json` (`experiment:3.8`)
- Saídas padrão: `artifacts/experiment-3.8/`
- Runner base comparativo: `scripts/run-experiment-3.7.mjs`
- Guia base 3.7: `text-meta-data/guia-integracao-runner-experimento-3.7.md`
