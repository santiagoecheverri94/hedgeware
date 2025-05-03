#include "price_simulator.hpp"

#include <filesystem>
#include <format>
#include <fstream>
#include <nlohmann/json.hpp>
#include <random>
#include <shared_mutex>

using namespace std;
using json = nlohmann::json;

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
    Snapshot snapshot{};

    auto random_price = GetRandomPrice();

    snapshot.ask = random_price;
    snapshot.bid = random_price - Decimal(GetDecimal(0.01));

    return snapshot;
}

void RestartRandomPrice() { randomPrice = INITIAL_PRICE; }

void DeleteHistoricalSnapshots(StockState& stock_state)
{
    delete stock_state.historicalSnapshots.data;
}

string GetFilePathForStockDataOnDate(const StockState& stock_state)
{
    const string cwd = filesystem::current_path().string();
    const string year = string_split(stock_state.date, '-')[0];
    const string month = string_split(stock_state.date, '-')[1];

    return format(
        "{}\\..\\deephedge\\historical-data\\{}\\{}\\{}\\{}.json",
        cwd,
        year,
        month,
        stock_state.date,
        stock_state.brokerageId
    );
}

void WritePnLAsPercentagesToSnapshotsFile(const StockState& stock_state)
{
    string file_path = GetFilePathForStockDataOnDate(stock_state);

    try
    {
        std::ifstream file(file_path);
        if (!file.is_open())
        {
            throw runtime_error(
                format("Error: Unable to open file {}", file_path).c_str()
            );
        }

        json json_data;
        file >> json_data;

        json_data["max_moving_profit_as_percentage"] =
            stock_state.maxMovingProfitAsPercentage.convert_to<double>();

        json_data["max_moving_loss_as_percentage"] =
            stock_state.maxMovingLossAsPercentage.convert_to<double>();

        json_data["reached_1_percentage_profit"] =
            stock_state.reached_1_percentage_profit;
        json_data["max_loss_when_reached_1_percentage_profit"] =
            stock_state.max_loss_when_reached_1_percentage_profit.convert_to<double>();

        json_data["reached_0_75_percentage_profit"] =
            stock_state.reached_0_75_percentage_profit;
        json_data["max_loss_when_reached_0_75_percentage_profit"] =
            stock_state.max_loss_when_reached_0_75_percentage_profit.convert_to<double>(
            );

        json_data["reached_0_5_percentage_profit"] =
            stock_state.reached_0_5_percentage_profit;
        json_data["max_loss_when_reached_0_5_percentage_profit"] =
            stock_state.max_loss_when_reached_0_5_percentage_profit.convert_to<double>(
            );

        json_data["reached_0_25_percentage_profit"] =
            stock_state.reached_0_25_percentage_profit;
        json_data["max_loss_when_reached_0_25_percentage_profit"] =
            stock_state.max_loss_when_reached_0_25_percentage_profit.convert_to<double>(
            );

        std::ofstream out_file(file_path);
        out_file << json_data.dump();
    }
    catch (const json::parse_error& e)
    {
        throw runtime_error(format("JSON parse error: {}", e.what()).c_str());
    }
    catch (const std::exception& e)
    {
        throw runtime_error(
            format("Error writing pnl to snapshots: {}", e.what()).c_str()
        );
    }
}

vector<Snapshot>* GetSnapshotsForStockOnDate(const StockState& stock_state)
{
    string file_path = GetFilePathForStockDataOnDate(stock_state);
    vector<Snapshot>* data = new vector<Snapshot>();

    try
    {
        std::ifstream file(file_path);
        if (!file.is_open())
        {
            throw runtime_error(
                format("Error: Unable to open file {}", file_path).c_str()
            );
        }

        json json_data;
        file >> json_data;

        const auto& snapshots_json = json_data["snapshots"];

        for (const auto& snapshot_json : snapshots_json)
        {
            Snapshot snapshot{};

            snapshot.ask = GetDecimal(snapshot_json["ask"].get<double>());
            snapshot.bid = GetDecimal(snapshot_json["bid"].get<double>());
            snapshot.timestamp = snapshot_json["timestamp"].get<std::string>();

            data->push_back(snapshot);
        }
    }
    catch (const json::parse_error& e)
    {
        throw runtime_error(format("JSON parse error: {}", e.what()).c_str());
    }
    catch (const std::exception& e)
    {
        throw runtime_error(format("Error reading snapshots: {}", e.what()).c_str());
    }

    return data;
}

struct StockAndDate
{
    string stock;
    string date;
};

Snapshot GetHistoricalSnapshot(StockState& stock_state)
{
    if (stock_state.historicalSnapshots.data == nullptr)
    {
        stock_state.historicalSnapshots.data = GetSnapshotsForStockOnDate(stock_state);
    }

    Snapshot snapshot =
        stock_state.historicalSnapshots.data->at(stock_state.historicalSnapshots.index);

    stock_state.historicalSnapshots.index++;

    return snapshot;
}

Snapshot GetSimulatedSnapshot(StockState& stock_state)
{
    if (IsRandomSnapshot())
    {
        return GetRandomSnapshot();
    }

    if (IsHistoricalSnapshot())
    {
        return GetHistoricalSnapshot(stock_state);
    }

    throw runtime_error("No snapshot type specified");
}

bool IsHistoricalSnapshotsExhausted(const StockState& stock_state)
{
    const bool isExhausted =
        stock_state.historicalSnapshots.index ==
        static_cast<int>(stock_state.historicalSnapshots.data->size());

    return isExhausted;
}
