#pragma once

#include "types.hpp"

void DebugRandomPrices(
    const Snapshot& snapshot, const std::string& stock,
    std::unordered_map<std::string, StockState>& states,
    const std::unordered_map<std::string, StockState>& originalStates
);
