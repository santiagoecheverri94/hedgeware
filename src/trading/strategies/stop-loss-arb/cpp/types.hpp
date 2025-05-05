#pragma once

#include <optional>

#include "utils.hpp"

struct Snapshot
{
    Decimal ask;
    Decimal bid;
    std::string timestamp;
};

enum class IntervalType
{
    LONG,
    SHORT
};

struct SmoothingInterval
{
    struct OrderActionDetails
    {
        bool active;
        bool crossed;
        Decimal price;
        std::optional<Decimal> boughtAtPrice;
        std::optional<Decimal> soldAtPrice;
    };

    IntervalType type;
    int positionLimit;
    OrderActionDetails SELL;
    OrderActionDetails BUY;
};

struct TradingLog
{
    std::string timeStamp;
    std::string action;
    Decimal price;
    int previousPosition;
    int newPosition;
};

struct HistoricalSnapshots
{
    std::vector<Snapshot>* data = nullptr;
    int index = 0;
};

struct StockState
{
    std::string date;
    // prediction?: number;
    // profitThreshold?: number;
    // lossThreshold?: number;
    bool isStaticIntervals;
    std::string brokerageId;
    Decimal brokerageTradingCostPerShare;
    int sharesPerInterval;
    Decimal intervalProfit;
    Decimal initialPrice;
    Decimal spaceBetweenIntervals;
    int numContracts;
    int position;
    int targetPosition;
    Decimal realizedPnL;
    Decimal realizedPnLAsPercentage;
    Decimal exitPnL;
    Decimal exitPnLAsPercentage;
    Decimal maxMovingProfitAsPercentage;
    Decimal maxMovingLossAsPercentage;
    bool reached_1_percentage_profit;
    Decimal max_loss_when_reached_1_percentage_profit;
    bool reached_0_75_percentage_profit;
    Decimal max_loss_when_reached_0_75_percentage_profit;
    bool reached_0_5_percentage_profit;
    Decimal max_loss_when_reached_0_5_percentage_profit;
    bool reached_0_25_percentage_profit;
    Decimal max_loss_when_reached_0_25_percentage_profit;
    Decimal lastAsk;
    Decimal lastBid;
    std::vector<SmoothingInterval> intervals;
    // std::vector<TradingLog> tradingLogs;
    HistoricalSnapshots historicalSnapshots;
};
