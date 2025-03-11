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
    Snapshot snapshot;

    auto random_price = GetRandomPrice();

    snapshot.ask = random_price;
    snapshot.bid = random_price - Decimal(GetDecimal(0.01));

    return snapshot;
}

void RestartRandomPrice() { randomPrice = INITIAL_PRICE; }

struct HistoricalSnapshotData
{
    vector<Snapshot>* data;
    int index = 0;
};
unordered_map<string, HistoricalSnapshotData> historical_snapshots;
shared_mutex historical_snapshots_mutex;

void DeleteHistoricalSnapshots(std::string stock)
{
    shared_lock read_lock{historical_snapshots_mutex};

    auto data = historical_snapshots[stock].data;
    delete data;
}

string GetFilePathForStockDataOnDate(std::string stock, std::string date)
{
    const string cwd = filesystem::current_path().string();
    const string year = string_split(date, '-')[0];
    const string month = string_split(date, '-')[1];

    return format(
        "{}\\..\\historical-data\\{}\\{}\\{}\\{}.json", cwd, year, month, date, stock
    );
}

vector<Snapshot>* GetSnapshotsForStockOnDate(std::string stock, std::string date)
{
    string file_path = GetFilePathForStockDataOnDate(stock, date);
    vector<Snapshot>* data = new vector<Snapshot>();

    try
    {
        std::ifstream file(file_path);
        if (!file.is_open())
        {
            throw exception(format("Error: Unable to open file {}", file_path).c_str());
        }

        json json_data;
        file >> json_data;

        const auto& snapshots_json = json_data["snapshots"];

        for (const auto& snapshot_json : snapshots_json)
        {
            Snapshot snapshot;

            snapshot.ask = GetDecimal(snapshot_json["ask"].get<double>());
            snapshot.bid = GetDecimal(snapshot_json["bid"].get<double>());
            snapshot.timestamp = snapshot_json["timestamp"].get<std::string>();

            data->push_back(snapshot);
        }
    }
    catch (const json::parse_error& e)
    {
        std::cerr << "JSON parse error: " << e.what() << std::endl;
    }
    catch (const std::exception& e)
    {
        std::cerr << "Error reading snapshots: " << e.what() << std::endl;
    }

    return data;
}

struct StockAndDate
{
    string stock;
    string date;
};

StockAndDate GetStockAndDate(std::string file_name)
{
    vector<string> splitted = string_split(file_name, '__');

    if (splitted.size() != 2)
    {
        throw exception(
            format(
                "Invalid historical snapshot file name: \"{}\" is missing date",
                file_name
            )
                .c_str()
        );
    }

    return StockAndDate{splitted[0], splitted[1]};
}

HistoricalSnapshotData GetHistoricalSnapshotData(StockState stock_state)
{
    // StockAndDate stock_and_date = GetStockAndDate(file_name);

    vector<Snapshot>* data =
        GetSnapshotsForStockOnDate(stock_state.brokerageId, stock_state.date);

    return HistoricalSnapshotData{data, 0};
}

Snapshot GetHistoricalSnapshot(StockState stock_state)
{
    shared_lock read_lock{historical_snapshots_mutex};
    if (!historical_snapshots.contains(stock_state.brokerageId))
    {
        read_lock.unlock();
        unique_lock write_lock{historical_snapshots_mutex};

        historical_snapshots[stock_state.brokerageId] =
            GetHistoricalSnapshotData(stock_state);

        write_lock.unlock();
    }

    if (!read_lock.owns_lock())
    {
        read_lock.lock();
    }

    Snapshot snapshot = historical_snapshots[stock_state.brokerageId].data->at(
        historical_snapshots[stock_state.brokerageId].index
    );

    historical_snapshots[stock_state.brokerageId].index++;

    return snapshot;
}

Snapshot GetSimulatedSnapshot(StockState stock_state)
{
    if (IsRandomSnapshot())
    {
        return GetRandomSnapshot();
    }

    if (IsHistoricalSnapshot())
    {
        return GetHistoricalSnapshot(stock_state);
    }

    throw exception("No snapshot type specified");
}

bool IsHistoricalSnapshotsExhausted(std::string stock)
{
    if (!IsHistoricalSnapshot())
    {
        return false;
    }

    shared_lock read_lock{historical_snapshots_mutex};

    const bool isExhausted =
        historical_snapshots[stock].index == historical_snapshots[stock].data->size();

    return isExhausted;
}
