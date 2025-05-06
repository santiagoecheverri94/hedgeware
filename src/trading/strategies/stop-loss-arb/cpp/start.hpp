#pragma once

#include <format>
#include <string>
#include <unordered_map>

#include "types.hpp"

void StartStopLossArbCpp(
    std::vector<std::vector<std::unordered_map<std::string, StockState>>>&
        lists_of_list_of_daily_map_of_states
);

void StartMultiDayStopLossArb(
    std::vector<std::unordered_map<std::string, StockState>>&
        list_of_daily_map_of_states
);

void StartDailyStopLossArb(std::unordered_map<std::string, StockState>& states);

void HedgeStockWhileMarketIsOpen(
    const std::string& stock, std::unordered_map<std::string, StockState>& states
);
