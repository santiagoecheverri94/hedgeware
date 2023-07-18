import WebSocket from 'ws';

let ws: WebSocket;

export function ibkrSubscribeToLastPriceUpdates(conids: number[]): void {
  console.log(conids);

  ws.addEventListener('message', ({data: bufferedData}) => {
    const dataString = bufferedData.toString();

    if (dataString.split('+')[0] === 'smd') {
      console.log('got streaming market data!');
    }
  });
}

export async function getWebSocket(sessionId: string): Promise<WebSocket> {
  if (ws) {
    return ws;
  }

  return new Promise<WebSocket>(resolve => {
    const ws = new WebSocket('wss://localhost:5000/v1/api/ws', {
      perMessageDeflate: false,
      rejectUnauthorized: false,
    });

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({
        session: sessionId,
      }));
    }, {once: true});

    ws.addEventListener('message', function resolveWhenWebsocketIsAuthenticated({data: bufferedData}) {
      const data = JSON.parse(bufferedData.toString());

      if (data.topic === 'sts' && data.args?.authenticated === true) {
        ws.removeEventListener('message', resolveWhenWebsocketIsAuthenticated);
        resolve(ws);
      }
    });
  });
}
