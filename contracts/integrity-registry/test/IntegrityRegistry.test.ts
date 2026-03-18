import assert from "node:assert/strict";
import { describe, it } from "mocha";
import { ethers } from "hardhat";

describe("IntegrityRegistry", () => {
  it("registers evidence and emits event", async () => {
    const factory = await ethers.getContractFactory("IntegrityRegistry");
    const contract = await factory.deploy();
    await contract.waitForDeployment();

    const hash = ethers.id("payload-1");
    const tx = await contract.registerEvidence(
      hash,
      "temp-01",
      "building-A",
      "2026-03-17T12:00:00.000Z"
    );
    const receipt = await tx.wait();

    assert.ok(receipt);
    assert.equal(receipt?.status, 1);
    assert.ok(receipt?.hash);

    const evidence = await contract.getEvidenceById(1);
    assert.equal(evidence.evidenceId, 1n);
    assert.equal(evidence.hash, hash);
    assert.equal(evidence.sensorId, "temp-01");
    assert.equal(evidence.buildingId, "building-A");
    assert.equal(evidence.eventTimestamp, "2026-03-17T12:00:00.000Z");

    const ids = await contract.getEvidenceIdsByHash(hash);
    assert.equal(ids.length, 1);
    assert.equal(ids[0], 1n);
  });

  it("rejects zero hash", async () => {
    const factory = await ethers.getContractFactory("IntegrityRegistry");
    const contract = await factory.deploy();
    await contract.waitForDeployment();

    await assert.rejects(
      contract.registerEvidence(
        ethers.ZeroHash,
        "temp-01",
        "building-A",
        "2026-03-17T12:00:00.000Z"
      ),
      /hash must not be zero/
    );
  });

  it("rejects empty sensorId", async () => {
    const factory = await ethers.getContractFactory("IntegrityRegistry");
    const contract = await factory.deploy();
    await contract.waitForDeployment();

    await assert.rejects(
      contract.registerEvidence(
        ethers.id("payload-2"),
        "",
        "building-A",
        "2026-03-17T12:00:00.000Z"
      ),
      /sensorId must not be empty/
    );
  });

  it("rejects empty buildingId", async () => {
    const factory = await ethers.getContractFactory("IntegrityRegistry");
    const contract = await factory.deploy();
    await contract.waitForDeployment();

    await assert.rejects(
      contract.registerEvidence(
        ethers.id("payload-3"),
        "temp-01",
        "",
        "2026-03-17T12:00:00.000Z"
      ),
      /buildingId must not be empty/
    );
  });

  it("rejects empty eventTimestamp", async () => {
    const factory = await ethers.getContractFactory("IntegrityRegistry");
    const contract = await factory.deploy();
    await contract.waitForDeployment();

    await assert.rejects(
      contract.registerEvidence(
        ethers.id("payload-4"),
        "temp-01",
        "building-A",
        ""
      ),
      /eventTimestamp must not be empty/
    );
  });
});
