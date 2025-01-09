import {OrderSides} from '../../brokerage-clients/brokerage-client';

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
  premiumSold: number;
  upperCallStrikePrice?: number | null; // TODO: consider making this more elegant
  initialPrice: number;
  lowerCallStrikePrice: number | null;
  spaceBetweenIntervals: number;
  numContracts: number;
  position: number;
  targetPosition: number;
  intervals: SmoothingInterval[];
  tradingLogs: {
    timeStamp: string;
    action: OrderSides,
    price: number;
    previousPosition: number;
    newPosition: number;
    transitoryValue: number;
    unrealizedValue?: number; // TODO: consider making this more elegant
  }[];
  transitoryValue: number;
  unrealizedValue?: number; // TODO: consider making this more elegant
  lastAsk?: number;
  lastBid?: number;
}
