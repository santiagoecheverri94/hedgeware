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

    vector<future<AggResults>> waiting_for_dates_to_be_hedged{};

    for (auto& list_of_dates : lists_of_list_of_dates)
    {
        waiting_for_dates_to_be_hedged.push_back(async(
            launch::async,
            [&list_of_dates, &partial_stock_state]() -> AggResults
            { return StartMultiDayStopLossArb(list_of_dates, partial_stock_state); }
        ));
    }

    AggResults results{
        .num_stocks = 0,
        .num_stocks_profitable = 0,
    };

    for (auto& future : waiting_for_dates_to_be_hedged)
    {
        const auto result = future.get();

        results.num_stocks += result.num_stocks;
        results.num_stocks_profitable += result.num_stocks_profitable;
    }

    double elapsed_minutes;
    const auto end_time = chrono::high_resolution_clock::now();
    elapsed_minutes =
        (chrono::duration_cast<chrono::milliseconds>(end_time - start_time).count() /
         1000.0) /
        60;

    Print(format("Hedging backtest done in {:.4f} minutes\n", elapsed_minutes));

    Print(format("Number of stocks: {}", results.num_stocks));
    Print(format("Number of profitable stocks: {}", results.num_stocks_profitable));

    const Decimal percentage_profitable =
        (GetDecimal(results.num_stocks_profitable) / GetDecimal(results.num_stocks)) *
        100.0;
    Print(format(
        "Percentage of profitable stocks: {:.2f}%",
        percentage_profitable.convert_to<double>()
    ));
}

AggResults StartMultiDayStopLossArb(
    const std::vector<std::string>& list_of_dates,
    const PartialStockState& partial_stock_state
)
{
    AggResults results{
        .num_stocks = 0,
        .num_stocks_profitable = 0,
    };

    for (auto& date : list_of_dates)
    {
        const auto result = StartDailyStopLossArb(date, partial_stock_state);

        results.num_stocks += result.num_stocks;
        results.num_stocks_profitable += result.num_stocks_profitable;
    }

    return results;
}

AggResults StartDailyStopLossArb(
    const std::string date, const PartialStockState& partial_stock_state
)
{
    auto daily_map_of_states =
        GetHistoricalStockStatesForDate(date, partial_stock_state);

    StartStopLossArb(daily_map_of_states);

    const auto agg_results = GetAggregateResults(daily_map_of_states);

    return agg_results;
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
            // the "if reached x profit, loss was y"
            WritePnLAsPercentagesToSnapshotsFile(stockState);

            break;
        }

        if (IsRandomSnapshot())
        {
            DebugRandomPrices(snapshot, stock, states, originalStates);
        }
    }
}

AggResults GetAggregateResults(
    const std::unordered_map<std::string, StockState>& states
)
{
    AggResults agg_results{
        .num_stocks = 0,
        .num_stocks_profitable = 0,
    };

    for (const auto& [_, stockState] : states)
    {
        agg_results.num_stocks++;

        if (IsStockProfitable(stockState))
        {
            agg_results.num_stocks_profitable++;
        }
    }

    return agg_results;
}

bool IsStockProfitable(const StockState& stockState)
{
    if (stockState.profitThreshold == Decimal("2.0"))
    {
        if (!stockState.reached_2_percentage_profit)
        {
            return false;
        }

        return stockState.max_loss_when_reached_2_percentage_profit >
               stockState.lossThreshold;
    }

    if (stockState.profitThreshold == Decimal("1.75"))
    {
        if (!stockState.reached_1_75_percentage_profit)
        {
            return false;
        }

        return stockState.max_loss_when_reached_1_75_percentage_profit >
               stockState.lossThreshold;
    }

    if (stockState.profitThreshold == Decimal("1.5"))
    {
        if (!stockState.reached_1_5_percentage_profit)
        {
            return false;
        }

        return stockState.max_loss_when_reached_1_5_percentage_profit >
               stockState.lossThreshold;
    }

    if (stockState.profitThreshold == Decimal("1.25"))
    {
        if (!stockState.reached_1_25_percentage_profit)
        {
            return false;
        }

        return stockState.max_loss_when_reached_1_25_percentage_profit >
               stockState.lossThreshold;
    }

    if (stockState.profitThreshold == Decimal("1.0"))
    {
        if (!stockState.reached_1_percentage_profit)
        {
            return false;
        }

        return stockState.max_loss_when_reached_1_percentage_profit >
               stockState.lossThreshold;
    }

    if (stockState.profitThreshold == Decimal("0.75"))
    {
        if (!stockState.reached_0_75_percentage_profit)
        {
            return false;
        }

        return stockState.max_loss_when_reached_0_75_percentage_profit >
               stockState.lossThreshold;
    }

    if (stockState.profitThreshold == Decimal("0.5"))
    {
        if (!stockState.reached_0_5_percentage_profit)
        {
            return false;
        }

        return stockState.max_loss_when_reached_0_5_percentage_profit >
               stockState.lossThreshold;
    }

    if (stockState.profitThreshold == Decimal("0.25"))
    {
        if (!stockState.reached_0_25_percentage_profit)
        {
            return false;
        }

        return stockState.max_loss_when_reached_0_25_percentage_profit >
               stockState.lossThreshold;
    }

    return false;
}
