#include "start.hpp"

#include <format>
#include <future>

#include "algo.hpp"
#include "debug.hpp"
#include "price_simulator.hpp"

using namespace std;

void StartStopLossArbCpp(std::unordered_map<std::string, StockState>& states)
{
    vector<future<void>> waiting_for_stocks_to_be_hedged;
    waiting_for_stocks_to_be_hedged.reserve(states.size());

    chrono::steady_clock::time_point start_time;
    if (IsHistoricalSnapshot())
    {
        start_time = chrono::high_resolution_clock::now();
    }

    for (const auto& ticker_and_state_pair : states)
    {
        const string& stock = ticker_and_state_pair.first;

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

    double elapsed_seconds;
    if (IsHistoricalSnapshot())
    {
        const auto end_time = chrono::high_resolution_clock::now();
        elapsed_seconds =
            chrono::duration_cast<chrono::milliseconds>(end_time - start_time).count() /
            1000.0;
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

        PrintPnLValues(stock, state);
    }

    if (IsHistoricalSnapshot())
    {
        cout << "Hedging completed in " << fixed << setprecision(4) << elapsed_seconds
             << " seconds" << endl;
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

        if (IsLiveTrading() || IsHistoricalSnapshot())
        {
            if (IsExitPnlBeyondThresholds(stockState) ||
                IsHistoricalSnapshotsExhausted(stock))
            {
                if (IsHistoricalSnapshot)
                {
                    DeleteHistoricalSnapshots(stock);
                }

                // syncWriteJSONFile(
                //     getStockStateFilePath(stock),
                //     jsonPrettyPrint(stockState),
                // );

                break;
            }
        }

        if (IsLiveTrading())
        {
            // await setTimeout(1000);
        }

        if (IsRandomSnapshot())
        {
            DebugRandomPrices(snapshot, stock, states, originalStates);
        }
    }
}

Decimal GetHistoricalProfitThreshold()
{
    const auto default_historical_profit_threshold = GetDecimal(0.01);

    const char* thresholdStr = getenv("HISTORICAL_PROFIT_THRESHOLD");
    if (thresholdStr == nullptr)
    {
        return default_historical_profit_threshold;
    }

    try
    {
        double value = stod(thresholdStr);
        return GetDecimal(value);
    }
    catch (exception)
    {
        return default_historical_profit_threshold;
    }
    catch (...)
    {
        return default_historical_profit_threshold;
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
