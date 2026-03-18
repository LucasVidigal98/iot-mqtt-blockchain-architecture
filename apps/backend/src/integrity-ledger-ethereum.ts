import { Contract, JsonRpcProvider, NonceManager, Wallet } from "ethers";
import type {
  IntegrityLedgerAdapter,
  RegisterEvidenceInput,
  RegisterEvidenceOutput
} from "./integrity-ledger-adapter.js";

const INTEGRITY_REGISTRY_ABI = [
  "function registerEvidence(bytes32 hash, string sensorId, string buildingId, string eventTimestamp) returns (uint256)"
];

interface TransactionLike {
  hash: string;
  wait(): Promise<{ blockNumber: number | null }>;
}

interface ContractLike {
  registerEvidence(
    hash: string,
    sensorId: string,
    buildingId: string,
    eventTimestamp: string
  ): Promise<TransactionLike>;
}

interface ProviderLike {
  getBlock(blockNumber: number): Promise<{ timestamp: number } | null>;
}

interface EthereumLedgerClient {
  contract: ContractLike;
  provider: ProviderLike;
}

export interface EthereumLedgerAdapterOptions {
  rpcUrl: string;
  privateKey: string;
  contractAddress: string;
}

export class IntegrityLedgerEthereumAdapter implements IntegrityLedgerAdapter {
  private readonly client: EthereumLedgerClient;

  constructor(options: EthereumLedgerAdapterOptions, client?: EthereumLedgerClient) {
    this.client = client ?? createEthereumLedgerClient(options);
  }

  async registerEvidence(input: RegisterEvidenceInput): Promise<RegisterEvidenceOutput> {
    const tx = await this.client.contract.registerEvidence(
      normalizeBytes32Hash(input.hash),
      input.sensorId,
      input.buildingId,
      input.eventTimestamp
    );

    const receipt = await tx.wait();
    let committedAt = new Date().toISOString();

    if (receipt.blockNumber !== null) {
      const block = await this.client.provider.getBlock(receipt.blockNumber);
      if (block) {
        committedAt = new Date(block.timestamp * 1000).toISOString();
      }
    }

    return {
      txId: tx.hash,
      committedAt
    };
  }
}

function createEthereumLedgerClient(options: EthereumLedgerAdapterOptions): EthereumLedgerClient {
  const provider = new JsonRpcProvider(options.rpcUrl);
  const wallet = new Wallet(options.privateKey, provider);
  const signer = new NonceManager(wallet);
  const contract = new Contract(options.contractAddress, INTEGRITY_REGISTRY_ABI, signer);

  return {
    contract: {
      registerEvidence: async (hash, sensorId, buildingId, eventTimestamp) =>
        (contract.registerEvidence(hash, sensorId, buildingId, eventTimestamp) as Promise<TransactionLike>)
    },
    provider: {
      getBlock: async (blockNumber) => provider.getBlock(blockNumber)
    }
  };
}

function normalizeBytes32Hash(hash: string): string {
  const normalized = hash.startsWith("0x") ? hash : `0x${hash}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(normalized)) {
    throw new Error("invalid_sha256_hash");
  }
  return normalized;
}
