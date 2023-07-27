import { SnapShotFields, Snapshot } from "../brokerage-client";
import { SnapshotResponse } from "./types";

export function isSnapshotResponseWithAllFields(snapshotResponse: SnapshotResponse, fields: string[]) {
  for (const field of fields) {
    if (!snapshotResponse[field]) {
      return false;
    }
  }

  return true;
}

export function getSnapshotFromResponse(snapshotResponse: SnapshotResponse, ibkrSnapshotFields: {[field in SnapShotFields]: string}): Snapshot {
  return Object.values(SnapShotFields).reduce((snapshot, field) => {
    snapshot[field] = Number.parseFloat(snapshotResponse[ibkrSnapshotFields[field]]);
    return snapshot;
  }, {} as Snapshot)
}