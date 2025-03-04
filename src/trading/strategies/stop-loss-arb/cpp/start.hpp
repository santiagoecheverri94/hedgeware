#pragma once

#include <format>
#include <string>
#include <unordered_map>

#include "types.hpp"

void StartStopLossArbCpp(
    const std::vector<std::string>& stocks,
    std::unordered_map<std::string, StockState>& states
);

void HedgeStockWhileMarketIsOpen(
    const std::string& stock, std::unordered_map<std::string, StockState>& states
);

bool IsExitPnlBeyondThresholds(const StockState& stockState);
