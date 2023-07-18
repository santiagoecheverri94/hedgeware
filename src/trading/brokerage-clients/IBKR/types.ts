export interface TickleResponse {
  session: string;
  iserver: {
    authStatus: {
      authenticated: boolean
    }
  }
}

export interface SsoValidateResponse {
  RESULT: boolean;
}
