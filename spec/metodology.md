# 📘 Contexto Consolidado — Metodologia do TCC

## Tema do Trabalho

**Blockchain como Camada de Segurança em Redes IoT para Ambientes Empresariais**

Curso: MBA em Engenharia de Software — USP/Esalq
Limite do trabalho: **30 páginas**

---

# 🎯 Objetivo da Metodologia

A seção de metodologia descreve **como a arquitetura experimental foi implementada e como os experimentos foram conduzidos**, permitindo que outros pesquisadores compreendam e reproduzam o estudo.

O trabalho possui **caráter aplicado**, conforme exigido pelo manual do MBA USP/Esalq, envolvendo o desenvolvimento de um ambiente experimental que integra:

* dispositivos IoT simulados
* comunicação baseada em MQTT
* backend de processamento em Node.js
* banco de dados tradicional
* blockchain Ethereum
* smart contracts para registro de integridade

A metodologia foi estruturada de forma a descrever:

* arquitetura da solução
* ambiente experimental
* simulação dos dispositivos IoT
* implementação dos componentes do sistema
* execução dos experimentos
* simulação de adulteração de dados
* métricas utilizadas na avaliação

---

# 🧠 Diretrizes de Escrita Utilizadas

Durante a redação da metodologia foram seguidas as recomendações do manual de TCC da USP/Esalq.

## Forma de escrita

* texto redigido **no pretérito perfeito**
* **forma impessoal**
* linguagem **técnica e objetiva**
* foco em **descrição reproduzível do método**

## Exemplos adotados

✔ "Foi implementada uma arquitetura experimental baseada em contêineres Docker."

✔ "Os sensores foram simulados por meio de aplicações desenvolvidas em Node.js."

✔ "Os dados recebidos foram armazenados em um banco de dados MongoDB."

## Expressões evitadas

❌ "Este trabalho busca..."
❌ "Pretende-se..."
❌ "Foi feita uma análise..."

---

# 📐 Estrutura Final da Metodologia

```text
3 Metodologia

3.1 Arquitetura da solução experimental
3.2 Arquitetura de comunicação baseada em MQTT
3.3 Ambiente experimental
3.4 Simulação dos sensores IoT
3.5 Implementação do backend de processamento
3.6 Implementação do smart contract
3.7 Procedimento experimental
3.8 Simulação de adulteração de dados
3.9 Métricas de avaliação
```

---

# 3.1 Arquitetura da Solução Experimental

A arquitetura experimental foi inspirada na proposta de **Dorri et al. (2017)** para integração entre IoT e blockchain.

A solução adaptou esse modelo para um **cenário corporativo**, no qual:

* sensores IoT simulados geram dados operacionais
* os dados são transmitidos via MQTT
* um backend processa e armazena as informações
* um hash criptográfico é gerado para cada registro
* o hash é registrado em um *smart contract* na blockchain Ethereum

A blockchain foi utilizada **exclusivamente como mecanismo de verificação de integridade e auditoria**, mantendo os dados completos armazenados em banco tradicional.

Essa abordagem permitiu preservar a arquitetura convencional de sistemas IoT enquanto adiciona uma **camada complementar de segurança baseada em blockchain**.

---

# 3.2 Arquitetura de Comunicação Baseada em MQTT

A comunicação entre os dispositivos IoT simulados e o backend foi implementada utilizando o protocolo **MQTT**, que segue o modelo *publish–subscribe*.

Os papéis definidos foram:

| Componente   | Papel         |
| ------------ | ------------- |
| Sensores IoT | Publishers    |
| Broker MQTT  | Intermediário |
| Backend      | Subscriber    |

O broker MQTT utilizado foi **Mosquitto**, responsável por distribuir as mensagens publicadas pelos sensores para os componentes interessados.

Essa arquitetura de comunicação segue a abordagem descrita por **Akshatha e Kumar (2023)** para integração entre sistemas IoT e plataformas baseadas em blockchain.

---

# 3.3 Ambiente Experimental

O ambiente experimental foi implementado utilizando **contêineres Docker**, permitindo executar todos os componentes da arquitetura de forma isolada e reproduzível.

Essa abordagem possibilitou simular um ambiente distribuído controlado, facilitando a execução dos experimentos e a coleta das métricas de desempenho.

## Tecnologias utilizadas

| Camada da Arquitetura  | Tecnologia |
| ---------------------- | ---------- |
| Sensores IoT simulados | Node.js    |
| Comunicação            | MQTT       |
| Broker MQTT            | Mosquitto  |
| Backend                | Node.js    |
| Banco de dados         | MongoDB    |
| Blockchain             | Ethereum   |
| Rede local blockchain  | Ganache    |
| Smart contract         | Solidity   |
| Infraestrutura         | Docker     |

Foi definida a inclusão de **uma tabela no TCC** resumindo essas tecnologias para facilitar a compreensão da arquitetura experimental.

---

# 3.4 Simulação dos Sensores IoT

Os dispositivos IoT foram simulados por meio de aplicações desenvolvidas em **Node.js**.

## Sensores simulados

Foram implementados **cinco dispositivos IoT simulados**:

| Tipo de sensor | Quantidade |
| -------------- | ---------- |
| Temperatura    | 3          |
| Iluminação     | 2          |

---

## Comportamento dos sensores

### Sensores de temperatura

* geração de telemetria contínua
* leitura a cada **5 segundos**

Simulam medições ambientais típicas.

---

### Sensores de iluminação

* geração de eventos de estado
* valores **ON/OFF**

Em ambientes reais esses eventos ocorrem em intervalos maiores.
Para fins experimentais, os eventos foram **acelerados para intervalos entre 30 e 60 segundos**, permitindo geração suficiente de dados durante os testes.

---

## Estrutura das mensagens MQTT

As mensagens foram estruturadas em formato **JSON**, contendo:

* sensorId
* buildingId
* type
* value
* timestamp

Exemplo conceitual:

```javascript
{
  sensorId: "temp-01",
  buildingId: "building-A",
  type: "temperature",
  value: 22.4,
  timestamp: "2026-03-12T20:00:00Z"
}
```

---

## Inclusão de Trechos de Código

Por recomendação do orientador, foram incluídas **listagens de código representativas**, demonstrando aspectos relevantes da implementação.

Boas práticas adotadas:

* inclusão apenas de **trechos curtos**
* foco em **comportamentos do sistema**
* evitar código extenso

Listagens utilizadas na metodologia:

| Listagem   | Conteúdo                                 |
| ---------- | ---------------------------------------- |
| Listagem 1 | Estrutura do objeto de leitura do sensor |
| Listagem 2 | Publicação MQTT                          |
| Listagem 3 | Geração de hash no backend               |
| Listagem 4 | Estrutura do smart contract              |

---

# 3.5 Implementação do Backend de Processamento

O backend foi implementado em **Node.js** e configurado para atuar como **subscriber MQTT**, recebendo as mensagens publicadas pelos sensores.

## Fluxo de processamento

```
Sensor → MQTT → Backend → Banco → Hash → Blockchain
```

Funções do backend:

* receber mensagens MQTT
* desserializar dados JSON
* validar estrutura das mensagens
* armazenar registros no MongoDB
* gerar hash criptográfico dos dados
* registrar hash no smart contract

O algoritmo **SHA-256** foi utilizado para gerar o hash criptográfico associado a cada registro.

Após a geração do hash, o backend executou uma chamada ao *smart contract* na blockchain Ethereum para registrar a evidência criptográfica correspondente.

---

# 3.6 Implementação do Smart Contract

A camada blockchain foi implementada utilizando **Ethereum em rede local por meio do Ganache**.

Foi desenvolvido um *smart contract* em **Solidity** responsável por registrar:

* hash criptográfico do registro
* identificador do sensor
* identificador do prédio
* timestamp da transação

O contrato foi projetado de forma simples, contendo uma função responsável pelo registro das evidências de integridade.

A blockchain foi utilizada como **livro-razão distribuído destinado exclusivamente ao registro de provas criptográficas**, enquanto os dados completos permaneceram armazenados no banco de dados tradicional.

---

# 3.7 Procedimento Experimental

Os experimentos foram executados em **dois cenários distintos**.

## Cenário 1 — Arquitetura Tradicional

* sensores geram dados
* backend recebe mensagens MQTT
* dados são armazenados no MongoDB

Nesse cenário não existe registro de evidências na blockchain.

---

## Cenário 2 — Arquitetura com Blockchain

* sensores geram dados
* backend armazena registros no MongoDB
* hash criptográfico é gerado
* hash é registrado no smart contract

Essa configuração permitiu comparar o comportamento do sistema com e sem a utilização da blockchain.

---

# 3.8 Simulação de Adulteração de Dados

Para avaliar a capacidade de detecção de alterações nos dados, foi realizado um procedimento de **adulteração deliberada de registros no banco de dados**.

O procedimento consistiu em:

1. geração de registros válidos pelos sensores
2. armazenamento no banco de dados
3. registro dos hashes na blockchain
4. modificação manual de registros no MongoDB
5. recalculo do hash dos dados armazenados
6. comparação com o hash registrado na blockchain

Diferenças entre os valores indicaram **inconsistência nos dados**, demonstrando a capacidade da arquitetura em detectar alterações posteriores.

---

# 3.9 Métricas de Avaliação

As métricas de avaliação foram estruturadas de forma **híbrida**, integrando os resultados dos experimentos 3.7 e 3.8.

No **Experimento 3.7 (comparação entre cenários tradicional e com blockchain)**, foram adotadas métricas de desempenho e sobrecarga operacional:

* `messagesProcessed`
* `throughputMps`
* `latencyAvgMs`
* `latencyP95Ms`
* `failureRate`

Para comparação entre os cenários, foi utilizada a variação percentual:

`variacao% = ((blockchain - tradicional) / tradicional) * 100`

Essa formula foi aplicada a throughput, latência média, latência p95 e taxa de falha, permitindo quantificar o impacto da inclusão da blockchain no fluxo de processamento.

No **Experimento 3.8 (simulação de adulteração de dados)**, foram utilizadas métricas de integridade, rastreabilidade e auditoria:

* `eligibleRecords`
* `tamperedRecords`
* `detected`
* `undetected`
* `verificationErrors`
* `detectionRate`

A capacidade de auditoria foi avaliada pelo pipeline de adulteração controlada, no qual os registros modificados no MongoDB tiveram seus hashes recalculados e comparados às evidências previamente registradas na blockchain.

Em conjunto, essas medições permitiram analisar o trade-off entre custo de desempenho e ganho de garantias de integridade e auditabilidade da arquitetura proposta.

---

# 📊 Elementos Visuais Planejados

A metodologia poderá incluir elementos visuais para facilitar a compreensão da arquitetura.

## Tabela

Tecnologias utilizadas na arquitetura experimental.

---

## Figura 1 — Arquitetura Geral

```
Sensores → MQTT → Backend → Banco
                       ↓
                   Blockchain
```

---

## Figura 2 — Fluxo de Registro de Integridade

```
Sensor → MQTT → Backend → Banco
                          ↓
                       Hash
                          ↓
                    Smart Contract
```

---

# 📌 Status da Metodologia

| Seção                                   | Status |
| --------------------------------------- | ------ |
| 3.1 Arquitetura da solução experimental | ✔      |
| 3.2 Comunicação MQTT                    | ✔      |
| 3.3 Ambiente experimental               | ✔      |
| 3.4 Simulação dos sensores IoT          | ✔      |
| 3.5 Backend                             | ✔      |
| 3.6 Smart contract                      | ✔      |
| 3.7 Procedimento experimental           | ✔      |
| 3.8 Adulteração de dados                | ✔      |
| 3.9 Métricas                            | ✔      |

---

# ✔ Metodologia Concluída

A seção de metodologia descreve de forma completa:

* a arquitetura experimental proposta
* os componentes implementados
* o ambiente de execução
* o procedimento experimental
* os mecanismos de verificação de integridade
* as métricas utilizadas na avaliação

Essa estrutura fornece base para a próxima seção do trabalho:

**Resultados e Discussão**.
