#pragma once

#include "types.hpp"
#include "utils.hpp"

Snapshot GetSimulatedSnapshot(StockState stock_state);

void RestartRandomPrice();

bool IsRandomSnapshot();

bool IsHistoricalSnapshot();

bool IsLiveTrading();

bool IsHistoricalSnapshotsExhausted(std::string stock);

void DeleteHistoricalSnapshots(std::string stock);
