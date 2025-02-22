#include "price_simulator.hpp"

#include <format>
#include <random>

using namespace std;

const Decimal INITIAL_PRICE = GetDecimal(12.75);
Decimal randomPrice = INITIAL_PRICE;

Decimal GetRandomPrice()
{
    Decimal tickDown = randomPrice - GetDecimal(0.01);
    Decimal tickUp = randomPrice + GetDecimal(0.01);

    mt19937 random_engine{random_device{}()};
    uniform_real_distribution<> distribution{0.0, 1.0};

    Decimal probabilityOfTickDown = GetDecimal(distribution(random_engine));

    randomPrice = (probabilityOfTickDown <= 0.5) ? tickDown : tickUp;

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
