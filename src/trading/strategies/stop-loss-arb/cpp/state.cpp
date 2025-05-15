#include "state.hpp"

#include <filesystem>
#include <fstream>

#include "data.hpp"
#include "price_simulator.hpp"

using json = nlohmann::json;

using namespace std;

std::unordered_map<std::string, StockState> GetFilteredStockStates(
    const std::unordered_map<std::string, StockState>& stock_states
)
{
    unordered_map<string, StockState> filtered_stock_states{};
    vector<StockState> filtered_stock_states_vector{};

    // On the function below add a field to stockState that we can use to easily
    // sort it over here

    return filtered_stock_states;
}

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

        // if volume value low, continue
        const auto volume_value_double =
            stock_file_data
                ["first_n_minutes_volume_value_as_prev_day_mkt_cap_percentage"]
                    .get<double>();
        const Decimal volume_value = GetDecimal(volume_value_double);
        if (volume_value < Decimal("0.75"))
        {
            continue;
        }

        // ------------------ BEGIN MKT CAP FILTERING ------------------

        // const auto mkt_cap_double =
        //     stock_file_data["prev_day_market_cap"].get<double>();
        // const Decimal mkt_cap = GetDecimal(mkt_cap_double);

        // // [1B,)
        // if (mkt_cap < Decimal(1'000'000'000))
        // {
        //     continue;
        // }

        // // [500M, 1B)
        // if (mkt_cap < GetDecimal(500'000'000) || mkt_cap >= Decimal(1'000'000'000))
        // {
        //     continue;
        // }

        // ...

        // // [100M, 200M)
        // if (mkt_cap < GetDecimal(100'000'000) || mkt_cap >= Decimal(200'000'000))
        // {
        //     continue;
        // }

        // ------------------ END MKT CAP FILTERING ------------------

        // ------------------ BEGIN PRICE FILTERING ------------------

        const Decimal price = GetFirstNMinutesClosePrice(stock_file_data);

        // [7, 10)
        if (price < GetDecimal(7) || price >= GetDecimal(10))
        {
            continue;
        }

        // [9, 10)
        // if (price < GetDecimal(9) || price >= GetDecimal(10))
        // {
        //     continue;
        // }
        
        // // [8, 9)
        // if (price < GetDecimal(8) || price >= GetDecimal(9))
        // {
        //     continue;
        // }
        
        // // [7, 8)
        // if (price < GetDecimal(7) || price >= GetDecimal(8))
        // {
        //     continue;
        // }
        
        // // [6, 7)
        // if (price < GetDecimal(6) || price >= GetDecimal(7))
        // {
        //     continue;
        // }

        // // [5, 6)
        // if (price < GetDecimal(5) || price >= GetDecimal(6))
        // {
        //     continue;
        // }

        // // [4, 5)
        // if (price < GetDecimal(4) || price >= GetDecimal(5))
        // {
        //     continue;
        // }

        // [3p5, 4)
        // if (price < GetDecimal(3.5) || price >= GetDecimal(4))
        // {
        //     continue;
        // }

        // ------------------ END OF PRICE FILTERING ------------------

        // // if percentage change low, continue
        // const auto raw_time_steps = stock_file_data["raw_time_steps"];

        // const int len_expected_time_steps = 55;

        // const int len_raw_time_steps = raw_time_steps.size();
        // if (len_raw_time_steps != len_expected_time_steps)
        // {
        //     throw runtime_error(
        //         format(
        //             "The code is currently setup to support only {} time steps",
        //             len_expected_time_steps
        //         ) +
        //         file.string()
        //     );
        // }

        // const auto first_n_minutes_candle = raw_time_steps[0];
        // const auto last_n_minutes_candle = raw_time_steps[len_expected_time_steps -
        // 1]; if (first_n_minutes_candle.is_null() || last_n_minutes_candle.is_null())
        // {
        //     continue;
        // }

        // const Decimal first_n_minues_open_price =
        //     GetDecimal(first_n_minutes_candle["open"].get<double>());

        // const Decimal first_n_minues_close_price =
        //     GetDecimal(last_n_minutes_candle["close"].get<double>());

        // const Decimal percentage_change =
        //     ((first_n_minues_close_price - first_n_minues_open_price) /
        //      first_n_minues_open_price) *
        //     100;

        // const Decimal percentage_change_abs = abs(percentage_change);

        // if (percentage_change_abs < Decimal("2.0"))
        // {
        //     continue;
        // }

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
    new_stock_state.isStaticIntervals =
        get<bool>(partial_stock_state.at("isStaticIntervals"));

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

        intervals.push_back(interval);
    }

    return intervals;
}
