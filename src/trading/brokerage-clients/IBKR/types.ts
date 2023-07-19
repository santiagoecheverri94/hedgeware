export interface TickleResponse {
  session: string;
  iserver: {
    authStatus: {
      authenticated: boolean
    }
  }
}

export interface SnapshotResponse {

}

export interface SsoValidateResponse {
  RESULT: boolean;
}
