#include "start.hpp"

#include <format>

#include "algo.hpp"
#include "debug.hpp"

void HedgeStockWhileMarketIsOpen(
    const std::string& stock, std::unordered_map<std::string, StockState>& states
)
{
    const auto originalStates = states;

    while (true)
    {
        auto& stockState = states[stock];

        const auto snapshot = ReconcileStockPosition(stock, stockState);

        // if (isLiveTrading()) {
        //     await setTimeout(1000);
        // } else if (isRandomSnapshot()) {
        DebugRandomPrices(snapshot, stock, states, originalStates);
        // } else if (isHistoricalSnapshot()) {
        //     if (isHistoricalSnapshotsExhausted(stock)) {
        //         syncWriteJSONFile(
        //             getStockStateFilePath(stock),
        //             jsonPrettyPrint(stockState),
        //         );
        //         break;
        //     }
        // }
    }
}
