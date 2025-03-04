#include "price_simulator.hpp"

#include <format>
#include <random>

using namespace std;

bool IsTruthyEnv(const char* envName)
{
    const char* val = std::getenv(envName);
    if (val == nullptr)
    {
        return false;
    }

    std::string value = val;
    // Empty string is considered false, any other value is true
    // This matches JavaScript's Boolean() behavior
    return !value.empty() && value != "0" && value != "false" && value != "undefined" &&
           value != "null";
}

bool IsRandomSnapshot() { return IsTruthyEnv("RANDOM_SNAPSHOT"); }

bool IsHistoricalSnapshot() { return IsTruthyEnv("HISTORICAL_SNAPSHOT"); }

bool IsLiveTrading() { return !IsRandomSnapshot() && !IsHistoricalSnapshot(); }

const Decimal INITIAL_PRICE = GetDecimal(9.0);
Decimal randomPrice = INITIAL_PRICE;

Decimal GetRandomPrice()
{
    Decimal tickDown = randomPrice - GetDecimal(0.01);
    Decimal tickUp = randomPrice + GetDecimal(0.01);

    mt19937 random_engine{random_device{}()};
    uniform_real_distribution<> distribution{0.0, 1.0};

    Decimal probabilityOfTickDown = GetDecimal(distribution(random_engine));

    randomPrice = (probabilityOfTickDown <= GetDecimal(0.49)) ? tickDown : tickUp;

    return randomPrice;
}

Snapshot GetRandomSnapshot()
{
    Snapshot snapshot;

    auto random_price = GetRandomPrice();

    snapshot.ask = random_price;
    snapshot.bid = random_price - Decimal(GetDecimal(0.01));

    return snapshot;
}

Snapshot GetSimulatedSnapshot(std::string stock) { return GetRandomSnapshot(); }

void RestartRandomPrice() { randomPrice = INITIAL_PRICE; }
