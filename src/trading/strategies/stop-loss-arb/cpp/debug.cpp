#include "debug.hpp"

#include <format>

#include "price_simulator.hpp"

using namespace std;

void PrintPnLValues(const std::string stock, const StockState& stockState)
{
    const auto realizedPnL = stockState.realizedPnL;
    const auto exitPnL = stockState.exitPnL;
    const auto exitPnLAsPercent = stockState.exitPnLAsPercent;
    const auto maxMovingLossAsPercent = stockState.maxMovingLossAsPercent;

    Print(format("stock: {}", stock));
    Print(format("realizedPnL: {}", realizedPnL.str()));
    Print(format("exitPnL: {}", exitPnL.str()));
    Print(format("exitPnLAsPercent: {}", exitPnLAsPercent.str()));
    Print(format("maxMovingLossAsPercent: {}", maxMovingLossAsPercent.str()));
    Print("");
}

void DebugUpperOrLowerBound(
    const std::string& upperOrLowerBound,
    const std::string& stock,
    std::unordered_map<std::string, StockState>& states,
    const std::unordered_map<std::string, StockState>& originalStates
)
{
    if (states[stock].tradingLogs.empty())
    {
        RestartRandomPrice();
        states[stock] = originalStates.at(stock);
        return;
    }

    // PrintPnLValues(stock, states);

    if (upperOrLowerBound == "up" &&
        states[stock].position < states[stock].targetPosition)
    {
        __debugbreak();
    }
    else if (upperOrLowerBound == "down" &&
             states[stock].position > -states[stock].targetPosition)
    {
        __debugbreak();
    }

    RestartRandomPrice();
    states[stock] = originalStates.at(stock);

    return;
}

void DebugRandomPrices(
    const Snapshot& snapshot,
    const std::string& stock,
    std::unordered_map<std::string, StockState>& states,
    const std::unordered_map<std::string, StockState>& originalStates
)
{
    auto& stockState = states[stock];

    Decimal aboveTopSell =
        stockState.intervals[0].SELL.price + stockState.spaceBetweenIntervals;
    if (snapshot.bid >= aboveTopSell)
    {
        DebugUpperOrLowerBound("up", stock, states, originalStates);
        return;
    }

    Decimal belowBottomBuy =
        stockState.intervals.back().BUY.price - stockState.spaceBetweenIntervals;
    if (snapshot.ask <= belowBottomBuy)
    {
        DebugUpperOrLowerBound("down", stock, states, originalStates);
        return;
    }

    return;
}
