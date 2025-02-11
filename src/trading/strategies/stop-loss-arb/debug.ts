import {FloatCalculator as fc} from '../../../utils/float-calculator';
import {
    isHistoricalSnapshot,
    isHistoricalSnapshotsExhausted,
    restartSimulatedSnapshot,
} from '../../../utils/price-simulator';
import {OrderAction, Snapshot} from '../../brokerage-clients/brokerage-client';
import {StockState} from './types';

export async function debugSimulation(
    stock: string,
    states: { [stock: string]: StockState },
    originalStates: { [stock: string]: StockState },
    snapshot: Snapshot,
): Promise<{ stockState: StockState; shouldBreak: boolean }> {
    let shouldBreak = false;

    if (isHistoricalSnapshot()) {
        if (isHistoricalSnapshotsExhausted(stock)) {
            shouldBreak = true;
        }
    }

    if (snapshot) {
        states[stock] = await debugSimulatedPrices(snapshot, stock, states, originalStates);
    }

    return {stockState: states[stock], shouldBreak};
}

async function debugSimulatedPrices(
    snapshot: Snapshot,
    stock: string,
    states: { [stock: string]: StockState },
    originalStates: { [stock: string]: StockState },
): Promise<StockState> {
    const stockState = states[stock];

    const aboveTopSell = fc.add(
        stockState.intervals[0][OrderAction.SELL].price,
        stockState.spaceBetweenIntervals,
    );
    if (fc.gte(snapshot.bid, aboveTopSell)) {
        return debugUpperOrLowerBound('up', stock, states, originalStates);
    }

    const belowBottomBuy = fc.subtract(
        stockState.intervals[stockState.intervals.length - 1][OrderAction.BUY].price,
        stockState.spaceBetweenIntervals,
    );
    if (fc.lte(snapshot.ask, belowBottomBuy)) {
        return debugUpperOrLowerBound('down', stock, states, originalStates);
    }

    return stockState;
}

async function debugUpperOrLowerBound(
    upperOrLowerBound: 'up' | 'down',
    stock: string,
    states: { [stock: string]: StockState },
    originalStates: { [stock: string]: StockState },
): Promise<StockState> {
    if (states[stock].tradingLogs.length === 0) {
        restartSimulatedSnapshot();
        states[stock] = originalStates[stock];
        return states[stock];
    }

    if (upperOrLowerBound === 'up' && // ) {
        states[stock].position < (states[stock].targetPosition - states[stock].sharesPerInterval)) {
        debugger;
    } else if (upperOrLowerBound === 'down' && // ) {
        states[stock].position > -(states[stock].targetPosition - states[stock].sharesPerInterval)) {
        debugger;
    }

    restartSimulatedSnapshot();
    states[stock] = structuredClone(originalStates[stock]);

    return states[stock];
}
