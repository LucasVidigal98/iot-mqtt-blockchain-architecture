---
id: plan-implementacao-backend-processamento-v1
titulo: Planejamento da Sessao 3.5 - Implementacao do Backend de Processamento
projeto: iot-mqtt-blockchain-architecture
autor_execucao: codex-gpt5
data: 2026-03-17
status: implemented
idioma: pt-BR
tipo_documento: text-meta-data
relacao_tcc:
  tema: Blockchain como Camada de Seguranca em Redes IoT para Ambientes Empresariais
  secao_alvo: 3.5 Implementacao do backend de processamento
  secoes_dependentes:
    - 3.6 Implementacao do smart contract
    - 3.7 Procedimento experimental
    - 3.8 Simulacao de adulteracao de dados
    - 3.9 Metricas de avaliacao
---

# Objetivo
Implementar o backend de processamento da arquitetura experimental com Node.js/TypeScript, consumindo mensagens MQTT, persistindo em MongoDB, gerando hash SHA-256 e registrando evidencias por adapter mock para preparar a integracao real de blockchain na sessao 3.6.

# Tecnologias Alinhadas
- Node.js + TypeScript (backend)
- MQTT + Mosquitto (ingestao)
- MongoDB (persistencia)
- SHA-256 (integridade)
- Ethereum/Ganache (proxima etapa via adapter real)
- Solidity (proxima etapa no smart contract)
- Docker (reproducao do ambiente)
- JSON (formato de mensagens)

# Estrutura Monorepo Atualizada
- `apps/sensor-simulator/` simulacao dos sensores IoT
- `apps/backend/` processamento de mensagens e persistencia
- `packages/shared/` tipos e validacao compartilhada
- `infra/docker/` Mosquitto e MongoDB
- `docs/` guias de execucao
- `text-meta-data/` rastreabilidade metodologica

# Passo a Passo Implementado
1. Criada aplicacao `apps/backend` em TypeScript com scripts de `build`, `dev`, `start` e `test`.
2. Implementado consumidor MQTT com subscribe em `iot/buildings/+/sensors/+/+`.
3. Implementado parser e validacao de payload usando `@iot/shared`.
4. Implementada persistencia MongoDB em colecao `sensor_readings`.
5. Implementado servico de hash SHA-256 sobre payload canonicalizado.
6. Definida interface `IntegrityLedgerAdapter` para registro de evidencias.
7. Implementado `IntegrityLedgerMockAdapter` para simulacao de transacao.
8. Implementado pipeline `receber -> validar -> salvar -> hash -> registrar` com tratamento de falhas.
9. Padronizados logs estruturados com campos de rastreabilidade e latencia.
10. Adicionado MongoDB ao `docker-compose` e scripts de monorepo para backend.
11. Incluidos testes unitarios para validacao e pipeline.

# Criterios de Pronto Atendidos
- Backend consome payload JSON v1 sem exigir mudancas no simulador.
- Mensagens validas sao persistidas no MongoDB.
- Hash SHA-256 e calculado de forma deterministica.
- Adapter mock recebe os campos minimos de evidencia.
- Falha no adapter nao remove registro persistido; status de erro fica rastreavel.
- Execucao local reproduzivel com Docker (Mosquitto + MongoDB).

# Evidencias Tecnicas da Implementacao
- App backend: `apps/backend`
- Guia operacional: `docs/backend-processing.md`
- Infra atualizada: `infra/docker/docker-compose.yml`
- Scripts monorepo atualizados: `package.json`

# Proximo Passo Planejado (Sessao 3.6)
Substituir `IntegrityLedgerMockAdapter` por implementacao real conectada ao smart contract em rede local Ganache, preservando a interface definida nesta sessao para evitar retrabalho no pipeline.
