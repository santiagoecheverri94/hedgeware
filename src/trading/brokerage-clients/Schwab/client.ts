import {FloatCalculator as fc} from '../../../utils/float-calculator';
import {BrokerageClient, OrderDetails, Snapshot} from '../brokerage-client';
import {setSecurityPositionMultiStyleOrders} from '../instructions/set-security-position';
import {getAccessToken} from './auth';
import {setTimeout} from 'node:timers/promises';

enum Endpoints {
    quotes = 'marketdata/v1/quotes',
    accounts = 'trader/v1/accounts',
}

export class SchwabClient extends BrokerageClient {
    private accountNumber = '';
    private baseUrl = 'https://api.schwabapi.com';
    private accessToken = '';

    private constructor() {
        super();
    }

    static async getInstance(): Promise<SchwabClient> {
        const instance = new SchwabClient();
        await instance.authenticate();
        await instance.setAccountId();

        return instance;
    }

    async authenticate(): Promise<void> {
        this.accessToken = await getAccessToken();

        // 20 minutes
        setTimeout(20 * 60 * 1e3).then(() => {
            this.authenticate();
        });
    }

    private async setAccountId(): Promise<void> {
        const response = await this.doGetRequest(
            `${Endpoints.accounts}/accountNumbers`,
            {},
        );
        const accountId = response[0].hashValue;
        this.accountNumber = accountId;
    }

    async getSnapshot(stock: string): Promise<Snapshot> {
        const ticker = stock.replace('.', '/');

        const response: any[] = await this.doGetRequest(
            `marketdata/v1/${stock}/quotes`,
            {
                fields: 'quote',
            },
        );

        const quote = Object.values(response)[0].quote;

        const snapshot: Snapshot = {
            ask: quote.askPrice,
            bid: quote.bidPrice,
            timestamp: '',
        };

        return snapshot;
    }

    async getSnapshots(stocks: string[]): Promise<Record<string, Snapshot>> {
        const tickers = stocks.map(stock => stock.replace('.', '/'));
        const symbols = tickers.join(',');

        const response: any[] = await this.doGetRequest(Endpoints.quotes, {
            symbols,
            fields: 'quote',
            indicative: false,
        });

        const snapshots: Record<string, Snapshot> = {};

        for (const item of Object.values(response)) {
            const symbol = item.symbol.replace('/', '.');

            const snapshot: Snapshot = {
                ask: item.quote.askPrice,
                bid: item.quote.bidPrice,
                timestamp: '',
            };

            snapshots[symbol] = snapshot;
        }

        return snapshots;
    }

    async getShortableQuantities(stocks: string[]): Promise<Record<string, number>> {
        const tickers = stocks.map(stock => stock.replace('.', '/'));
        const symbols = tickers.join(',');

        const response: any[] = await this.doGetRequest(Endpoints.quotes, {
            symbols,
            fields: 'reference',
            indicative: false,
        });

        const quantities: Record<string, number> = {};

        for (const item of Object.values(response)) {
            const symbol = item.symbol.replace('/', '.');

            let quantity = 0;
            if (item.reference.isShortable) {
                quantity = item.reference.isHardToBorrow ?
                    item.reference.htbQuantity :
                    2 * 1e6;
            }

            quantities[symbol] = quantity;
        }

        return quantities;
    }

    async placeMarketOrder(orderDetails: OrderDetails): Promise<number> {
        const schwabOrderDetails = this.getSchwabOrderDetails(orderDetails);

        const orderStatusUrl = await this.doPostRequest(
            `${Endpoints.accounts}/${this.accountNumber}/orders`,
            schwabOrderDetails,
        );

        const orderId = orderStatusUrl.split('/').pop() as string;

        await setTimeout(5 * 1e3);

        const orderStatus = await this.doGetRequest(
            `${Endpoints.accounts}/${this.accountNumber}/orders/${orderId}`,
            {},
        );

        if (orderStatus.status !== 'FILLED') {
            debugger;
            throw new Error('Market Order not filled within 5 seconds.');
        }

        let quantityValue = 0;
        let quantityAccounted = 0;

        for (const actvity of orderStatus.orderActivityCollection) {
            for (const execution of actvity.executionLegs) {
                quantityAccounted += execution.quantity;
                quantityValue = fc.add(
                    quantityValue,
                    fc.multiply(execution.quantity, execution.price),
                );
            }
        }

        if (quantityAccounted !== orderDetails.quantity) {
            debugger;
            throw new Error('Order not executed on expected quantity.');
        }

        const pricePerShare = fc.divide(quantityValue, quantityAccounted);

        return pricePerShare;
    }

    private getSchwabOrderDetails(orderDetails: OrderDetails) {
        return {
            orderType: 'MARKET',
            // orderType: 'LIMIT',
            // price: orderDetails.action.includes('BUY') ? 575 : 555,
            session: 'NORMAL',
            // session: 'PM',
            duration: 'DAY',
            orderStrategyType: 'SINGLE',
            orderLegCollection: [
                {
                    instruction: orderDetails.action,
                    quantity: orderDetails.quantity,
                    instrument: {
                        symbol: orderDetails.brokerageIdOfSecurity,
                        // symbol: 'SPY',
                        assetType: 'EQUITY',
                    },
                },
            ],
        };
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
        return setSecurityPositionMultiStyleOrders({
            brokerageClient: this,
            brokerageIdOfSecurity,
            newPosition,
            currentPosition,
        });
    }

    private async doGetRequest(path: string, params: any) {
        const urlParams =
            Object.values(params).length > 0 ?
                `?${new URLSearchParams(params).toString()}` :
                '';
        const requestUrl = `${this.baseUrl}/${path}${urlParams}`;

        const data = await fetch(requestUrl, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
            },
        });

        const response = await data.json();

        if (data.status !== 200) {
            debugger;
            throw new Error(response.detail);
        }

        return response;
    }

    private async doPostRequest(path: string, body: any) {
        const requestUrl = `${this.baseUrl}/${path}`;

        const data = await fetch(requestUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (data.status > 299 || data.status < 200) {
            debugger;
            throw new Error(data.statusText);
        }

        const response = data.headers.get('location');

        if (!response) {
            debugger;
            throw new Error('No location header in response');
        }

        return response;
    }
}
