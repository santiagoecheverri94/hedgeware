export interface TickleResponse {
  session: string;
  iserver: {
    authStatus: {
      authenticated: boolean
    }
  }
}

export type SnapshotResponse = {
  [field: string]: string;
}

export interface SsoValidateResponse {
  RESULT: boolean;
}
