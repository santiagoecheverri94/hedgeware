import {
    BrokerageClient,
    OrderDetails,
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
import {setSecurityPositionLongOrder} from '../instructions/set-security-position';

export class IBKRClient extends BrokerageClient {
    protected snapshotFields = {
        [SnapShotFields.bid]: 'BID',
        [SnapShotFields.ask]: 'ASK',
        // [SnapShotFields.last]: '31',
    };

    private account!: string;

    async getSnapshot(stock: string): Promise<Snapshot> {
        const fields = Object.values(this.snapshotFields);

        const response: SnapshotResponse = await ibkrApiReq(
            IbkrApiEndpoint.stockSnapshot,
            {
                ticker: stock,
            },
        );

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

    async placeMarketOrder(orderDetails: OrderDetails): Promise<number> {
        const response: OrdersResponse = await ibkrApiReq(
            IbkrApiEndpoint.placeOrder,
            orderDetails,
        );

        log(`Placed Order with id "${response.order_id}"`);
        console.log(orderDetails);
        return response.order_id;
    }

    async setSecurityPosition({
        brokerageIdOfSecurity,
        currentPosition,
        newPosition,
    }: {
        brokerageIdOfSecurity: string;
        currentPosition: number;
        newPosition: number;
    }): Promise<number> {
        return setSecurityPositionLongOrder({
            brokerageClient: this,
            brokerageIdOfSecurity,
            newPosition,
            currentPosition,
        });
    }
}
