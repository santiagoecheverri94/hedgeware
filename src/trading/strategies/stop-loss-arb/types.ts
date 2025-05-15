import {OrderAction, Snapshot} from '../../brokerage-clients/brokerage-client';

export interface SmoothingInterval {
    type: IntervalType;
    positionLimit: number;
    [OrderAction.SELL]: {
        active: boolean;
        crossed: boolean;
        price: number;
    };
    [OrderAction.BUY]: {
        active: boolean;
        crossed: boolean;
        price: number;
    };
}

export enum IntervalType {
    LONG = 'LONG',
    SHORT = 'SHORT',
}

export interface StockState {
    date: string;
    prediction?: number;
    profitThreshold?: number;
    lossThreshold?: number;
    isStaticIntervals: boolean;
    brokerageId: string;
    brokerageTradingCostPerShare: number;
    sharesPerInterval: number;
    intervalProfit: number;
    initialPrice: number;
    spaceBetweenIntervals: number;
    numContracts: number;
    position: number;
    targetPosition: number;
    netPositionValue: number;
    realizedPnLAsPercentage: number;
    exitPnLAsPercentage: number;
    maxMovingProfitAsPercentage: number;
    maxMovingLossAsPercentage: number;
    // bool reached_1_percentage_profit;
    // Decimal max_loss_when_reached_1_percentage_profit;
    // bool reached_0_75_percentage_profit;
    // Decimal max_loss_when_reached_0_75_percentage_profit;
    // bool reached_0_5_percentage_profit;
    // Decimal max_loss_when_reached_0_5_percentage_profit;
    // bool reached_0_25_percentage_profit;
    // Decimal max_loss_when_reached_0_25_percentage_profit;
    lastAsk: number;
    lastBid: number;
    intervals: SmoothingInterval[];
    tradingLogs: {
        timeStamp: string;
        action: OrderAction;
        quotedPrice: number;
        realizedPrice: number;
        previousPosition: number;
        newPosition: number;
    }[];
    historicalSnapshots?: {
        data: Snapshot[];
        index: number;
    };
}
