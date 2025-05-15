#pragma once

#include <format>
#include <string>
#include <unordered_map>

#include "types.hpp"

void StartStopLossArbCpp(
    const std::vector<std::vector<std::string>>& lists_of_list_of_dates,
    const PartialStockState& partial_stock_state
);

struct AggResults
{
    int num_stocks;
    int num_stocks_profitable;
};

AggResults StartMultiDayStopLossArb(
    const std::vector<std::string>& list_of_dates,
    const PartialStockState& partial_stock_state
);

AggResults StartDailyStopLossArb(
    const std::string date, const PartialStockState& partial_stock_state
);

void StartStopLossArb(std::unordered_map<std::string, StockState>& states);

void HedgeStockWhileMarketIsOpen(
    const std::string& stock, std::unordered_map<std::string, StockState>& states
);

AggResults GetAggregateResults(
    const std::unordered_map<std::string, StockState>& states
);

bool IsStockProfitable(const StockState& stockState);
