
#include "algo.hpp"

#include <vector>

#include "price_simulator.hpp"
#include "types.hpp"

using namespace std;

Snapshot ReconcileStockPosition(const std::string& stock, StockState& stockState)
{
    // 0)
    Snapshot snapshot = GetSimulatedSnapshot(stockState);

    const bool isSnapshotChanged = IsSnapshotChange(snapshot, stockState);
    if (isSnapshotChanged)
    {
        UpdateSnaphotOnState(stockState, snapshot);
        UpdateExitPnL(stockState);
    }

    if (IsWideBidAskSpread(snapshot, stockState) || !snapshot.bid || !snapshot.ask)
    {
        return snapshot;
    }

    // 1)
    CheckCrossings(stockState, snapshot);

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
        SetNewPosition(stock, stockState, newPosition.value(), snapshot);

        CheckCrossings(stockState, snapshot);
    }

    // 6)
    // No Step 6 on cpp because we've decided not to add Live Trading logic

    return snapshot;
}

bool IsWideBidAskSpread(const Snapshot& snapshot, const StockState& stockState)
{
    return (snapshot.ask - snapshot.bid) >= stockState.spaceBetweenIntervals;
}

void CheckCrossings(StockState& stockState, const Snapshot& snapshot)
{
    auto& intervals = stockState.intervals;

    for (auto& interval : intervals)
    {
        if (interval.BUY.active && !interval.BUY.crossed &&
            snapshot.ask < interval.BUY.price)
        {
            interval.BUY.crossed = true;
        }

        if (interval.SELL.active && !interval.SELL.crossed &&
            snapshot.bid > interval.SELL.price)
        {
            interval.SELL.crossed = true;
        }
    }
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

    if (stockState.isStaticIntervals)
    {
        AddSkippedBuysIfRequired(stockState, indicesToExecute);
    }

    for (const int index : indicesToExecute)
    {
        auto& interval = intervals[index];

        interval.BUY.active = false;
        interval.BUY.crossed = false;

        interval.SELL.active = true;
        interval.SELL.crossed = false;
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

    for (int i = 0; i < static_cast<int>(intervals.size()); ++i)
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
    const int& newPosition,
    const Snapshot& snapshot
)
{
    const auto previousPosition = stockState.position;
    stockState.position = newPosition;

    const string orderSide = newPosition > previousPosition ? "BUY" : "SELL";
    const Decimal quotedPrice =
        orderSide == static_cast<string>("BUY") ? snapshot.ask : snapshot.bid;

    const auto newNetPositionValue = GetNewNetPositionValue(
        stockState.netPositionValue,
        stockState.brokerageTradingCostPerShare,
        orderSide,
        newPosition,
        previousPosition,
        quotedPrice
    );

    stockState.netPositionValue = newNetPositionValue;
}

Decimal GetNewNetPositionValue(
    const Decimal& currentPositionValue,
    const Decimal& commissionPerShare,
    const std::string& orderSide,
    const int& newPosition,
    const int& previousPosition,
    const Decimal& priceSetAt
)
{
    int quantity = abs(newPosition - previousPosition);

    Decimal commissionCosts = Decimal(quantity) * commissionPerShare;

    Decimal change = -commissionCosts;

    Decimal orderValue = Decimal(quantity) * priceSetAt;

    if (orderSide == "BUY")
    {
        change -= orderValue;
    }
    else if (orderSide == "SELL")
    {
        change += orderValue;
    }

    Decimal newPositionValue = currentPositionValue + change;

    return newPositionValue;
}

void SetRealizedPnL(StockState& stockState)
{
    if (stockState.position != 0)
    {
        throw runtime_error("Cannot set realized PnL because Position is not zero");
    }

    const auto percentage_denominator =
        GetDecimal(stockState.targetPosition + stockState.sharesPerInterval) *
        stockState.initialPrice;

    Decimal realizedPnLAsPercentage =
        (stockState.netPositionValue / percentage_denominator) * 100;

    stockState.realizedPnLAsPercentage = realizedPnLAsPercentage;
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

    const string orderSide = position > 0 ? "SELL" : "BUY";

    const auto priceSetAt =
        (orderSide == static_cast<string>("BUY")) ? lastAsk : lastBid;

    const auto ifClosingPositionValue = GetNewNetPositionValue(
        stockState.netPositionValue,
        stockState.brokerageTradingCostPerShare,
        orderSide,
        0,
        position,
        priceSetAt
    );

    const auto percentage_denominator =
        GetDecimal(stockState.targetPosition + stockState.sharesPerInterval) *
        stockState.initialPrice;

    Decimal exitPnLAsPercentage =
        (ifClosingPositionValue / percentage_denominator) * 100;

    stockState.exitPnLAsPercentage = exitPnLAsPercentage;

    if (exitPnLAsPercentage > stockState.maxMovingProfitAsPercentage)
    {
        stockState.maxMovingProfitAsPercentage = exitPnLAsPercentage;
    }

    if (exitPnLAsPercentage < stockState.maxMovingLossAsPercentage)
    {
        stockState.maxMovingLossAsPercentage = exitPnLAsPercentage;
    }

    if (!stockState.reached_1_percentage_profit &&
        exitPnLAsPercentage >= GetDecimal(1.0))
    {
        stockState.reached_1_percentage_profit = true;
        stockState.max_loss_when_reached_1_percentage_profit =
            stockState.maxMovingLossAsPercentage;
    }

    if (!stockState.reached_0_75_percentage_profit &&
        exitPnLAsPercentage >= GetDecimal(0.75))
    {
        stockState.reached_0_75_percentage_profit = true;
        stockState.max_loss_when_reached_0_75_percentage_profit =
            stockState.maxMovingLossAsPercentage;
    }

    if (!stockState.reached_0_5_percentage_profit &&
        exitPnLAsPercentage >= GetDecimal(0.5))
    {
        stockState.reached_0_5_percentage_profit = true;
        stockState.max_loss_when_reached_0_5_percentage_profit =
            stockState.maxMovingLossAsPercentage;
    }

    if (!stockState.reached_0_25_percentage_profit &&
        exitPnLAsPercentage >= GetDecimal(0.25))
    {
        stockState.reached_0_25_percentage_profit = true;
        stockState.max_loss_when_reached_0_25_percentage_profit =
            stockState.maxMovingLossAsPercentage;
    }
}

void ReconcileRealizedPnLWhenHistoricalSnapshotsExhausted(StockState& stockState)
{
    UpdateExitPnL(stockState);

    SetNewPosition(
        stockState.brokerageId,
        stockState,
        0,
        Snapshot{stockState.lastAsk, stockState.lastBid}
    );

    SetRealizedPnL(stockState);
}

void CorrectBadBuyIfRequired(StockState& stockState, std::vector<int>& indexesToExecute)
{
    int lowestIndexExecuted = indexesToExecute.back();
    if (lowestIndexExecuted >= static_cast<int>(stockState.intervals.size()) - 1)
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
