---
id: plan-simulacao-sensores-iot-v1
titulo: Planejamento da Sessao 3.4 - Simulacao dos Sensores IoT
projeto: iot-mqtt-blockchain-architecture
autor_execucao: codex-gpt5
data: 2026-03-16
status: draft
idioma: pt-BR
tipo_documento: text-meta-data
relacao_tcc:
  tema: Blockchain como Camada de Seguranca em Redes IoT para Ambientes Empresariais
  secao_alvo: 3.4 Simulacao dos sensores IoT
  secoes_dependentes:
    - 3.5 Implementacao do backend de processamento
    - 3.6 Implementacao do smart contract
    - 3.7 Procedimento experimental
    - 3.8 Simulacao de adulteracao de dados
    - 3.9 Metricas de avaliacao
---

# Objetivo
Planejar a implementacao da simulacao de sensores IoT de forma alinhada com a arquitetura completa do TCC, preservando compatibilidade com MQTT, backend Node.js, MongoDB, Ethereum/Ganache, smart contract em Solidity e execucao via Docker, em formato monorepo.

# Observacao de linguagem
- Todo codigo executado no ecossistema Node.js (simuladores, backend e pacotes compartilhados) sera implementado em TypeScript.

# Tecnologias Identificadas na Metodologia
- Node.js (simuladores IoT e backend)
- MQTT (protocolo de comunicacao)
- Mosquitto (broker MQTT)
- MongoDB (persistencia de dados)
- Ethereum (registro de integridade)
- Ganache (rede local Ethereum)
- Solidity (smart contract)
- Docker (orquestracao/ambiente reproduzivel)
- SHA-256 (hash criptografico no backend)
- JSON (formato de mensagem)

# Premissas de Alinhamento Arquitetural
- A simulacao deve publicar payloads prontos para o fluxo completo `Sensor -> MQTT -> Backend -> MongoDB -> Hash -> Blockchain`.
- O schema de mensagens deve ser estavel desde a simulacao para evitar retrabalho nas secoes 3.5 e 3.6.
- A geracao de dados deve permitir comparacao entre cenario tradicional e cenario com blockchain (3.7).
- O desenho deve facilitar adulteracao controlada de registros para validacao de integridade (3.8).
- Os logs da simulacao devem permitir medir latencia e throughput (3.9).

# Proposta de Estrutura Monorepo (inicial)
- `apps/sensor-simulator/` aplicacao Node.js para simular sensores
- `apps/backend/` consumidor MQTT e processador de dados
- `apps/verifier/` (futuro) rotina de verificacao de integridade para adulteracao
- `contracts/integrity-registry/` smart contract Solidity
- `packages/shared/` tipos, schemas JSON e utilitarios comuns
- `infra/docker/` docker-compose e configuracoes de infraestrutura
- `docs/` documentacao de execucao e reproducao experimental
- `text-meta-data/` planejamentos e artefatos de rastreabilidade metodologica

# Planejamento da Sessao 3.4 - Simulacao dos Sensores IoT

## Fase 1 - Definicao funcional da simulacao
1. Definir os 5 sensores simulados:
- Temperatura: `temp-01`, `temp-02`, `temp-03`
- Iluminacao: `light-01`, `light-02`
2. Definir `buildingId` padrao inicial: `building-A`.
3. Definir topicos MQTT:
- Opcao recomendada: `iot/buildings/{buildingId}/sensors/{type}/{sensorId}`
4. Congelar schema de payload v1:
- `sensorId`, `buildingId`, `type`, `value`, `timestamp`

## Fase 2 - Modelagem de comportamento dos sensores
1. Temperatura:
- envio a cada 5 segundos
- faixa inicial sugerida: 18.0 a 30.0
- variacao pequena entre leituras para realismo
2. Iluminacao:
- evento ON/OFF
- intervalo aleatorio entre 30 e 60 segundos
3. Controle de aleatoriedade:
- incluir `seed` configuravel para reproducibilidade experimental

## Fase 3 - Contrato de dados compartilhado
1. Criar tipagem/schemas compartilhados no monorepo (`packages/shared`).
2. Validar payload antes de publicar no broker.
3. Padronizar `timestamp` em ISO 8601 UTC.

## Fase 4 - Implementacao tecnica do simulador (app dedicada)
1. Inicializar `apps/sensor-simulator` com Node.js.
2. Definir configuracoes via variaveis de ambiente:
- host/porta MQTT
- intervalo/fator de aceleracao
- quantidade de sensores por tipo
- nivel de log
3. Implementar modulos:
- `sensor-factory` (instancia sensores)
- `payload-builder` (monta JSON)
- `mqtt-publisher` (publicacao)
- `scheduler` (controle de intervalos)
4. Garantir logs estruturados por evento publicado.

## Fase 5 - Integracao com ambiente experimental
1. Conectar simulador ao Mosquitto local.
2. Preparar execucao via Docker Compose (alinhado a 3.3).
3. Validar que mensagens sao consumiveis pelo backend sem transformacoes adicionais.

## Fase 6 - Preparacao para experimentos
1. Incluir modo de execucao para cenario base (sem blockchain) e cenario completo.
2. Exportar metricas de emissao da simulacao:
- total de mensagens
- mensagens por sensor
- taxa de envio por minuto
3. Gerar logs com correlacao minima (`sensorId` + `timestamp`).

## Fase 7 - Criterios de pronto da secao 3.4
1. Cinco sensores ativos publicando conforme periodicidade definida.
2. Payload JSON aderente ao schema v1 em 100% das mensagens validas.
3. Simulacao executavel localmente e por Docker.
4. Evidencia de publicacao em topicos MQTT e consumo pelo backend.
5. Documentacao curta para reproducao dos testes.

# Riscos e Mitigacoes
- Risco: Divergencia de schema entre simulador e backend.
- Mitigacao: schema centralizado em `packages/shared`.

- Risco: Dados pouco realistas para comparacao experimental.
- Mitigacao: parametrizacao de faixa/variacao e seed fixa para execucoes controladas.

- Risco: Acoplamento excessivo com blockchain nesta fase.
- Mitigacao: manter simulador independente; blockchain permanece no backend.

# Backlog Inicial (ordem recomendada)
1. Criar estrutura de pastas do monorepo.
2. Implementar contrato de dados compartilhado (`packages/shared`).
3. Implementar simulador com dois tipos de sensores.
4. Integrar com broker MQTT e validar publicacao.
5. Preparar compose para execucao repetivel.
6. Registrar evidencia de teste para uso na redacao do TCC.

# Entregavel deste planejamento
Arquivo de planejamento da sessao 3.4 criado em `text-meta-data/planejamento-simulacao-sensores-iot.md` para guiar a implementacao incremental alinhada as demais secoes metodologicas.
