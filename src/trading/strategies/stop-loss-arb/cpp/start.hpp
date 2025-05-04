#pragma once

#include <format>
#include <string>
#include <unordered_map>

#include "types.hpp"

void StartStopLossArbCpp(
    std::vector<std::unordered_map<std::string, StockState>>& states_list
);

void StartStopLossArbCppHelper(std::unordered_map<std::string, StockState>& states);

void HedgeStockWhileMarketIsOpen(
    const std::string& stock, std::unordered_map<std::string, StockState>& states
);
