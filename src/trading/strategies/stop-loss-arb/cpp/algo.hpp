#pragma once

#include <string>
#include <vector>

#include "types.hpp"

Snapshot ReconcileStockPosition(const std::string& stock, StockState& stockState);

bool IsWideBidAskSpread(const Snapshot& snapshot, const StockState& stockState);

bool CheckCrossings(StockState& stockState, const Snapshot& snapshot);

std::vector<int> GetNumToBuy(StockState& stockState, const Snapshot& snapshot);

std::vector<int> GetNumToSell(StockState& stockState, const Snapshot& snapshot);

bool IsSnapshotChange(const Snapshot& snapshot, const StockState& stockState);

void SetNewPosition(
    const std::string& stock,
    StockState& stockState,
    int newPosition,
    const Snapshot& snapshot,
    std::string orderSide
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

void UpdateRealizedPnL(
    StockState& stockState,
    const std::vector<int>& executedIndices,
    const std::string& orderSide,
    Decimal price
);

void UpdateSnaphotOnState(
    const std::string& stock, StockState& stockState, const Snapshot& snapshot
);

void UpdateExitPnL(StockState& stockState);
