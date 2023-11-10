import {Snapshot} from '../brokerage-client';
import {IBKRClient} from './client';
import WebSocket from 'ws';

export async function getHistoricalQuotes({
  brokerageClient,
  brokerageIdOfSecurity,
  period,
  barSize,
}: {
  brokerageClient: IBKRClient,
  brokerageIdOfSecurity: string,
  period: string,
  barSize: string,
}): Promise<Snapshot[]> {
  const socket = await brokerageClient.getSocket();

  return subscribeToHistoricalQuotes({
    ws: socket,
    conid: brokerageIdOfSecurity,
    period,
    barSize,
  });
}

async function subscribeToHistoricalQuotes({
  ws,
  conid,
  period,
  barSize,
}: {
  ws: WebSocket,
  conid: string,
  period: string,
  barSize: string,
}): Promise<Snapshot[]> {
  const historicalQuotesSubscriptionMessage = `smh+${conid}+${JSON.stringify({
    period: '100d',
    bar: '1min',
    outsideRth: false,
    source: 'bid',
    format: '%l',
  })}`;

  return new Promise(resolve => {
    ws.addEventListener('message', function resolveWhenAllHistoricalDataIsObtained({data: bufferedData}) {
      const data = JSON.parse(bufferedData.toString());

      if (data.topic === `smh+${conid}`) {
        console.log(data);

        // ws.send(`umh+${data.serverId}`);

        debugger;

        // ws.removeEventListener('message', resolveWhenAllHistoricalDataIsObtained);
        // resolve([]);
      }
    });

    ws.send(`umh+12124`);
    // ws.send(historicalQuotesSubscriptionMessage);
  });
}
