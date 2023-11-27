import * as Comlink from 'comlink';
import nodeEndpoint from 'comlink/dist/umd/node-adapter';

// From https://github.com/GoogleChromeLabs/comlink/issues/313,
// Override comlink's default proxy handler to use Node endpoints
Comlink.transferHandlers.set('proxy', {
  canHandle: (obj: any) => obj && obj[Comlink.proxyMarker],
  serialize: (obj: any) => {
    const {port1, port2} = new MessageChannel() as any;
    Comlink.expose(obj, nodeEndpoint(port1));
    return [port2, [port2]];
  },
  deserialize: (port: any) => {
    port = nodeEndpoint(port);
    port.start();
    return Comlink.wrap(port);
  },
} as any);

export {Comlink, nodeEndpoint};
