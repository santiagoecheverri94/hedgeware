#pragma once

#include "types.hpp"
#include "utils.hpp"

Snapshot GetSimulatedSnapshot(StockState& stock_state);

void RestartRandomPrice();

bool IsRandomSnapshot();

bool IsHistoricalSnapshot();

bool IsLiveTrading();

bool IsHistoricalSnapshotsExhausted(const StockState& stock_state);

void DeleteHistoricalSnapshots(StockState& stock_state);

void WritePnLAsPercentagesToSnapshotsFile(const StockState& stock_state);
