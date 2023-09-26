import {ApisauceInstance, create as createApiSauceInstance} from 'apisauce';
import {Agent as HttpsAgent} from 'node:https';
import {setTimeout} from 'node:timers/promises';

const syncApi = createApiSauceInstance({
  baseURL: 'https://localhost:5000/v1/api',
  headers: {Accept: 'application/json', 'Content-Type': 'application/json'},
  httpsAgent: new HttpsAgent({
    rejectUnauthorized: false,
  }),
});

export async function getUncheckedIBKRApi(): Promise<ApisauceInstance> {
  await ensureItsBeenPointTwoSecondsSinceApiWasLastRetrieved();
  return syncApi;
}

const POINT_TWO_SECONDS = 200;
let waiting: Promise<void> = Promise.resolve();
async function ensureItsBeenPointTwoSecondsSinceApiWasLastRetrieved(): Promise<void> {
  await waiting;
  waiting = setTimeout(POINT_TWO_SECONDS);
}
