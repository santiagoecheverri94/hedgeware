import {create as createApiSauceInstance} from 'apisauce';
import {Agent as HttpsAgent} from 'node:https';

export const ibkrApi = createApiSauceInstance({
  baseURL: 'https://localhost:8001',
  headers: {Accept: 'application/json', 'Content-Type': 'application/json'},
  httpsAgent: new HttpsAgent({
    rejectUnauthorized: false,
  }),
});
