import {doFloatCalculation, FloatCalculations} from '../../../utils/float-calculator';
import {isHistoricalSnapshot, isHistoricalSnapshotsExhausted, restartSimulatedSnapshot} from '../../../utils/price-simulator';
import {OrderSides, Snapshot} from '../../brokerage-clients/brokerage-client';
import {getStockStates} from './start';
import {StockState} from './types';

export async function debugSimulation(stock: string, states: { [stock: string]: StockState; }, snapshot: Snapshot | null): Promise<{ stockState: StockState, shouldBreak: boolean }> {
  let shouldBreak = false;

  if (isHistoricalSnapshot()) {
    if (isHistoricalSnapshotsExhausted(stock)) {
      shouldBreak = true;
    }
  }

  if (snapshot) {
    states[stock] = await debugSimulatedPrices(snapshot, stock, states[stock]);
  }

  return {stockState: states[stock], shouldBreak};
}

const testSamples: {[stock: string]: {
  distance: number;
  upOrDown: 'up' | 'down';
  unrealizedValue: number;
}[]} = {};

async function debugSimulatedPrices(snapshot: Snapshot, stock: string, stockState: StockState): Promise<StockState> {
  const aboveTopSell = doFloatCalculation(FloatCalculations.add, stockState.intervals[0][OrderSides.SELL].price, stockState.spaceBetweenIntervals);
  if (doFloatCalculation(FloatCalculations.equal, snapshot.bid, stockState.upperCallStrikePrice || aboveTopSell)) {
    return debugUpperOrLowerBound(snapshot, 'up', stock, stockState);
  }

  const belowBottomBuy = doFloatCalculation(FloatCalculations.subtract, stockState.intervals[stockState.intervals.length - 1][OrderSides.BUY].price, stockState.spaceBetweenIntervals);
  if (doFloatCalculation(FloatCalculations.equal, snapshot.ask, stockState.lowerCallStrikePrice || belowBottomBuy)) {
    return debugUpperOrLowerBound(snapshot, 'down', stock, stockState);
  }

  return stockState;
}

async function debugUpperOrLowerBound(snapshot: Snapshot, upperOrLowerBound: 'up' | 'down', stock: string, stockState: StockState): Promise<StockState> {
  if (stockState.tradingLogs.length === 0) {
    restartSimulatedSnapshot();
    return (await getStockStates([stock]))[stock];
  }

  // console.log(`stock: ${stock}, bound: ${upperOrLowerBound}, ${bidOrAsk(upperOrLowerBound)}: ${snapshot[bidOrAsk(upperOrLowerBound)]}, position: ${stockState.position}, unrealizedValue: ${stockState.unrealizedValue}`);
  // syncWriteJSONFile(getStockStateFilePath(`results\\${stock}`), jsonPrettyPrint(stockState));
  if (upperOrLowerBound === 'up' && stockState.position < stockState.targetPosition) {
    debugger;
  } else if (upperOrLowerBound === 'down' && stockState.position > -stockState.targetPosition) {
    debugger;
  }

  const NUM_SAMPLES = 1000;

  if (!testSamples[stock]) {
    testSamples[stock] = [];
  }

  const samples = testSamples[stock];

  samples.push({
    upOrDown: upperOrLowerBound,
    distance: Math.abs(doFloatCalculation(FloatCalculations.subtract, stockState.tradingLogs[0].price, stockState.centralPrice)),
    unrealizedValue: stockState.unrealizedValue,
  });

  if (samples.length === NUM_SAMPLES) {
    const averageDistance = doFloatCalculation(FloatCalculations.divide, samples.reduce((sum, sample) => doFloatCalculation(FloatCalculations.add, sum, sample.distance), 0), samples.length);
    const averageUnrealizedValue = doFloatCalculation(FloatCalculations.divide, samples.reduce((sum, sample) => doFloatCalculation(FloatCalculations.add, sum, sample.unrealizedValue), 0), samples.length);
    // console.log(`maxDistance: ${Math.max(...samples.map(sample => sample.distance))}`);
    // console.log(`averageDistance: ${averageDistance}`);
    // console.log(`averageUnrealizedValue: ${averageUnrealizedValue}`);
    testSamples[stock] = [];
  }

  restartSimulatedSnapshot();
  return (await getStockStates([stock]))[stock];
}

function bidOrAsk(upperOrLowerBound: 'up' | 'down'): 'bid' | 'ask' {
  return upperOrLowerBound === 'up' ? 'bid' : 'ask';
}
