
#include "algo.hpp"

#include <vector>

#include "price_simulator.hpp"
#include "types.hpp"

using namespace std;

Snapshot ReconcileStockPosition(const std::string& stock, StockState& stockState)
{
    // 0)
    // Snapshot snapshot = isLiveTrading() ? brokerageClient.GetSnapshot(stock,
    // stockState.brokerageId) : GetSimulatedSnapshot(stock);
    Snapshot snapshot = GetSimulatedSnapshot(stock);

    if (IsWideBidAskSpread(snapshot, stockState) || !snapshot.bid || !snapshot.ask)
    {
        return snapshot;
    }

    // 1)
    bool crossingHappened = CheckCrossings(stockState, snapshot);

    // if (isLiveTrading() && crossingHappened) {
    //     SyncWriteJSONFile(GetStockStateFilePath(stock), JsonPrettyPrint(stockState));
    // }

    // 2)
    vector<int> intervalIndicesToExecute = GetNumToBuy(stockState, snapshot);
    const int numToBuy = intervalIndicesToExecute.size();

    // 3)
    int numToSell = 0;
    if (numToBuy == 0)
    {
        intervalIndicesToExecute = GetNumToSell(stockState, snapshot);
        numToSell = intervalIndicesToExecute.size();
    }

    // 4)
    optional<int> newPosition;
    if (numToBuy > 0)
    {
        newPosition = stockState.position + stockState.sharesPerInterval * numToBuy;
    }
    else if (numToSell > 0)
    {
        newPosition = stockState.position - stockState.sharesPerInterval * numToSell;
    }

    // 5)
    if (newPosition.has_value())
    {
        string orderSide = numToBuy > 0 ? "BUY" : "SELL";

        SetNewPosition(stock, stockState, newPosition.value(), snapshot, orderSide);

        // TODO: refactor so price is returned from setNewPosition
        Decimal priceSetAt = orderSide == "BUY" ? snapshot.ask : snapshot.bid;
        UpdateRealizedPnL(stockState, intervalIndicesToExecute, orderSide, priceSetAt);

        CheckCrossings(stockState, snapshot);
    }

    // 6)
    const bool isSnapshotChanged = IsSnapshotChange(snapshot, stockState);
    if (isSnapshotChanged)
    {
        UpdateSnaphotOnState(stockState, snapshot);

        UpdateExitPnL(stockState);

        // if (isLiveTrading()) {
        //     SyncWriteJSONFile(
        //         GetStockStateFilePath(stock),
        //         JsonPrettyPrint(stockState)
        //     );
        // }
    }

    return snapshot;
}

bool IsWideBidAskSpread(const Snapshot& snapshot, const StockState& stockState)
{
    return (snapshot.ask - snapshot.bid) > stockState.intervalProfit;
}

bool CheckCrossings(StockState& stockState, const Snapshot& snapshot)
{
    auto& intervals = stockState.intervals;

    bool crossingHappened = false;
    for (auto& interval : intervals)
    {
        if (interval.BUY.active && !interval.BUY.crossed &&
            snapshot.ask < interval.BUY.price)
        {
            interval.BUY.crossed = true;
            crossingHappened = true;
        }

        if (interval.SELL.active && !interval.SELL.crossed &&
            snapshot.bid > interval.SELL.price)
        {
            interval.SELL.crossed = true;
            crossingHappened = true;
        }
    }

    return crossingHappened;
}

std::vector<int> GetNumToBuy(StockState& stockState, const Snapshot& snapshot)
{
    auto& intervals = stockState.intervals;
    int position = stockState.position;

    int newPosition = position;
    vector<int> indicesToExecute;

    for (int i = intervals.size() - 1; i >= 0; --i)
    {
        const auto& interval = intervals[i];

        if (snapshot.ask >= interval.BUY.price && interval.BUY.active &&
            interval.BUY.crossed)
        {
            if (newPosition < interval.positionLimit)
            {
                indicesToExecute.insert(indicesToExecute.begin(), i);
                newPosition += stockState.sharesPerInterval;
            }
        }
    }

    for (const int index : indicesToExecute)
    {
        auto& interval = intervals[index];

        interval.BUY.active = false;
        interval.BUY.crossed = false;

        interval.SELL.active = true;
        interval.SELL.crossed = false;
    }

    if (stockState.isStaticIntervals)
    {
        AddSkippedBuysIfRequired(stockState, indicesToExecute);
    }

    if (!indicesToExecute.empty())
    {
        if (!stockState.isStaticIntervals)
        {
            CorrectBadBuyIfRequired(stockState, indicesToExecute);
        }
    }

    return indicesToExecute;
}

std::vector<int> GetNumToSell(StockState& stockState, const Snapshot& snapshot)
{
    auto& intervals = stockState.intervals;
    int position = stockState.position;

    int newPosition = position;
    vector<int> indicesToExecute;

    for (int i = 0; i < intervals.size(); ++i)
    {
        const auto& interval = intervals[i];

        if (snapshot.bid <= interval.SELL.price && interval.SELL.active &&
            interval.SELL.crossed)
        {
            if (newPosition > interval.positionLimit)
            {
                indicesToExecute.push_back(i);
                newPosition -= stockState.sharesPerInterval;
            }
        }
    }

    if (stockState.isStaticIntervals)
    {
        AddSkippedSellsIfRequired(stockState, indicesToExecute);
    }

    for (const int index : indicesToExecute)
    {
        auto& interval = intervals[index];

        interval.SELL.active = false;
        interval.SELL.crossed = false;

        interval.BUY.active = true;
        interval.BUY.crossed = false;
    }

    if (!indicesToExecute.empty())
    {
        if (!stockState.isStaticIntervals)
        {
            CorrectBadSellIfRequired(stockState, indicesToExecute);
        }
    }

    return indicesToExecute;
}

bool IsSnapshotChange(const Snapshot& snapshot, const StockState& stockState)
{
    if (!stockState.lastAsk || !stockState.lastBid)
    {
        return true;
    }

    return stockState.lastAsk != snapshot.ask || stockState.lastBid != snapshot.bid;
}

void SetNewPosition(
    const std::string& stock,
    StockState& stockState,
    int newPosition,
    const Snapshot& snapshot,
    std::string orderSide
)
{
    int previousPosition = stockState.position;
    stockState.position = newPosition;

    TradingLog tradingLog;
    tradingLog.action = orderSide;
    tradingLog.timeStamp = snapshot.timestamp;
    tradingLog.price = (orderSide == "BUY") ? snapshot.ask : snapshot.bid;
    tradingLog.previousPosition = previousPosition;
    tradingLog.newPosition = newPosition;
    stockState.tradingLogs.push_back(tradingLog);

    // if (isLiveTrading()) {
    //     await brokerageClient.setSecurityPosition({
    //         brokerageIdOfSecurity: stockState.brokerageId,
    //         currentPosition: stockState.position * stockState.numContracts,
    //         newPosition: newPosition * stockState.numContracts,
    //         snapshot,
    //     });

    //     log(
    //         `Changed position for ${stock} (${
    //             stockState.numContracts
    //         } constracts): ${jsonPrettyPrint({
    //             price: tradingLog.price,
    //             previousPosition: tradingLog.previousPosition,
    //             newPosition: tradingLog.newPosition,
    //         })}`,
    //     );
    // }
}

void UpdateRealizedPnL(
    StockState& stockState,
    const std::vector<int>& executedIndices,
    const std::string& orderSide,
    Decimal price
)
{
    if (executedIndices.empty())
    {
        return;
    }

    Decimal commissionCosts =
        GetDecimal(executedIndices.size() * stockState.sharesPerInterval) *
        stockState.brokerageTradingCostPerShare;

    stockState.realizedPnL -= commissionCosts;

    for (const int index : executedIndices)
    {
        auto& interval = stockState.intervals[index];

        optional<Decimal> pnLFromThisExecution;

        if (interval.type == IntervalType::LONG)
        {
            if (orderSide == "BUY")
            {
                interval.SELL.boughtAtPrice = price;
            }
            else if (orderSide == "SELL")
            {
                pnLFromThisExecution = GetDecimal(stockState.sharesPerInterval) *
                                       (price - interval.SELL.boughtAtPrice.value());
            }
        }

        if (interval.type == IntervalType::SHORT)
        {
            if (orderSide == "SELL")
            {
                interval.BUY.soldAtPrice = price;
            }
            else if (orderSide == "BUY")
            {
                pnLFromThisExecution = GetDecimal(stockState.sharesPerInterval) *
                                       (interval.BUY.soldAtPrice.value() - price);
            }
        }

        if (pnLFromThisExecution.has_value())
        {
            stockState.realizedPnL += pnLFromThisExecution.value();
        }
    }
}

void UpdateSnaphotOnState(StockState& stockState, const Snapshot& snapshot)
{
    stockState.lastAsk = snapshot.ask;
    stockState.lastBid = snapshot.bid;
}

void UpdateExitPnL(StockState& stockState)
{
    const auto& lastAsk = stockState.lastAsk;
    const auto& lastBid = stockState.lastBid;
    const int position = stockState.position;

    if (position == 0)
    {
        return;
    }

    Decimal exitPnL = stockState.realizedPnL;

    for (const auto& interval : stockState.intervals)
    {
        std::optional<Decimal> intervalPnL;

        if (interval.type == IntervalType::LONG && interval.SELL.active)
        {
            const auto& boughtAtPrice = interval.SELL.boughtAtPrice.value();
            intervalPnL =
                GetDecimal(stockState.sharesPerInterval) * (lastBid - boughtAtPrice);
        }

        if (interval.type == IntervalType::SHORT && interval.BUY.active)
        {
            const auto& soldAtPrice = interval.BUY.soldAtPrice.value();
            intervalPnL =
                GetDecimal(stockState.sharesPerInterval) * (soldAtPrice - lastAsk);
        }

        if (intervalPnL.has_value())
        {
            exitPnL += intervalPnL.value();
        }
    }

    stockState.exitPnL = exitPnL;

    Decimal exitPnLAsPercent =
        exitPnL / (GetDecimal(stockState.targetPosition) * stockState.initialPrice);

    stockState.exitPnLAsPercent = exitPnLAsPercent;

    if (exitPnLAsPercent < stockState.maxMovingLossAsPercent)
    {
        stockState.maxMovingLossAsPercent = exitPnLAsPercent;
    }
}

void CorrectBadBuyIfRequired(StockState& stockState, std::vector<int>& indexesToExecute)
{
    int lowestIndexExecuted = indexesToExecute.back();
    if (lowestIndexExecuted >= stockState.intervals.size() - 1)
    {
        return;
    }

    auto& intervals = stockState.intervals;
    auto& intervalBelowLowestIntervalExecuted = intervals[lowestIndexExecuted + 1];
    if (!intervalBelowLowestIntervalExecuted.BUY.active)
    {
        return;
    }

    intervalBelowLowestIntervalExecuted.BUY.active = false;
    intervalBelowLowestIntervalExecuted.BUY.crossed = false;
    intervalBelowLowestIntervalExecuted.SELL.active = true;
    intervalBelowLowestIntervalExecuted.SELL.crossed = false;

    auto& topIntervalExecuted = intervals[indexesToExecute[0]];
    topIntervalExecuted.BUY.active = true;
    topIntervalExecuted.BUY.crossed = false;
    topIntervalExecuted.SELL.active = false;
    topIntervalExecuted.SELL.crossed = false;

    for (auto& interval : intervals)
    {
        interval.BUY.price = interval.BUY.price + stockState.spaceBetweenIntervals;
        interval.SELL.price = interval.SELL.price + stockState.spaceBetweenIntervals;
    }
}

void CorrectBadSellIfRequired(
    StockState& stockState, std::vector<int>& indexesToExecute
)
{
    int highestIndexExecuted = indexesToExecute[0];
    if (highestIndexExecuted == 0)
    {
        return;
    }

    auto& intervals = stockState.intervals;
    auto& intervalAboveHighestIntervalExecuted = intervals[highestIndexExecuted - 1];
    if (!intervalAboveHighestIntervalExecuted.SELL.active)
    {
        return;
    }

    intervalAboveHighestIntervalExecuted.SELL.active = false;
    intervalAboveHighestIntervalExecuted.SELL.crossed = false;
    intervalAboveHighestIntervalExecuted.BUY.active = true;
    intervalAboveHighestIntervalExecuted.BUY.crossed = false;

    auto& bottomIntervalExecuted = intervals[indexesToExecute.back()];
    bottomIntervalExecuted.SELL.active = true;
    bottomIntervalExecuted.SELL.crossed = false;
    bottomIntervalExecuted.BUY.active = false;
    bottomIntervalExecuted.BUY.crossed = false;

    for (auto& interval : intervals)
    {
        interval.BUY.price = interval.BUY.price - stockState.spaceBetweenIntervals;
        interval.SELL.price = interval.SELL.price - stockState.spaceBetweenIntervals;
    }
}

void AddSkippedBuysIfRequired(
    StockState& stockState, std::vector<int>& indexesToExecute
)
{
    if (indexesToExecute.empty())
    {
        return;
    }

    const auto& intervals = stockState.intervals;
    int bottomOriginalIndexToExecute = indexesToExecute.back();
    for (int i = intervals.size() - 1; i > bottomOriginalIndexToExecute; --i)
    {
        const auto& interval = intervals[i];

        if (interval.BUY.active)
        {
            indexesToExecute.push_back(i);
        }
    }
}

void AddSkippedSellsIfRequired(
    StockState& stockState, std::vector<int>& indexesToExecute
)
{
    if (indexesToExecute.empty())
    {
        return;
    }

    const auto& intervals = stockState.intervals;
    int topOriginalIndexToExecute = indexesToExecute[0];
    for (int i = 0; i < topOriginalIndexToExecute; ++i)
    {
        const auto& interval = intervals[i];

        if (interval.SELL.active)
        {
            indexesToExecute.insert(indexesToExecute.begin(), i);
        }
    }
}
