import {ApisauceInstance} from 'apisauce';
import {BrokerageClient, OrderDetails, OrderSides, OrderTypes, SnapShotFields, Snapshot, TimesInForce} from '../brokerage-client';
import {getUncheckedIBKRApi} from './api';
import {initiateApiSessionWithTickling} from './tickle';
import {getManualPrice, getRandomPrice} from '../../../utils/price-simulator';
import {AccountsResponse, CancelOrderResponse, IBKROrderDetails, OrdersResponse, PositionResponse, SnapshotResponse} from './types';
import {getSnapshotFromResponse, isSnapshotResponseWithAllFields} from './snapshot';
import {log} from '../../../utils/miscellaneous';

export class IBKRClient extends BrokerageClient {
  protected orderTypes = {
    [OrderTypes.LIMIT]: 'LMT',
  };

  protected orderSides = {
    [OrderSides.BUY]: 'BUY',
    [OrderSides.SELL]: 'SELL',
  };

  protected timesInForce = {[TimesInForce.DAY]: 'DAY'};

  protected snapshotFields = {
    [SnapShotFields.bid]: '84',
    [SnapShotFields.ask]: '86',
    [SnapShotFields.last]: '31',
  };

  private sessionId!: string;
  private account!: string;

  protected async getApi(): Promise<ApisauceInstance> {
    if (!this.sessionId) {
      await this.initiateBrokerageApiConnection();
    }

    return getUncheckedIBKRApi();
  }

  protected async initiateBrokerageApiConnection(): Promise<void> {
    this.sessionId = await initiateApiSessionWithTickling();

    const accountsResponse = await (await this.getApi()).get<AccountsResponse>('/iserver/accounts');
    this.account = accountsResponse.data!.accounts[0];
  }

  async getSnapshot(conid: string): Promise<Snapshot> {
    if ((process.env as any).SIMULATE_SNAPSHOT) {
      return {
        bid: getRandomPrice(),
        ask: getRandomPrice(),
        last: getRandomPrice(),
        // last: getManualPrice(),
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

    if (response.data?.[0].order_id) {
      log(`Placed Order with id "${response.data?.[0].order_id}"`);
      console.log(orderDetails);
      return response.data[0].order_id;
    }

    log(`Order-Confirmation Id '${response.data?.[0].id!}' will be used for confirmation.`);
    return this.confirmOrder(response.data?.[0].id!, orderDetails);
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

    log(`Order-Confirmation Id '${orderConfirmationId}' requires re-confirmation.`);
    return this.confirmOrder(response.data?.[0]?.id!, orderDetails);
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

    log(`Modifiying order '${orderId}' requires confirmation.`);
    return this.confirmOrder(response.data?.[0]?.id!, orderDetails);
  }

  async cancelOrder(orderId: string): Promise<void> {
    const response = await (await this.getApi()).delete<CancelOrderResponse>(`/iserver/account/${this.account}/order/${orderId}`);

    if (!response.data?.order_id) {
      log(`Failed to cancel order '${orderId}'. Will try again`);
      return this.cancelOrder(orderId);
    }
  }

  async getPositionSize(conid: string): Promise<number> {
    const response = await (await this.getApi()).get<PositionResponse>(`/portfolio/${this.account}/position/${conid}`);

    return response.data?.[0]?.position! || 0;
  }
}
