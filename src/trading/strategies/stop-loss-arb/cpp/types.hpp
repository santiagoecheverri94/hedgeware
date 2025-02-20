#pragma once

#include <optional>

#include "utils.hpp"

struct Snapshot
{
    Decimal ask;
    Decimal bid;
    std::string timestamp;
};

struct SmoothingInterval
{
    struct OrderActionDetails
    {
        bool active;
        bool crossed;
        Decimal price;
    };

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
    Decimal tradingCosts;
};

struct StockState
{
    std::optional<bool> isStaticIntervals;
    std::string brokerageId;
    Decimal brokerageTradingCostPerShare;
    int sharesPerInterval;
    Decimal intervalProfit;
    Decimal callStrikePrice;
    Decimal initialPrice;
    Decimal putStrikePrice;
    Decimal spaceBetweenIntervals;
    int numContracts;
    int position;
    int targetPosition;
    std::vector<SmoothingInterval> intervals;
    std::vector<TradingLog> tradingLogs;
    Decimal tradingCosts;
    std::optional<Decimal> lastAsk;
    std::optional<Decimal> lastBid;
};
