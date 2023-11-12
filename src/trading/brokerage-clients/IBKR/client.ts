import {ApisauceInstance} from 'apisauce';
import {BrokerageClient, OrderDetails, OrderSides, OrderStatus, OrderTypes, SnapShotFields, Snapshot, TimesInForce} from '../brokerage-client';
import {getUncheckedIBKRApi} from './api';
import {initiateApiSessionWithTickling} from './tickle';
import {getSimulatedPrice, isLiveTrading} from '../../../utils/price-simulator';
import {AccountsResponse, CancelOrderResponse, IBKROrderDetails, OrderStatusResponse, OrdersResponse, PositionResponse, SnapshotResponse} from './types';
import {getSnapshotFromResponse, isSnapshotResponseWithAllFields} from './snapshot';
import {setTimeout} from 'node:timers/promises';
import {FloatCalculations, doFloatCalculation} from '../../../utils/float-calculator';
import {log} from '../../../utils/log';
import WebSocket from 'ws';
import {getWebSocket} from './websocket';

export class IBKRClient extends BrokerageClient {
  protected orderTypes = {
    [OrderTypes.LIMIT]: 'LMT',
  };

  protected orderSides = {
    [OrderSides.BUY]: 'BUY',
    [OrderSides.SELL]: 'SELL',
  };

  protected orderStatus = {
    [OrderStatus.FILLED]: 'Filled',
  };

  protected timesInForce = {[TimesInForce.DAY]: 'DAY'};

  protected snapshotFields = {
    [SnapShotFields.bid]: '84',
    [SnapShotFields.ask]: '86',
    // [SnapShotFields.last]: '31',
  };

  private sessionId!: string;
  private account!: string;

  protected async getApi(): Promise<ApisauceInstance> {
    if (!this.sessionId) {
      await this.initiateBrokerageApiConnection();
    }

    return getUncheckedIBKRApi();
  }

  protected async getSocket(): Promise<WebSocket> {
    if (!this.sessionId) {
      await this.initiateBrokerageApiConnection();
    }

    return await getWebSocket(this.sessionId);
  }

  protected async initiateBrokerageApiConnection(): Promise<void> {
    this.sessionId = await initiateApiSessionWithTickling();

    const accountsResponse = await (await this.getApi()).get<AccountsResponse>('/iserver/accounts');
    this.account = accountsResponse.data!.accounts[0];
  }

  async getSnapshot(conid: string): Promise<Snapshot> {
    if (!isLiveTrading()) {
      const simulatedPrice = getSimulatedPrice();

      return {
        ask: simulatedPrice,
        bid: doFloatCalculation(FloatCalculations.subtract, simulatedPrice, 0.01),
      };
    }

    const fields = Object.values(this.snapshotFields);

    const response = (await (await this.getApi()).get<SnapshotResponse[]>('/iserver/marketdata/snapshot', {
      conids: conid,
      fields: Object.values(this.snapshotFields).join(','),
    }));
    const snapshotResponse = response.data![0];

    if (isSnapshotResponseWithAllFields(snapshotResponse, fields)) {
      return getSnapshotFromResponse(snapshotResponse, this.snapshotFields);
    }

    return this.getSnapshot(conid);
  }

  async placeOrder(orderDetails: OrderDetails): Promise<string> {
    const response = await (await this.getApi()).post<OrdersResponse>(`/iserver/account/${this.account}/orders`, {
      orders: [
        {
          ...this.getIBKROrderDetails(orderDetails),
          outsideRTH: false,
        },
      ],
    });

    if (response.data?.[0]?.order_id) {
      log(`Placed Order with id "${response.data?.[0].order_id}"`);
      console.log(orderDetails);
      return response.data[0].order_id;
    }

    if (response.data?.[0]?.id) {
      log(`Order-Confirmation Id '${response.data?.[0].id}' will be used for confirmation.`);
      return this.confirmOrder(response.data?.[0].id, orderDetails);
    }

    if (response.status && response.status >= 400 && response.status < 500) {
      log('Failed due to our input. Debugger will be triggered.');
      debugger;
    }

    if (response.status && response.status >= 500 && response.status < 600) {
      log('Failed due to server error. Debugger will be triggered.');
      debugger;
    }

    log('Failed to place order. Will try again.');
    return this.placeOrder(orderDetails);
  }

  private getIBKROrderDetails(orderDetails: OrderDetails): IBKROrderDetails {
    return {
      tif: this.timesInForce[orderDetails.timeInForce],
      orderType: this.orderTypes[orderDetails.type],
      conidex: `${orderDetails.brokerageIdOfSecurity}@SMART`,
      price: orderDetails.price,
      side: this.orderSides[orderDetails.side],
      quantity: orderDetails.quantity,
      useAdaptive: false,
    };
  }

  private async confirmOrder(orderConfirmationId: string, orderDetails: OrderDetails): Promise<string> {
    const response = await (await this.getApi()).post<OrdersResponse>(`/iserver/reply/${orderConfirmationId}`, {
      confirmed: true,
    });

    if (response.data?.[0]?.order_id) {
      log(`Confirmed Order with id "${response.data?.[0].order_id}"`);
      console.log(orderDetails);
      return response.data[0].order_id;
    }

    if (response.data?.[0]?.id) {
      log(`Order-Confirmation Id '${response.data?.[0].id}' requires re-confirmation.`);
      return this.confirmOrder(response.data?.[0].id, orderDetails);
    }

    log('Failed to confirm order. Will try again in a second.');
    const ONE_SECOND = 1000;
    await setTimeout(ONE_SECOND);
    return this.confirmOrder(orderConfirmationId, orderDetails);
  }

  async modifyOrder(orderId: string, orderDetails: OrderDetails): Promise<string> {
    const response = await (await this.getApi()).post<OrdersResponse>(`/iserver/account/${this.account}/order/${orderId}`, {
      ...this.getIBKROrderDetails(orderDetails),
    });

    if (response.data?.[0]?.order_id) {
      log(`Modified Order with id "${response.data?.[0].order_id}"`);
      console.log(orderDetails);
      return response.data[0].order_id;
    }

    if (response.data?.[0]?.id) {
      log(`Modifiying order '${orderId}' requires confirmation.`);
      return this.confirmOrder(response.data?.[0].id, orderDetails);
    }

    log('Failed to modify order. Will try again in a second.');
    const ONE_SECOND = 1000;
    await setTimeout(ONE_SECOND);
    return this.modifyOrder(orderId, orderDetails);
  }

  async cancelOrder(orderId: string): Promise<void> {
    const response = await (await this.getApi()).delete<CancelOrderResponse>(`/iserver/account/${this.account}/order/${orderId}`);

    if (!response.data?.order_id) {
      log(`Failed to cancel order '${orderId}'. Will try again in a second.`);
      const ONE_SECOND = 1000;
      await setTimeout(ONE_SECOND);
      return this.cancelOrder(orderId);
    }
  }

  async getOrderStatus(orderId: string): Promise<OrderStatus> {
    const response = await (await this.getApi()).get<OrderStatusResponse>(`/iserver/account/order/status/${orderId}`);
    const ibkrStatus = response.data?.order_status;

    const genericStatus = Object.keys(this.orderStatus).find(status => this.orderStatus[status as OrderStatus] === ibkrStatus)! as OrderStatus;
    return genericStatus;
  }

  async getPositionSize(conid: string): Promise<number> {
    const FIVE_MINUTES = 5 * 60 * 1000;
    await setTimeout(FIVE_MINUTES); // TODO: check if beta ccp interface allows for faster polling

    const response = await (await this.getApi()).get<PositionResponse>(`/portfolio/${this.account}/position/${conid}`);

    if (response.data?.[0]?.position) {
      return response.data?.[0]?.position;
    }

    log(`Failed to get position size for conid '${conid}'. Will try again in a second.`);
    const ONE_SECOND = 1000;
    await setTimeout(ONE_SECOND);
    return this.getPositionSize(conid);
  }
}
