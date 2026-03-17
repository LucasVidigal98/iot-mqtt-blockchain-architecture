import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseAndValidateMessage } from "./message-validator.js";

describe("parseAndValidateMessage", () => {
  it("accepts valid temperature payload", () => {
    const result = parseAndValidateMessage(
      JSON.stringify({
        sensorId: "temp-01",
        buildingId: "building-A",
        type: "temperature",
        value: 23.5,
        timestamp: "2026-03-16T20:00:00.000Z"
      })
    );

    assert.equal(result.valid, true);
    assert.equal(result.payload?.type, "temperature");
    assert.equal(result.payload?.value, 23.5);
  });

  it("accepts valid lighting payload", () => {
    const result = parseAndValidateMessage(
      JSON.stringify({
        sensorId: "light-01",
        buildingId: "building-A",
        type: "lighting",
        value: "ON",
        timestamp: "2026-03-16T20:00:00.000Z"
      })
    );

    assert.equal(result.valid, true);
    assert.equal(result.payload?.type, "lighting");
    assert.equal(result.payload?.value, "ON");
  });

  it("rejects invalid payload", () => {
    const result = parseAndValidateMessage(
      JSON.stringify({
        sensorId: "light-01",
        buildingId: "building-A",
        type: "lighting",
        value: "INVALID",
        timestamp: "2026-03-16T20:00:00.000Z"
      })
    );

    assert.equal(result.valid, false);
    assert.match(result.error ?? "", /lighting sensors require ON\/OFF value/);
  });

  it("rejects invalid json", () => {
    const result = parseAndValidateMessage("{ invalid-json }");

    assert.equal(result.valid, false);
    assert.equal(result.error, "invalid_json");
  });
});
