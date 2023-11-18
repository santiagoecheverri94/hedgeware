import { OrderSides } from "../../brokerage-clients/brokerage-client";

export enum IntervalTypes {
  LONG = 'LONG',
  SHORT = 'SHORT',
}

export interface SmoothingInterval {
  type: IntervalTypes;
  positionLimit: number;
  [OrderSides.SELL]: {
    active: boolean;
    crossed: boolean;
    price: number;
  };
  [OrderSides.BUY]: {
    active: boolean;
    crossed: boolean;
    price: number;
  };
}

export interface StockState {
  brokerageId: string;
  brokerageTradingCostPerShare: number;
  sharesPerInterval: number,
  intervalProfit: number;
  premiumSold: number | null;
  callStrikePrice: number | null;
  initialPrice: number;
  putStrikePrice: number | null;
  spaceBetweenIntervals: number;
  numContracts: number;
  position: number;
  targetPosition: number;
  isDynamicIntervals: boolean;
  intervals: SmoothingInterval[];
  tradingLogs: {
    timeStamp: string;
    action: OrderSides,
    price: number;
    previousPosition: number;
    newPosition: number;
  }[];
  transitoryValue: number;
  unrealizedValue: number;
  lastAsk?: number;
  lastBid?: number;
}
