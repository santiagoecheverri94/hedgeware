#pragma once

#include <string>
#include <unordered_map>

#include "types.hpp"

void HedgeStockWhileMarketIsOpen(
    const std::string& stock, std::unordered_map<std::string, StockState>& states
);
