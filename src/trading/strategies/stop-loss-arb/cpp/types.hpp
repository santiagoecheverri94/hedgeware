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

struct StockState
{
    bool isStaticIntervals;
    std::string brokerageId;
    Decimal brokerageTradingCostPerShare;
    int sharesPerInterval;
    Decimal intervalProfit;
    Decimal initialPrice;
    int shiftIntervalsFromInitialPrice;
    Decimal spaceBetweenIntervals;
    int numContracts;
    int position;
    int targetPosition;
    Decimal realizedPnL;
    Decimal exitPnL;
    Decimal exitPnLAsPercent;
    Decimal maxMovingLossAsPercent;
    Decimal lastAsk;
    Decimal lastBid;
    std::vector<SmoothingInterval> intervals;
    std::vector<TradingLog> tradingLogs;
};
