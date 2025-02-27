
#include "algo.hpp"

#include <vector>

#include "price_simulator.hpp"
#include "types.hpp"

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
    int numToBuy = GetNumToBuy(stockState, snapshot);

    // 3)
    int numToSell = 0;
    if (numToBuy == 0)
    {
        numToSell = GetNumToSell(stockState, snapshot);
    }

    // 4)
    std::optional<int> newPosition;
    if (numToBuy > 0)
    {
        newPosition = stockState.position + stockState.sharesPerInterval * numToBuy;
    }
    else if (numToSell > 0)
    {
        newPosition = stockState.position - stockState.sharesPerInterval * numToSell;
    }

    bool isSnapshotChanged = IsSnapshotChange(snapshot, stockState);
    if (newPosition.has_value())
    {
        SetNewPosition(
            stock, stockState, newPosition.value(), snapshot,
            numToBuy > 0 ? "BUY" : "SELL"
        );

        CheckCrossings(stockState, snapshot);

        // if (isLiveTrading()) {
        //     SyncWriteJSONFile(
        //         GetStockStateFilePath(stock),
        //         JsonPrettyPrint(stockState)
        //     );
        // }
    }
    else if (isSnapshotChanged)
    {
        // 5)
        DoSnapShotChangeUpdates(stockState, snapshot);
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

int GetNumToBuy(StockState& stockState, const Snapshot& snapshot)
{
    auto& intervals = stockState.intervals;
    int position = stockState.position;

    int newPosition = position;
    std::vector<int> indexesToExecute;

    for (int i = intervals.size() - 1; i >= 0; --i)
    {
        const auto& interval = intervals[i];

        if (snapshot.ask >= interval.BUY.price && interval.BUY.active &&
            interval.BUY.crossed)
        {
            if (newPosition < interval.positionLimit)
            {
                indexesToExecute.insert(indexesToExecute.begin(), i);
                newPosition += stockState.sharesPerInterval;
            }
        }
    }

    for (const int index : indexesToExecute)
    {
        auto& interval = intervals[index];

        interval.BUY.active = false;
        interval.BUY.crossed = false;

        interval.SELL.active = true;
        interval.SELL.crossed = false;
    }

    if (stockState.isStaticIntervals)
    {
        AddSkippedBuysIfRequired(stockState, indexesToExecute);
    }

    if (!indexesToExecute.empty())
    {
        // Decimal purchaseValue =
        //     stockState.sharesPerInterval * indexesToExecute.size() * snapshot.ask;
        // stockState.tradingCosts -= purchaseValue;

        if (!stockState.isStaticIntervals)
        {
            CorrectBadBuyIfRequired(stockState, indexesToExecute);
        }
    }

    return indexesToExecute.size();
}

int GetNumToSell(StockState& stockState, const Snapshot& snapshot)
{
    auto& intervals = stockState.intervals;
    int position = stockState.position;

    int newPosition = position;
    std::vector<int> indexesToExecute;

    for (int i = 0; i < intervals.size(); ++i)
    {
        const auto& interval = intervals[i];

        if (snapshot.bid <= interval.SELL.price && interval.SELL.active &&
            interval.SELL.crossed)
        {
            if (newPosition > interval.positionLimit)
            {
                indexesToExecute.push_back(i);
                newPosition -= stockState.sharesPerInterval;
            }
        }
    }

    if (stockState.isStaticIntervals)
    {
        AddSkippedSellsIfRequired(stockState, indexesToExecute);
    }

    for (const int index : indexesToExecute)
    {
        auto& interval = intervals[index];

        interval.SELL.active = false;
        interval.SELL.crossed = false;

        interval.BUY.active = true;
        interval.BUY.crossed = false;
    }

    if (!indexesToExecute.empty())
    {
        // Decimal saleValue =
        //     stockState.sharesPerInterval * indexesToExecute.size() * snapshot.bid;
        // stockState.tradingCosts += saleValue;

        if (!stockState.isStaticIntervals)
        {
            CorrectBadSellIfRequired(stockState, indexesToExecute);
        }
    }

    return indexesToExecute.size();
}

bool IsSnapshotChange(const Snapshot& snapshot, const StockState& stockState)
{
    if (!stockState.lastAsk || !stockState.lastBid)
    {
        return true;
    }

    return stockState.lastAsk.value() != snapshot.ask ||
           stockState.lastBid.value() != snapshot.bid;
}

void SetNewPosition(
    const std::string& stock, StockState& stockState, int newPosition,
    const Snapshot& snapshot, std::string orderSide
)
{
    int previousPosition = stockState.position;
    stockState.position = newPosition;

    DoSnapShotChangeUpdates(stockState, snapshot);

    TradingLog tradingLog;
    tradingLog.action = orderSide;
    tradingLog.timeStamp = snapshot.timestamp;
    tradingLog.price = (orderSide == "BUY") ? snapshot.ask : snapshot.bid;
    tradingLog.previousPosition = previousPosition;
    tradingLog.newPosition = newPosition;
    // tradingLog.tradingCosts = stockState.tradingCosts;
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

void DoSnapShotChangeUpdates(StockState& stockState, const Snapshot& snapshot)
{
    stockState.lastAsk = snapshot.ask;
    stockState.lastBid = snapshot.bid;

    // if (isLiveTrading()) {
    //     syncWriteJSONFile(getStockStateFilePath(stock), jsonPrettyPrint(stockState));
    // }
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
