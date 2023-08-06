import {ApisauceInstance} from 'apisauce';
import {BrokerageClient, OrderDetails, OrderSides, OrderTypes, SnapShotFields, Snapshot, TimesInForce} from '../brokerage-client';
import {getUncheckedIBKRApi} from './api';
import {initiateApiSessionWithTickling} from './tickle';
import {getNextRandomAskPrice} from '../../../utils/price-simulator';
import {AccountsResponse, IBKROrderDetails, OrdersResponse, SnapshotResponse} from './types';
import {getSnapshotFromResponse, isSnapshotResponseWithAllFields} from './snapshot';

export class IBKRClient extends BrokerageClient {
  protected orderTypes = {
    [OrderTypes.LIMIT]: 'LMT',
  };

  protected orderSides = {
    [OrderSides.buy]: 'BUY',
    [OrderSides.sell]: 'SELL',
  };

  protected timesInForce = {[TimesInForce.day]: 'DAY'};

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
    const fields = Object.values(this.snapshotFields);

    const response = (await (await this.getApi()).get<SnapshotResponse[]>('/iserver/marketdata/snapshot', {
      conids: conid,
      fields: Object.values(this.snapshotFields).join(','),
    }));
    const snapshotResponse = response.data![0];

    return {
      bid: 0,
      ask: getNextRandomAskPrice(),
      last: 0,
    };

    if (isSnapshotResponseWithAllFields(snapshotResponse, fields)) {
      return getSnapshotFromResponse(snapshotResponse, this.snapshotFields);
    }

    return this.getSnapshot(conid);
  }

  async placeOrder(orderDetails: OrderDetails): Promise<string> {
    console.log(orderDetails); debugger;
    const response = await (await this.getApi()).post<OrdersResponse>(`/iserver/account/${this.account}/orders`, {
      orders: [
        {
          ...this.getIBKROrderDetails(orderDetails),
          outsideRTH: false,
        },
      ],
    });

    if (response.data?.[0].order_id) {
      return response.data[0].order_id;
    }

    return this.confirmOrder(response.data?.[0].id!);
  }

  private getIBKROrderDetails(orderDetails: OrderDetails): IBKROrderDetails {
    return {
      tif: this.timesInForce[orderDetails.timeInForce],
      orderType: this.orderTypes[orderDetails.type],
      conidex: `${orderDetails.brokerageIdOfTheSecurity}@SMART`,
      price: orderDetails.price,
      side: this.orderSides[orderDetails.side],
      quantity: orderDetails.quantity,
      useAdaptive: false,
    };
  }

  private async confirmOrder(orderConfirmationId: string): Promise<string> {
    const response = await (await this.getApi()).post<OrdersResponse>(`/iserver/reply/${orderConfirmationId}`, {
      confirmed: true,
    });

    if (response.data?.[0].order_id) {
      return response.data[0].order_id;
    }

    return this.confirmOrder(response.data?.[0].id!);
  }

  async modifyOrder(orderId: string, orderDetails: OrderDetails): Promise<string> {
    console.log(orderDetails); debugger;
    const response = await (await this.getApi()).post<OrdersResponse>(`/iserver/account/${this.account}/order/${orderId}`, {
      ...this.getIBKROrderDetails(orderDetails),
    });

    debugger;
    if (response.data?.[0].order_id) {
      return response.data[0].order_id;
    }

    return this.confirmOrder(response.data?.[0].id!);
  }
}
