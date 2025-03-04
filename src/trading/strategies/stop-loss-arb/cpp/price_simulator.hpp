#pragma once

#include "types.hpp"
#include "utils.hpp"

Snapshot GetSimulatedSnapshot(std::string stock);

void RestartRandomPrice();

bool IsRandomSnapshot();

bool IsHistoricalSnapshot();

bool IsLiveTrading();
