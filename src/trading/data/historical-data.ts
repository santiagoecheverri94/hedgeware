import {IBKRClient} from '../brokerage-clients/IBKR/client';
import {getHistoricalQuotes} from '../brokerage-clients/IBKR/historical-data';

export async function saveHistoricalData(ibkrConid: string, startDate: string, endDate: string): Promise<void> {
  const historicalData = await getHistoricalQuotes({
    brokerageClient: new IBKRClient(),
    brokerageIdOfSecurity: ibkrConid,
    period: '',
    barSize: '',
  });
}
