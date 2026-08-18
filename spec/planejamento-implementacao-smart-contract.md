---
id: plan-implementacao-smart-contract-v1
titulo: Planejamento da Sessao 3.6 - Implementacao do Smart Contract
projeto: iot-mqtt-blockchain-architecture
autor_execucao: codex-gpt5
data: 2026-03-17
status: implemented
idioma: pt-BR
tipo_documento: text-meta-data
relacao_tcc:
  tema: Blockchain como Camada de Seguranca em Redes IoT para Ambientes Empresariais
  secao_alvo: 3.6 Implementacao do smart contract
  secoes_dependentes:
    - 3.7 Procedimento experimental
    - 3.8 Simulacao de adulteracao de dados
    - 3.9 Metricas de avaliacao
---

# Objetivo
Implementar o smart contract de integridade da arquitetura experimental com Solidity + Hardhat + ethers, integrado ao backend Node.js/TypeScript por adapter Ethereum real, mantendo compatibilidade com o fluxo atual e com o modo mock.

# Tecnologias Alinhadas
- Node.js + TypeScript (apps e scripts)
- MQTT + Mosquitto (ingestao)
- MongoDB (persistencia off-chain)
- SHA-256 (hash no backend)
- Ethereum (registro de integridade)
- Ganache (rede local de blockchain)
- Solidity (smart contract)
- Hardhat + ethers (build/test/deploy)
- Docker Compose (ambiente reproduzivel)
- JSON (payload IoT v1)

# Estrutura Monorepo Atualizada
- `apps/sensor-simulator/` simulacao dos sensores
- `apps/backend/` processamento e integracao com ledger mock/ethereum
- `packages/shared/` tipos e validacao compartilhada
- `contracts/integrity-registry/` contrato, deploy e testes
- `infra/docker/` Mosquitto, MongoDB e Ganache
- `docs/` guias de execucao e reproducao
- `text-meta-data/` rastreabilidade metodologica

# Passo a Passo Implementado
1. Criado pacote `contracts/integrity-registry` com `hardhat.config.ts`, scripts de deploy e testes TypeScript.
2. Implementado contrato `IntegrityRegistry.sol` com registro de evidencia, consulta por id e indice por hash.
3. Implementadas validacoes minimas on-chain (`hash != 0x0`, campos textuais obrigatorios).
4. Implementado evento `EvidenceRegistered` com metadados de auditoria.
5. Adicionado servico `ganache` ao `docker-compose` na porta `8545`.
6. Integrado backend com `IntegrityLedgerEthereumAdapter` via `ethers`.
7. Implementada selecao de adapter por ambiente (`LEDGER_MODE=mock|ethereum`).
8. Evoluida persistencia para `ledgerTxId` (campo neutro de provider), substituindo `ledgerRefMock`.
9. Incluidos testes de contrato e testes unitarios do adapter Ethereum.
10. Atualizados scripts de monorepo para instalar/buildar/testar/deployar contratos.
11. Atualizada documentacao de operacao do backend e criado guia dedicado do smart contract.

# Interface On-Chain Implementada
- `registerEvidence(bytes32 hash, string sensorId, string buildingId, string eventTimestamp) returns (uint256 evidenceId)`
- `getEvidenceById(uint256 evidenceId)`
- `getEvidenceIdsByHash(bytes32 hash)`
- Evento `EvidenceRegistered(evidenceId, hash, sensorId, buildingId, eventTimestamp, blockTimestamp, sender)`

# Criterios de Pronto Atendidos
- Contrato compila em Hardhat e possui suite de testes basica cobrindo sucesso e validacoes.
- Ganache integrado ao ambiente Docker local.
- Backend preserva contrato `registerEvidence(input/output)` no adapter.
- Pipeline continua funcional em modo mock e habilita modo Ethereum por variaveis de ambiente.
- Persistencia armazena `ledgerTxId` para compatibilidade com qualquer provider.
- Documentacao de execucao local e deploy do contrato disponivel.

# Evidencias Tecnicas da Implementacao
- Contrato e testes: `contracts/integrity-registry`
- Integracao backend: `apps/backend/src/integrity-ledger-ethereum.ts`
- Infraestrutura local: `infra/docker/docker-compose.yml`
- Guia backend atualizado: `docs/backend-processing.md`
- Guia smart contract: `docs/smart-contract-integrity-registry.md`

# Proximos Passos (Sessao 3.7)
Executar bateria de experimentos comparando cenario base (ledger mock/desativado) e cenario com blockchain ativa, coletando latencia end-to-end, throughput e taxa de falhas de confirmacao.
