import {ApisauceInstance, create as createApiSauceInstance} from 'apisauce';
import {Agent as HttpsAgent} from 'node:https';
import { doThrottling, getNewThrottle } from '../../../utils/miscellaneous';

const syncApi = createApiSauceInstance({
  baseURL: 'https://localhost:5000/v1/api',
  headers: {Accept: 'application/json', 'Content-Type': 'application/json'},
  httpsAgent: new HttpsAgent({
    rejectUnauthorized: false,
  }),
});

const MAX_REQUESTS_PER_SECOND = 5;
const apiThrottle = getNewThrottle();
const ONE_SECOND = 1000;
const TIME_TO_WAIT_BETWEEN_REQUESTS = ONE_SECOND / MAX_REQUESTS_PER_SECOND;

export async function getUncheckedIBKRApi(): Promise<ApisauceInstance> {
  await doThrottling(apiThrottle, TIME_TO_WAIT_BETWEEN_REQUESTS);
  return syncApi;
}
