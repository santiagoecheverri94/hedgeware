#include "debug.hpp"

#include <format>

#include "price_simulator.hpp"

void DebugUpperOrLowerBound(
    const std::string& upperOrLowerBound, const std::string& stock,
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

    if (upperOrLowerBound == "up" &&
        states[stock].position <
            states[stock].targetPosition - states[stock].sharesPerInterval)
    {
        Print("Debugger: upper bound reached with bugs!\n");
    }
    else if (upperOrLowerBound == "down" &&
             states[stock].position >
                 -(states[stock].targetPosition - states[stock].sharesPerInterval))
    {
        Print("Debugger: lower bound reached with bugs!\n");
    }

    RestartRandomPrice();
    states[stock] = originalStates.at(stock);

    return;
}

void DebugRandomPrices(
    const Snapshot& snapshot, const std::string& stock,
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
