// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract IntegrityRegistry {
    struct Evidence {
        uint256 evidenceId;
        bytes32 hash;
        string sensorId;
        string buildingId;
        string eventTimestamp;
        uint256 blockTimestamp;
        address sender;
    }

    uint256 private _nextEvidenceId = 1;
    mapping(uint256 => Evidence) private _evidenceById;
    mapping(bytes32 => uint256[]) private _evidenceIdsByHash;

    event EvidenceRegistered(
        uint256 indexed evidenceId,
        bytes32 indexed hash,
        string sensorId,
        string buildingId,
        string eventTimestamp,
        uint256 blockTimestamp,
        address indexed sender
    );

    function registerEvidence(
        bytes32 hash,
        string calldata sensorId,
        string calldata buildingId,
        string calldata eventTimestamp
    ) external returns (uint256 evidenceId) {
        require(hash != bytes32(0), "hash must not be zero");
        require(bytes(sensorId).length > 0, "sensorId must not be empty");
        require(bytes(buildingId).length > 0, "buildingId must not be empty");
        require(bytes(eventTimestamp).length > 0, "eventTimestamp must not be empty");

        evidenceId = _nextEvidenceId++;

        Evidence memory evidence = Evidence({
            evidenceId: evidenceId,
            hash: hash,
            sensorId: sensorId,
            buildingId: buildingId,
            eventTimestamp: eventTimestamp,
            blockTimestamp: block.timestamp,
            sender: msg.sender
        });

        _evidenceById[evidenceId] = evidence;
        _evidenceIdsByHash[hash].push(evidenceId);

        emit EvidenceRegistered(
            evidenceId,
            hash,
            sensorId,
            buildingId,
            eventTimestamp,
            block.timestamp,
            msg.sender
        );
    }

    function getEvidenceById(uint256 evidenceId) external view returns (Evidence memory) {
        Evidence memory evidence = _evidenceById[evidenceId];
        require(evidence.evidenceId != 0, "evidence not found");
        return evidence;
    }

    function getEvidenceIdsByHash(bytes32 hash) external view returns (uint256[] memory) {
        return _evidenceIdsByHash[hash];
    }
}
