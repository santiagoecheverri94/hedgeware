import {
    BrokerageClient,
    OrderDetails,
    OrderAction,
    OrderStatus,
    SnapShotFields,
    Snapshot,
} from '../brokerage-client';
import {IbkrApiEndpoint, ibkrApiReq} from './api';
import {
    OrderStatusResponse,
    OrdersResponse,
    PositionResponse,
    SnapshotResponse,
} from './types';
import {getSnapshotFromResponse, isSnapshotResponseWithAllFields} from './snapshot';
import {setTimeout} from 'node:timers/promises';
import {log} from '../../../utils/log';

export class IBKRClient extends BrokerageClient {
    protected snapshotFields = {
        [SnapShotFields.bid]: 'BID',
        [SnapShotFields.ask]: 'ASK',
        // [SnapShotFields.last]: '31',
    };

    private account!: string;

    async getSnapshot(stock: string): Promise<Snapshot> {
        const fields = Object.values(this.snapshotFields);

        const response: SnapshotResponse = await ibkrApiReq(IbkrApiEndpoint.stockSnapshot, {
            ticker: stock,
        });

        if (response && isSnapshotResponseWithAllFields(response, fields)) {
            return getSnapshotFromResponse(response, this.snapshotFields);
        }

        log('Failed to obtain snapshot. Will try agagin. Debugger will be triggered.');
        debugger;
        return this.getSnapshot(stock);
    }

    async getSnapshots(stocks: string[]): Promise<Record<string, Snapshot>> {
        return {};
    }

    async getShortableQuantities(stocks: string[]): Promise<Record<string, number>> {
        return {};
    }

    async placeOrder(orderDetails: OrderDetails): Promise<number> {
        const response: OrdersResponse = await ibkrApiReq(IbkrApiEndpoint.placeOrder, orderDetails);

        log(`Placed Order with id "${response.order_id}"`);
        console.log(orderDetails);
        return response.order_id;
    }

    async modifyOrder(orderId: string, orderDetails: OrderDetails): Promise<number> {
        return 1;

        // const response = await ibkrApi.post<OrdersResponse>(
        //     `/iserver/account/${this.account}/order/${orderId}`,
        //     {
        //         ...this.getIBKROrderDetails(orderDetails),
        //     }
        // );

        // if (response.data?.[0]?.order_id) {
        //     log(`Modified Order with id "${response.data?.[0].order_id}"`);
        //     console.log(orderDetails);
        //     return response.data[0].order_id;
        // }

        // if (response.data?.[0]?.id) {
        //     log(`Modifiying order '${orderId}' requires confirmation.`);
        //     return this.confirmOrder(response.data?.[0].id, orderDetails);
        // }

        // log("Failed to modify order. Will try again in a second.");
        // const ONE_SECOND = 1000;
        // await setTimeout(ONE_SECOND);
        // return this.modifyOrder(orderId, orderDetails);
    }

    async getOrderStatus(orderId: number): Promise<OrderStatus> {
        const response: OrderStatusResponse = await ibkrApiReq(IbkrApiEndpoint.orderStatus, {
            order_id: orderId,
        });

        return response.status as OrderStatus;
    }

    async getPositionSize(conid: string): Promise<number> {
        return 0;
        // const FIVE_MINUTES = 5 * 60 * 1000;
        // await setTimeout(FIVE_MINUTES); // TODO: check if beta ccp interface allows for faster polling

        // const response = await ibkrApi.get<PositionResponse>(
        //     `/portfolio/${this.account}/position/${conid}`
        // );

        // if (response.data?.[0]?.position) {
        //     return response.data?.[0]?.position;
        // }

        // log(
        //     `Failed to get position size for conid '${conid}'. Will try again in a second.`
        // );
        // const ONE_SECOND = 1000;
        // await setTimeout(ONE_SECOND);
        // return this.getPositionSize(conid);
    }
}
