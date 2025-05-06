#pragma once

#include <filesystem>

#include "types.hpp"
#include "utils.hpp"

Snapshot GetSimulatedSnapshot(StockState& stock_state);

void RestartRandomPrice();

bool IsRandomSnapshot();

bool IsHistoricalSnapshot();

bool IsHistoricalSnapshotsExhausted(const StockState& stock_state);

void DeleteHistoricalSnapshots(StockState& stock_state);

void WritePnLAsPercentagesToSnapshotsFile(const StockState& stock_state);

std::filesystem::path GetDirWithStocksDataOnDate(const std::string& date);
