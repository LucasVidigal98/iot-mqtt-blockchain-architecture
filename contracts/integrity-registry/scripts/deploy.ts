import { ethers } from "hardhat";

async function main(): Promise<void> {
  const factory = await ethers.getContractFactory("IntegrityRegistry");
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`IntegrityRegistry deployed at ${address}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown_deploy_error";
  console.error(`Deploy failed: ${message}`);
  process.exit(1);
});
