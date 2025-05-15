#pragma once

#include <string>
#include <vector>

#include "types.hpp"

Snapshot ReconcileStockPosition(const std::string& stock, StockState& stockState);

bool IsWideBidAskSpread(const Snapshot& snapshot, const StockState& stockState);

void CheckCrossings(StockState& stockState, const Snapshot& snapshot);

std::vector<int> GetNumToBuy(StockState& stockState, const Snapshot& snapshot);

std::vector<int> GetNumToSell(StockState& stockState, const Snapshot& snapshot);

bool IsSnapshotChange(const Snapshot& snapshot, const StockState& stockState);

void SetNewPosition(
    const std::string& stock,
    StockState& stockState,
    const int& newPosition,
    const Snapshot& snapshot
);

Decimal GetNewNetPositionValue(
    const Decimal& currentPositionValue,
    const Decimal& commissionPerShare,
    const std::string& orderSide,
    const int& newPosition,
    const int& previousPosition,
    const Decimal& priceSetAt
);

void UpdateSnaphotOnState(StockState& stockState, const Snapshot& snapshot);

void CorrectBadBuyIfRequired(
    StockState& stockState, std::vector<int>& indexesToExecute
);

void CorrectBadSellIfRequired(
    StockState& stockState, std::vector<int>& indexesToExecute
);

void AddSkippedBuysIfRequired(
    StockState& stockState, std::vector<int>& indexesToExecute
);

void AddSkippedSellsIfRequired(
    StockState& stockState, std::vector<int>& indexesToExecute
);

void SetRealizedPnL(StockState& stockState);

void UpdateExitPnL(StockState& stockState);

void ReconcileRealizedPnLWhenHistoricalSnapshotsExhausted(StockState& stockState);
