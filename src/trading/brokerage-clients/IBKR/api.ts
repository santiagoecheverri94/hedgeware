import {ApisauceInstance, create as createApiSauceInstance} from 'apisauce';
import {Agent as HttpsAgent} from 'node:https';

const syncApi = createApiSauceInstance({
  baseURL: 'https://localhost:5000/v1/api',
  headers: {Accept: 'application/json', 'Content-Type': 'application/json'},
  httpsAgent: new HttpsAgent({
    rejectUnauthorized: false,
  }),
});

export async function getUncheckedIBKRApi(): Promise<ApisauceInstance> {
  await ensureItsBeenOnePointTwoSecondsSinceApiWasLastRetrieved();
  return syncApi;
}

const ONE_POINT_TWO_SECONDS = 1_200;
let waiting: Promise<void> = Promise.resolve();
async function ensureItsBeenOnePointTwoSecondsSinceApiWasLastRetrieved(): Promise<void> {
  await waiting;
  waiting = new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, ONE_POINT_TWO_SECONDS);
  });
}
