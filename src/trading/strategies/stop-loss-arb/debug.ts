import {FloatCalculator as fc} from '../../../utils/float-calculator';
import {
    isHistoricalSnapshot,
    isHistoricalSnapshotsExhausted,
    isRandomSnapshot,
    restartRandomPrice,
} from '../../../utils/price-simulator';
import {OrderAction, Snapshot} from '../../brokerage-clients/brokerage-client';
import {StockState} from './types';

export function printPnLValues(stock: string, stockState: StockState): void {
    console.log(`stock: ${stock}`);
    console.log(`realizedPnL: ${stockState.realizedPnL}`);
    console.log(`exitPnL: ${stockState.exitPnL}`);
    console.log(`exitPnLAsPercentage: ${stockState.exitPnLAsPercentage}`);
    console.log(`maxMovingProfitAsPercentage: ${stockState.maxMovingProfitAsPercentage}`);
    console.log(`maxMovingLossAsPercentage: ${stockState.maxMovingLossAsPercentage}`);
    console.log('');
}

export async function debugRandomPrices(
    snapshot: Snapshot,
    stock: string,
    states: { [stock: string]: StockState },
    originalStates: { [stock: string]: StockState },
): Promise<void> {
    const stockState = states[stock];

    const aboveTopSell = fc.add(
        stockState.intervals[0][OrderAction.SELL].price,
        stockState.spaceBetweenIntervals,
    );
    if (fc.gte(snapshot.bid, aboveTopSell)) {
        debugUpperOrLowerBound('up', stock, states, originalStates);
        return;
    }

    const belowBottomBuy = fc.subtract(
        stockState.intervals[stockState.intervals.length - 1][OrderAction.BUY].price,
        stockState.spaceBetweenIntervals,
    );
    if (fc.lte(snapshot.ask, belowBottomBuy)) {
        debugUpperOrLowerBound('down', stock, states, originalStates);
    }
}

async function debugUpperOrLowerBound(
    upperOrLowerBound: 'up' | 'down',
    stock: string,
    states: { [stock: string]: StockState },
    originalStates: { [stock: string]: StockState },
): Promise<void> {
    if (states[stock].tradingLogs.length === 0) {
        restartRandomPrice();
        states[stock] = originalStates[stock];
        return;
    }

    if (
        upperOrLowerBound === 'up' &&
        states[stock].position < states[stock].targetPosition
    ) {
        debugger;
    } else if (
        upperOrLowerBound === 'down' &&
        states[stock].position > -states[stock].targetPosition
    ) {
        debugger;
    }

    restartRandomPrice();
    states[stock] = structuredClone(originalStates[stock]);
}
