#pragma once

#include <filesystem>
#include <nlohmann/json.hpp>
#include <string>
#include <unordered_map>

#include "types.hpp"

std::unordered_map<std::string, StockState> GetHistoricalStockStatesForDate(
    const std::string& date, const PartialStockState& partial_stock_state
);

std::vector<std::filesystem::path> GetJsonFilePaths(const std::filesystem::path& dir);

nlohmann::json ReadJSONFile(const std::filesystem::path& json_file_path);

StockState GetInitialStockState(
    const std::string& date,
    const std::string& ticker,
    const Decimal& initial_ask_price,
    const PartialStockState& partial_stock_state
);

std::vector<SmoothingInterval> GetLongIntervalsAboveInitialPrice(
    const StockState& stock_state
);

std::vector<SmoothingInterval> GetShortIntervalsBelowInitialPrice(
    const StockState& stock_state
);
