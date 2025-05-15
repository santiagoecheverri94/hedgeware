#include "debug.hpp"

#include <format>

#include "price_simulator.hpp"

using namespace std;

void PrintPnLValues(const std::string stock, const StockState& stockState)
{
    Print(format("stock: {}", stock));
    Print(
        format("realizedPnLAsPercentage: {}", stockState.realizedPnLAsPercentage.str())
    );
    Print(format("exitPnLAsPercentage: {}", stockState.exitPnLAsPercentage.str()));
    Print(format(
        "maxMovingProfitAsPercentage: {}", stockState.maxMovingProfitAsPercentage.str()
    ));
    Print(format(
        "maxMovingLossAsPercentage: {}", stockState.maxMovingLossAsPercentage.str()
    ));
    Print("");
}

void DebugUpperOrLowerBound(
    const std::string& upperOrLowerBound,
    const std::string& stock,
    std::unordered_map<std::string, StockState>& states,
    const std::unordered_map<std::string, StockState>& originalStates
)
{
    if (upperOrLowerBound == "up" &&
        states[stock].position < states[stock].targetPosition)
    {
        Print("Place breakpoint here. No cross platform breakpoints in C++");
    }
    else if (upperOrLowerBound == "down" &&
             states[stock].position > -states[stock].targetPosition)
    {
        Print("Place breakpoint here. No cross platform breakpoints in C++");
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
