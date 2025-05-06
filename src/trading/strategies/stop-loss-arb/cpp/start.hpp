#pragma once

#include <format>
#include <string>
#include <unordered_map>

#include "types.hpp"

void StartStopLossArbCpp(
    const std::vector<std::vector<std::string>>& lists_of_list_of_dates,
    const PartialStockState& partial_stock_state
);

void StartMultiDayStopLossArb(
    const std::vector<std::string>& list_of_dates,
    const PartialStockState& partial_stock_state
);

void StartDailyStopLossArb(
    const std::string date, const PartialStockState& partial_stock_state
);

void StartStopLossArb(std::unordered_map<std::string, StockState>& states);

void HedgeStockWhileMarketIsOpen(
    const std::string& stock, std::unordered_map<std::string, StockState>& states
);
