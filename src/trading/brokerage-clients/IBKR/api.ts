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
  await ensureItsBeenAFifthOfASecondSinceApiWasLastRetrieved();
  return syncApi;
}

const FIFTH_OF_A_SECOND = 5000;
let waitForAFifthOfASecondToGetApi: Promise<void> = Promise.resolve();

async function ensureItsBeenAFifthOfASecondSinceApiWasLastRetrieved(): Promise<void> {
  await waitForAFifthOfASecondToGetApi;
  waitForAFifthOfASecondToGetApi = new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, FIFTH_OF_A_SECOND);
  });
}
