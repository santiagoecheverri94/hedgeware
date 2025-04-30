import {OrderAction} from '../../brokerage-clients/brokerage-client';

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

export interface ProfitTracker {
    isReached: boolean;
    percentageProfitWhenReached: number;
    percentageLossWhenReached: number;
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
    track1PercentageProfit: ProfitTracker;
    track075PercentageProfit: ProfitTracker;
    track05PercentageProfit: ProfitTracker;
    track025PercentageProfit: ProfitTracker;
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
}
