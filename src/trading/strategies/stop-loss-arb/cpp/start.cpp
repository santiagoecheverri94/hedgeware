#include "start.hpp"

#include <chrono>
#include <format>
#include <future>

#include "algo.hpp"
#include "debug.hpp"
#include "price_simulator.hpp"

using namespace std;

void StartStopLossArbCpp(
    std::vector<std::unordered_map<std::string, StockState>>& states_list
)
{
    chrono::steady_clock::time_point start_time;
    start_time = chrono::high_resolution_clock::now();

    vector<future<void>> waiting_for_dates_to_be_hedged;
    waiting_for_dates_to_be_hedged.reserve(states_list.size());

    const string start_date = states_list[0].begin()->second.date;
    const string end_date = states_list[states_list.size() - 1].begin()->second.date;

    for (auto& states : states_list)
    {
        waiting_for_dates_to_be_hedged.push_back(
            async(launch::async, StartStopLossArbCppHelper, ref(states))
        );
    }

    for (const auto& future : waiting_for_dates_to_be_hedged)
    {
        future.wait();
    }

    double elapsed_seconds;
    const auto end_time = chrono::high_resolution_clock::now();
    elapsed_seconds =
        chrono::duration_cast<chrono::milliseconds>(end_time - start_time).count() /
        1000.0;

    Print(format(
        "Hedging backtest of {} dates (start:'{}', end:'{}') completed in {:.4f} "
        "seconds",
        states_list.size(),
        start_date,
        end_date,
        elapsed_seconds
    ));
}

void StartStopLossArbCppHelper(std::unordered_map<std::string, StockState>& states)
{
    for (const auto& stock_to_state_pair : states)
    {
        const auto& stock = stock_to_state_pair.first;
        HedgeStockWhileMarketIsOpen(stock, states);
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

        // PrintPnLValues(stock, state);
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

        if (IsHistoricalSnapshot() && IsHistoricalSnapshotsExhausted(stockState))
        {
            DeleteHistoricalSnapshots(stockState);
            WritePnLAsPercentagesToSnapshotsFile(stockState);

            break;
        }

        if (IsLiveTrading())
        {
            // await setTimeout(1000);

            if (IsExitPnlBeyondThresholds(stockState))
            {
                // syncWriteJSONFile(
                //     getStockStateFilePath(stock),
                //     jsonPrettyPrint(stockState),
                // );

                break;
            }
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
    return false;

    const Decimal& exitPnLAsPercentage = stockState.exitPnLAsPercentage;

    if (IsHistoricalSnapshot())
    {
        Decimal historicalProfitThreshold = GetHistoricalProfitThreshold();
        if (exitPnLAsPercentage >= historicalProfitThreshold)
        {
            return true;
        }
    }
    else if (IsLiveTrading())
    {
        if (exitPnLAsPercentage >= LIVE_PROFIT_THRESHOLD)
        {
            return true;
        }

        if (exitPnLAsPercentage <= LIVE_LOSS_THRESHOLD)
        {
            return true;
        }
    }

    return false;
}
