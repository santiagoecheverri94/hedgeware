import { syncWriteJSONFile, jsonPrettyPrint } from "../../../utils/file";
import {
    isLiveTrading,
    isHistoricalSnapshot,
    isHistoricalSnapshotsExhausted,
} from "../../../utils/price-simulator";
import { onUserInterrupt } from "../../../utils/system";
import { isMarketOpen } from "../../../utils/time";
import { IBKRClient } from "../../brokerage-clients/IBKR/client";
import { BrokerageClient } from "../../brokerage-clients/brokerage-client";
import { reconcileStockPosition } from "./algo";
import { debugSimulation } from "./debug";
import { getStocksFileNames, getStockStates, getStockStateFilePath } from "./state";
import { StockState } from "./types";
import { setTimeout } from "timers/promises";

const brokerageClient = new IBKRClient();

export async function startStopLossArb(): Promise<void> {
    const stocks = await getStocksFileNames();

    const states = await getStockStates(stocks);

    // let userHasInterrupted = false;
    // if (isLiveTrading()) {
    //   onUserInterrupt(() => {
    //     userHasInterrupted = true;
    //   });
    // }

    await Promise.all(
        stocks.map((stock) =>
            hedgeStockWhileMarketIsOpen(stock, states, brokerageClient)
        )
    );

    for (const stock of Object.keys(states).sort()) {
        console.log(`${stock}, tradingCosts: $${states[stock].tradingCosts}\n`);
    }
}

async function hedgeStockWhileMarketIsOpen(
    stock: string,
    states: { [stock: string]: StockState },
    brokerageClient: BrokerageClient
) {
    const originalStates = structuredClone(states);

    while (await isMarketOpen(stock)) {
        const stockState = states[stock];

        const snapshot = await reconcileStockPosition(stock, stockState, brokerageClient);

        if (isLiveTrading()) {
            await setTimeout(1_000);
        } else {
            debugSimulation(stock, states, originalStates, snapshot);
        }

        if (isHistoricalSnapshot()) {
            if (isHistoricalSnapshotsExhausted(stock)) {
                syncWriteJSONFile(
                    getStockStateFilePath(stock),
                    jsonPrettyPrint(stockState)
                );
                break;
            }
        }
    }
}
