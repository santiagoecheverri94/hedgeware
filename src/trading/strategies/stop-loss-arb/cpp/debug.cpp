#include "debug.hpp"

#include <format>

#include "price_simulator.hpp"

using namespace std;

void PrintPnLValues(const std::string stock, const StockState& stockState)
{
    Print(format("stock: {}", stock));
    Print(format("realizedPnL: {}", stockState.realizedPnL.str()));
    Print(format("exitPnL: {}", stockState.exitPnL.str()));
    Print(format("exitPnLAsPercent: {}", stockState.exitPnLAsPercent.str()));
    Print(format("maxMovingLossAsPercent: {}", stockState.maxMovingLossAsPercent.str())
    );
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
