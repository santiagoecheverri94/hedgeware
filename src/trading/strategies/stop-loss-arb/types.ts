import {OrderAction, Snapshot} from '../../brokerage-clients/brokerage-client';

export interface SmoothingInterval {
    type: IntervalType;
    positionLimit: number;
    [OrderAction.SELL]: {
        active: boolean;
        crossed: boolean;
        price: number;
        boughtAtPrice?: number;
    };
    [OrderAction.BUY]: {
        active: boolean;
        crossed: boolean;
        price: number;
        soldAtPrice?: number;
    };
}

export enum IntervalType {
    LONG = 'LONG',
    SHORT = 'SHORT',
}

export interface StockState {
    date: string;
    isStaticIntervals: boolean;
    brokerageId: string;
    brokerageTradingCostPerShare: number;
    sharesPerInterval: number;
    intervalProfit: number;
    initialPrice: number;
    shiftIntervalsFromInitialPrice: number;
    spaceBetweenIntervals: number;
    numContracts: number;
    position: number;
    targetPosition: number;
    realizedPnL: number;
    exitPnL: number;
    exitPnLAsPercentage: number;
    maxMovingProfitAsPercentage: number;
    maxMovingLossAsPercentage: number;
    lastAsk: number;
    lastBid: number;
    intervals: SmoothingInterval[];
    tradingLogs: {
        timeStamp: string;
        action: OrderAction;
        price: number;
        previousPosition: number;
        newPosition: number;
    }[];
    historicalSnapshots?: {
            data: Snapshot[];
            index: number;
        };
}
