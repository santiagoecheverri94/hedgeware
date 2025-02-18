import {OrderAction} from '../../brokerage-clients/brokerage-client';

export interface SmoothingInterval {
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

export interface StockState {
    isStaticIntervals?: boolean;
    brokerageId: string;
    brokerageTradingCostPerShare: number;
    sharesPerInterval: number;
    intervalProfit: number;
    callStrikePrice: number;
    initialPrice: number;
    putStrikePrice: number;
    spaceBetweenIntervals: number;
    numContracts: number;
    position: number;
    targetPosition: number;
    intervals: SmoothingInterval[];
    tradingLogs: {
        timeStamp: string;
        action: OrderAction;
        price: number;
        previousPosition: number;
        newPosition: number;
        tradingCosts: number;
    }[];
    tradingCosts: number;
    lastAsk?: number;
    lastBid?: number;
}
