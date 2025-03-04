#include "start.hpp"

#include <format>
#include <future>

#include "algo.hpp"
#include "debug.hpp"
#include "price_simulator.hpp"

using namespace std;

void StartStopLossArbCpp(
    const std::vector<std::string>& stocks,
    std::unordered_map<std::string, StockState>& states
)
{
    // // Let userHasInterrupted = false;
    // // if (isLiveTrading()) {
    // //   onUserInterrupt(() => {
    // //     userHasInterrupted = true;
    // //   });
    // // }

    vector<future<void>> waiting_for_stocks_to_be_hedged;
    waiting_for_stocks_to_be_hedged.reserve(stocks.size());

    for (const auto& stock : stocks)
    {
        // Use async with launch::async launch policy to ensure each call runs on its
        // own thread
        waiting_for_stocks_to_be_hedged.push_back(
            async(launch::async, HedgeStockWhileMarketIsOpen, stock, ref(states))
        );
    }

    for (const auto& future : waiting_for_stocks_to_be_hedged)
    {
        future.wait();
    }

    // Get a sorted list of stock keys
    vector<string> sortedStocks;
    for (const auto& [stock, _] : states)
    {
        sortedStocks.push_back(stock);
    }
    sort(sortedStocks.begin(), sortedStocks.end());

    // Print results for each stock
    for (const auto& stock : sortedStocks)
    {
        const StockState& state = states[stock];

        // Format the exit PnL as a percentage with + sign for positive values
        string exitPnLSign = state.exitPnLAsPercent > 0 ? "+" : "";
        Decimal exitPnLPercent = state.exitPnLAsPercent * 100;
        Decimal maxLossPercent = state.maxMovingLossAsPercent * 100;

        cout << stock << ", Exit PnL: " << exitPnLSign << exitPnLPercent
             << "%, Max Loss: " << maxLossPercent << "%\n";

        Print(format(""));
    }
}

void HedgeStockWhileMarketIsOpen(
    const std::string& stock, std::unordered_map<std::string, StockState>& states
)
{
    const auto originalStates = states;  // clone original states

    while (true)  // check if market is open when we move to cpp trading
    {
        auto& stockState = states[stock];

        const auto snapshot = ReconcileStockPosition(stock, stockState);

        if (IsExitPnlBeyondThresholds(stockState))
        {
            break;
        }

        // if (isLiveTrading()) {
        //     await setTimeout(1000);
        // } else
        if (IsRandomSnapshot())
        {
            DebugRandomPrices(snapshot, stock, states, originalStates);
        }
        else if (IsHistoricalSnapshot())
        {
            // if (isHistoricalSnapshotsExhausted(stock))
            // {
            //     syncWriteJSONFile(
            //         getStockStateFilePath(stock), jsonPrettyPrint(stockState),
            //     );
            //     break;
            // }
        }
    }
}

Decimal GetHistoricalProfitThreshold()
{
    const char* thresholdStr = getenv("HISTORICAL_PROFIT_THRESHOLD");
    try
    {
        double value = stod(thresholdStr);
        return GetDecimal(value);
    }
    catch (...)
    {
        return GetDecimal(0.01);
    }
}

const Decimal LIVE_PROFIT_THRESHOLD = GetDecimal(0.005);
const Decimal LIVE_LOSS_THRESHOLD = -numeric_limits<double>::infinity();

bool IsExitPnlBeyondThresholds(const StockState& stockState)
{
    const Decimal& exitPnLAsPercent = stockState.exitPnLAsPercent;

    if (IsHistoricalSnapshot())
    {
        Decimal historicalProfitThreshold = GetHistoricalProfitThreshold();
        if (exitPnLAsPercent >= historicalProfitThreshold)
        {
            return true;
        }
    }
    else if (IsLiveTrading())
    {
        if (exitPnLAsPercent >= LIVE_PROFIT_THRESHOLD)
        {
            return true;
        }

        if (exitPnLAsPercent <= LIVE_LOSS_THRESHOLD)
        {
            return true;
        }
    }

    return false;
}
