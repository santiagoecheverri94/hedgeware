#include "state.hpp"

#include <filesystem>
#include <fstream>

#include "price_simulator.hpp"

using json = nlohmann::json;

using namespace std;

std::unordered_map<std::string, StockState> GetHistoricalStockStatesForDate(
    const std::string& date, const PartialStockState& partial_stock_state
)
{
    const auto dir = GetDirWithStocksDataOnDate(date);

    const auto json_files = GetJsonFilePaths(dir);

    std::unordered_map<std::string, StockState> stock_states{};
    for (const auto& file : json_files)
    {
        json stock_file_data{};
        try
        {
            stock_file_data = ReadJSONFile(file);
        }
        catch (const std::exception& e)
        {
            Print("\nError reading JSON file: " + file.string() + "\n");
            continue;
        }

        const auto ticker = stock_file_data["ticker"].get<string>();

        const auto initial_ask_price_double =
            stock_file_data["snapshots"][0]["ask"].get<double>();
        const Decimal initial_ask_price = GetDecimal(initial_ask_price_double);

        auto stock_state =
            GetInitialStockState(date, ticker, initial_ask_price, partial_stock_state);

        stock_states[ticker] = stock_state;
    }

    return stock_states;
}

std::vector<std::filesystem::path> GetJsonFilePaths(const std::filesystem::path& dir)
{
    vector<filesystem::path> jsonFilePaths{};

    for (const auto& entry : filesystem::directory_iterator(dir))
    {
        if (entry.is_regular_file() && entry.path().extension() == ".json")
        {
            jsonFilePaths.push_back(entry.path());
        }
    }

    return jsonFilePaths;
}

nlohmann::json ReadJSONFile(const std::filesystem::path& json_file_path)
{
    std::ifstream file(json_file_path);
    if (!file.is_open())
    {
        cerr << "Failed to open file: " << json_file_path << endl;
        return "";
    }

    json json_data;

    file >> json_data;

    return json_data;
}

StockState GetInitialStockState(
    const std::string& date,
    const std::string& ticker,
    const Decimal& initial_ask_price,
    const PartialStockState& partial_stock_state
)
{
    StockState new_stock_state{};

    new_stock_state.date = date;
    new_stock_state.brokerageId = ticker;
    new_stock_state.brokerageTradingCostPerShare =
        get<Decimal>(partial_stock_state.at("brokerageTradingCostPerShare"));
    new_stock_state.targetPosition =
        get<Decimal>(partial_stock_state.at("targetPosition")).convert_to<int>();
    new_stock_state.sharesPerInterval =
        get<Decimal>(partial_stock_state.at("sharesPerInterval")).convert_to<int>();
    new_stock_state.spaceBetweenIntervals =
        get<Decimal>(partial_stock_state.at("spaceBetweenIntervals"));
    new_stock_state.intervalProfit =
        get<Decimal>(partial_stock_state.at("intervalProfit"));
    new_stock_state.numContracts =
        get<Decimal>(partial_stock_state.at("numContracts")).convert_to<int>();
    new_stock_state.initialPrice = initial_ask_price;
    new_stock_state.profitThreshold =
        get<Decimal>(partial_stock_state.at("profitThreshold"));
    new_stock_state.lossThreshold =
        get<Decimal>(partial_stock_state.at("lossThreshold"));

    std::vector<SmoothingInterval> intervals{};
    auto long_intervals = GetLongIntervalsAboveInitialPrice(new_stock_state);
    auto short_intervals = GetShortIntervalsBelowInitialPrice(new_stock_state);
    intervals.insert(intervals.end(), long_intervals.begin(), long_intervals.end());
    intervals.insert(intervals.end(), short_intervals.begin(), short_intervals.end());

    new_stock_state.intervals = intervals;

    return new_stock_state;
}

std::vector<SmoothingInterval> GetLongIntervalsAboveInitialPrice(
    const StockState& stock_state
)
{
    std::vector<SmoothingInterval> intervals{};
    const int numIntervals = stock_state.targetPosition / stock_state.sharesPerInterval;

    for (int index = 1; index <= numIntervals + 1; ++index)
    {
        Decimal spaceFromBaseInterval =
            GetDecimal(index) * stock_state.spaceBetweenIntervals;
        Decimal sellPrice = stock_state.initialPrice + spaceFromBaseInterval;

        SmoothingInterval interval{};
        interval.type = IntervalType::LONG;
        interval.positionLimit = stock_state.sharesPerInterval * index;

        interval.SELL.price = sellPrice;
        interval.SELL.active = false;
        interval.SELL.crossed = false;
        interval.SELL.boughtAtPrice = std::nullopt;

        interval.BUY.price = sellPrice - stock_state.intervalProfit;
        interval.BUY.active = true;
        interval.BUY.crossed = true;

        intervals.insert(intervals.begin(), interval);  // unshift
    }

    return intervals;
}

std::vector<SmoothingInterval> GetShortIntervalsBelowInitialPrice(
    const StockState& stock_state
)
{
    std::vector<SmoothingInterval> intervals{};
    const int numIntervals = stock_state.targetPosition / stock_state.sharesPerInterval;

    for (int index = 1; index <= numIntervals + 1; ++index)
    {
        Decimal spaceFromBaseInterval =
            GetDecimal(index) * stock_state.spaceBetweenIntervals;
        Decimal buyPrice = stock_state.initialPrice - spaceFromBaseInterval;

        SmoothingInterval interval{};
        interval.type = IntervalType::SHORT;
        interval.positionLimit = -(stock_state.sharesPerInterval * index);

        interval.SELL.price = buyPrice + stock_state.intervalProfit;
        interval.SELL.active = true;
        interval.SELL.crossed = true;

        interval.BUY.price = buyPrice;
        interval.BUY.active = false;
        interval.BUY.crossed = false;
        interval.BUY.soldAtPrice = std::nullopt;

        intervals.push_back(interval);
    }

    return intervals;
}
