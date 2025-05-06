#include "start.hpp"

#include <chrono>
#include <format>
#include <future>

#include "algo.hpp"
#include "debug.hpp"
#include "price_simulator.hpp"
#include "state.hpp"

using namespace std;

void StartStopLossArbCpp(
    const std::vector<std::vector<std::string>>& lists_of_list_of_dates,
    const PartialStockState& partial_stock_state
)
{
    const auto start_time = chrono::high_resolution_clock::now();

    vector<future<void>> waiting_for_dates_to_be_hedged{};

    for (auto& list_of_dates : lists_of_list_of_dates)
    {
        waiting_for_dates_to_be_hedged.push_back(async(
            launch::async,
            [&list_of_dates, &partial_stock_state]()
            { StartMultiDayStopLossArb(list_of_dates, partial_stock_state); }
        ));
    }

    for (const auto& future : waiting_for_dates_to_be_hedged)
    {
        future.wait();
    }

    double elapsed_minutes;
    const auto end_time = chrono::high_resolution_clock::now();
    elapsed_minutes =
        (chrono::duration_cast<chrono::milliseconds>(end_time - start_time).count() /
         1000.0) /
        60;

    Print(format("Hedging backtest done in {:.4f} minutes", elapsed_minutes));
}

void StartMultiDayStopLossArb(
    const std::vector<std::string>& list_of_dates,
    const PartialStockState& partial_stock_state
)
{
    for (auto& date : list_of_dates)
    {
        StartDailyStopLossArb(date, partial_stock_state);
    }
}

void StartDailyStopLossArb(
    const std::string date, const PartialStockState& partial_stock_state
)
{
    auto daily_map_of_states =
        GetHistoricalStockStatesForDate(date, partial_stock_state);

    StartStopLossArb(daily_map_of_states);
}

void StartStopLossArb(std::unordered_map<std::string, StockState>& daily_map_of_states)
{
    for (const auto& stock_to_state_pair : daily_map_of_states)
    {
        const auto& stock = stock_to_state_pair.first;
        HedgeStockWhileMarketIsOpen(stock, daily_map_of_states);
    }

    // Get a sorted list of stock keys
    vector<string> sortedStocks;
    for (const auto& [stock, _] : daily_map_of_states)
    {
        sortedStocks.push_back(stock);
    }
    sort(sortedStocks.begin(), sortedStocks.end());

    // Print results for each stock
    for (const auto& stock : sortedStocks)
    {
        const StockState& state = daily_map_of_states[stock];

        const char* printPnLValuesEnv = getenv("PRINT_PNL_VALUES");
        if (printPnLValuesEnv != nullptr)
        {
            PrintPnLValues(stock, state);
        }
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
            ReconcileRealizedPnLWhenHistoricalSnapshotsExhausted(stockState);
            DeleteHistoricalSnapshots(stockState);

            // The TS version does not have this function call because it's for writing
            // the "if reached x profir, loss was y"
            WritePnLAsPercentagesToSnapshotsFile(stockState);

            break;
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
    catch (exception&)
    {
        return default_historical_profit_threshold;
    }
    catch (...)
    {
        return default_historical_profit_threshold;
    }
}
