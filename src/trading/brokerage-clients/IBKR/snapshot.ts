import {SnapShotFields, Snapshot} from '../brokerage-client';
import {SnapshotResponse} from './types';

export function isSnapshotResponseWithAllFields(snapshotResponse: SnapshotResponse, fields: string[]): boolean {
  for (const field of fields) {
    if (!snapshotResponse[field]) {
      return false;
    }
  }

  return true;
}

export function getSnapshotFromResponse(snapshotResponse: SnapshotResponse, ibkrSnapshotFields: {[field in SnapShotFields]: string}): Snapshot {
  const snapshot = {} as Snapshot;

  for (const field of Object.values(SnapShotFields)) {
    snapshot[field] = Number.parseFloat(snapshotResponse[ibkrSnapshotFields[field]]);
  }

  return snapshot;
}
