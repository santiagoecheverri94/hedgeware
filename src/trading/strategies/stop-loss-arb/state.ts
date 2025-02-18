import {
    getFileNamesWithinFolder,
    jsonPrettyPrint,
    readJSONFile,
    syncWriteJSONFile,
} from "../../../utils/file";
import { FloatCalculator as fc } from "../../../utils/float-calculator";
import { log } from "../../../utils/log";
import { isLiveTrading } from "../../../utils/price-simulator";
import { getCurrentTimeStamp } from "../../../utils/time";
import {
    BrokerageClient,
    OrderAction,
    Snapshot,
} from "../../brokerage-clients/brokerage-client";
import { StockState } from "./types";

export async function getStocksFileNames(filterUnderscores = true): Promise<string[]> {
    let fileNames = await getFileNamesWithinFolder(getStockStatesFolderPath());

    fileNames = fileNames.filter(
        (fileName) =>
            !["results", "templates", "historical"].some((excludedFileName) =>
                fileName.includes(excludedFileName)
            )
    );

    if (filterUnderscores) {
        fileNames = fileNames.filter((fileName) => !fileName.startsWith("_"));
    }

    return fileNames;
}

function getStockStatesFolderPath(): string {
    if (!isLiveTrading()) {
        return `${process.cwd()}\\src\\trading\\strategies\\stop-loss-arb\\stock-states\\simulated`;
    }

    return `${process.cwd()}\\src\\trading\\strategies\\stop-loss-arb\\stock-states`;
}

export async function getStockStates(
    stocks: string[]
): Promise<{ [stock: string]: StockState }> {
    const states: { [stock: string]: StockState } = {};
    for (const stock of stocks) {
        states[stock] = await readJSONFile<StockState>(getStockStateFilePath(stock));
    }

    return states;
}

export function getStockStateFilePath(stock: string): string {
    return `${getStockStatesFolderPath()}\\${stock}.json`;
}

export async function setNewPosition({
    stock,
    brokerageClient,
    stockState,
    newPosition,
    snapshot,
    orderSide,
}: {
    stock: string;
    brokerageClient: BrokerageClient;
    stockState: StockState;
    newPosition: number;
    snapshot: Snapshot;
    orderSide: OrderAction;
}): Promise<void> {
    if (isLiveTrading()) {
        await brokerageClient.setSecurityPosition({
            brokerageIdOfSecurity: stockState.brokerageId,
            currentPosition: stockState.position * stockState.numContracts,
            newPosition: newPosition * stockState.numContracts,
            snapshot,
        });
    }

    const previousPosition = stockState.position;
    stockState.position = newPosition;

    doSnapShotChangeUpdates(stock, stockState, snapshot);

    const tradingLog: (typeof stockState.tradingLogs)[number] = {
        action: orderSide,
        timeStamp: snapshot.timestamp || getCurrentTimeStamp(),
        price: orderSide === OrderAction.BUY ? snapshot.ask : snapshot.bid,
        previousPosition,
        newPosition,
        tradingCosts: stockState.tradingCosts,
    };
    stockState.tradingLogs.push(tradingLog);

    log(
        `Changed position for ${stock} (${
            stockState.numContracts
        } constracts): ${jsonPrettyPrint({
            price: tradingLog.price,
            previousPosition: tradingLog.previousPosition,
            newPosition: tradingLog.newPosition,
        })}`
    );
}

export function isSnapshotChange(snapshot: Snapshot, stockState: StockState): boolean {
    if (!stockState.lastAsk || !stockState.lastBid) {
        return true;
    }

    return (
        !fc.eq(stockState.lastAsk, snapshot.ask) ||
        !fc.eq(stockState.lastBid, snapshot.bid)
    );
}

export function doSnapShotChangeUpdates(
    stock: string,
    stockState: StockState,
    snapshot: Snapshot
): void {
    stockState.lastAsk = snapshot.ask;
    stockState.lastBid = snapshot.bid;

    if (isLiveTrading()) {
        syncWriteJSONFile(getStockStateFilePath(stock), jsonPrettyPrint(stockState));
    }
}

export function isWideBidAskSpread(
    { bid, ask }: Snapshot,
    stockState: StockState
): boolean {
    return fc.gt(fc.subtract(ask, bid), stockState.intervalProfit) === 1;
}
