#include "js_bindings.hpp"

#include "utils.hpp"

using namespace std;

std::vector<std::vector<std::string>> BindJsListOfListOfDatesToCppListOfListOfDates(
    const JS::Array& js_list_of_list_of_dates
)
{
    int outer_length = js_list_of_list_of_dates.Length();
    std::vector<std::vector<std::string>> result;
    result.reserve(outer_length);

    for (int i = 0; i < outer_length; ++i)
    {
        JS::Array js_inner_list = js_list_of_list_of_dates[i].As<JS::Array>();
        int inner_length = js_inner_list.Length();
        std::vector<std::string> inner_result;
        inner_result.reserve(inner_length);

        for (int j = 0; j < inner_length; ++j)
        {
            std::string date = js_inner_list.Get(j).As<JS::String>().Utf8Value();
            inner_result.push_back(date);
        }

        result.push_back(inner_result);
    }

    return result;
}

PartialStockState BindJsPartialStockStateToCppMap(
    const JS::Object& js_partial_stock_argument
)
{
    PartialStockState result;

    JS::Array keys = js_partial_stock_argument.GetPropertyNames();
    for (size_t i = 0; i < keys.Length(); ++i)
    {
        const string key = keys.Get(i).As<JS::String>().Utf8Value();
        JS::Value value = js_partial_stock_argument.Get(key);

        if (value.IsString())
        {
            result[key] = value.As<JS::String>().Utf8Value();
        }
        else if (value.IsBoolean())
        {
            result[key] = value.As<JS::Boolean>().Value();
        }
        else if (value.IsNumber())
        {
            const string number_as_string =
                value.As<JS::Number>().ToString().Utf8Value();
            result[key] = Decimal(number_as_string);
        }
    }

    return result;
}

std::vector<std::vector<std::unordered_map<std::string, StockState>>>
BindJsListOfStatesListToCppListOfStatesList(const JS::Array& js_states_list)
{
    int length = js_states_list.Length();

    std::vector<std::vector<std::unordered_map<std::string, StockState>>> result;
    result.reserve(length);

    for (int i = 0; i < length; ++i)
    {
        JS::Array js_states = js_states_list[i].As<JS::Array>();

        std::vector<std::unordered_map<std::string, StockState>> cpp_states_list =
            BindJsStatesListToCppStatesList(js_states);

        result.push_back(cpp_states_list);
    }

    return result;
}

std::vector<std::unordered_map<std::string, StockState>>
BindJsStatesListToCppStatesList(const JS::Array& js_states_list)
{
    int length = js_states_list.Length();

    std::vector<std::unordered_map<std::string, StockState>> result;
    result.reserve(length);

    for (int i = 0; i < length; ++i)
    {
        JS::Value js_state = js_states_list[i];
        result.push_back(BindJsStatesToCppStates(js_state.As<JS::Object>()));
    }

    return result;
}

std::unordered_map<std::string, StockState> BindJsStatesToCppStates(
    const JS::Object& js_states
)
{
    unordered_map<string, StockState> cpp_stock_states;

    JS::Array stocks = js_states.GetPropertyNames();
    for (int i = 0; i < static_cast<int>(stocks.Length()); ++i)
    {
        string stock = stocks.Get(i).As<JS::String>().Utf8Value();
        JS::Object js_stock_state = js_states.Get(stock).As<JS::Object>();

        StockState cpp_stock_state{};

        cpp_stock_state.date = js_stock_state.Get("date").As<JS::String>().Utf8Value();

        cpp_stock_state.isStaticIntervals =
            js_stock_state.Get("isStaticIntervals").As<JS::Boolean>().Value();

        cpp_stock_state.brokerageId =
            js_stock_state.Get("brokerageId").As<JS::String>().Utf8Value();

        cpp_stock_state.brokerageTradingCostPerShare =
            GetDecimal(js_stock_state.Get("brokerageTradingCostPerShare")
                           .As<JS::Number>()
                           .DoubleValue());

        cpp_stock_state.sharesPerInterval =
            js_stock_state.Get("sharesPerInterval").As<JS::Number>().Int32Value();

        cpp_stock_state.intervalProfit = GetDecimal(
            js_stock_state.Get("intervalProfit").As<JS::Number>().DoubleValue()
        );

        cpp_stock_state.initialPrice =
            GetDecimal(js_stock_state.Get("initialPrice").As<JS::Number>().DoubleValue()
            );

        cpp_stock_state.spaceBetweenIntervals = GetDecimal(
            js_stock_state.Get("spaceBetweenIntervals").As<JS::Number>().DoubleValue()
        );

        cpp_stock_state.numContracts =
            js_stock_state.Get("numContracts").As<JS::Number>().Int32Value();

        cpp_stock_state.position =
            js_stock_state.Get("position").As<JS::Number>().Int32Value();

        cpp_stock_state.targetPosition =
            js_stock_state.Get("targetPosition").As<JS::Number>().Int32Value();

        cpp_stock_state.realizedPnL =
            GetDecimal(js_stock_state.Get("realizedPnL").As<JS::Number>().DoubleValue()
            );

        cpp_stock_state.realizedPnLAsPercentage = GetDecimal(
            js_stock_state.Get("realizedPnLAsPercentage").As<JS::Number>().DoubleValue()
        );

        cpp_stock_state.exitPnL =
            GetDecimal(js_stock_state.Get("exitPnL").As<JS::Number>().DoubleValue());

        cpp_stock_state.exitPnLAsPercentage = GetDecimal(
            js_stock_state.Get("exitPnLAsPercentage").As<JS::Number>().DoubleValue()
        );

        cpp_stock_state.maxMovingProfitAsPercentage =
            GetDecimal(js_stock_state.Get("maxMovingProfitAsPercentage")
                           .As<JS::Number>()
                           .DoubleValue());

        cpp_stock_state.maxMovingLossAsPercentage =
            GetDecimal(js_stock_state.Get("maxMovingLossAsPercentage")
                           .As<JS::Number>()
                           .DoubleValue());

        cpp_stock_state.lastAsk =
            GetDecimal(js_stock_state.Get("lastAsk").As<JS::Number>().DoubleValue());

        cpp_stock_state.lastBid =
            GetDecimal(js_stock_state.Get("lastBid").As<JS::Number>().DoubleValue());

        JS::Array js_intervals = js_stock_state.Get("intervals").As<JS::Array>();
        for (int j = 0; j < static_cast<int>(js_intervals.Length()); ++j)
        {
            JS::Object js_interval = js_intervals.Get(j).As<JS::Object>();
            SmoothingInterval cpp_interval;

            std::string typeStr = js_interval.Get("type").As<JS::String>().Utf8Value();
            cpp_interval.type =
                (typeStr == "LONG") ? IntervalType::LONG : IntervalType::SHORT;

            cpp_interval.positionLimit =
                js_interval.Get("positionLimit").As<JS::Number>().Int32Value();

            JS::Object js_sell = js_interval.Get("SELL").As<JS::Object>();
            cpp_interval.SELL.active = js_sell.Get("active").As<JS::Boolean>().Value();
            cpp_interval.SELL.crossed =
                js_sell.Get("crossed").As<JS::Boolean>().Value();
            cpp_interval.SELL.price =
                GetDecimal(js_sell.Get("price").As<JS::Number>().DoubleValue());

            if (js_sell.Has("boughtAtPrice") && !js_sell.Get("boughtAtPrice").IsNull())
            {
                cpp_interval.SELL.boughtAtPrice = GetDecimal(
                    js_sell.Get("boughtAtPrice").As<JS::Number>().DoubleValue()
                );
            }

            JS::Object js_buy = js_interval.Get("BUY").As<JS::Object>();
            cpp_interval.BUY.active = js_buy.Get("active").As<JS::Boolean>().Value();
            cpp_interval.BUY.crossed = js_buy.Get("crossed").As<JS::Boolean>().Value();
            cpp_interval.BUY.price =
                GetDecimal(js_buy.Get("price").As<JS::Number>().DoubleValue());

            if (js_buy.Has("soldAtPrice") && !js_buy.Get("soldAtPrice").IsNull())
            {
                cpp_interval.BUY.soldAtPrice =
                    GetDecimal(js_buy.Get("soldAtPrice").As<JS::Number>().DoubleValue()
                    );
            }

            cpp_stock_state.intervals.push_back(cpp_interval);
        }

        cpp_stock_states[stock] = cpp_stock_state;
    }

    return cpp_stock_states;
}

JS::Object BindCppStatesToJsStates(
    JS::Env env, const std::unordered_map<std::string, StockState>& cpp_states
)
{
    JS::Object js_states = JS::Object::New(env);

    for (const auto& [key, cpp_state] : cpp_states)
    {
        JS::Object js_state = JS::Object::New(env);

        js_state.Set("date", JS::String::New(env, cpp_state.date));

        js_state.Set(
            "isStaticIntervals", JS::Boolean::New(env, cpp_state.isStaticIntervals)
        );

        js_state.Set("brokerageId", JS::String::New(env, cpp_state.brokerageId));

        js_state.Set(
            "brokerageTradingCostPerShare",
            JS::Number::New(
                env, cpp_state.brokerageTradingCostPerShare.convert_to<double>()
            )
        );

        js_state.Set(
            "sharesPerInterval", JS::Number::New(env, cpp_state.sharesPerInterval)
        );

        js_state.Set(
            "intervalProfit",
            JS::Number::New(env, cpp_state.intervalProfit.convert_to<double>())
        );

        js_state.Set(
            "initialPrice",
            JS::Number::New(env, cpp_state.initialPrice.convert_to<double>())
        );

        js_state.Set(
            "spaceBetweenIntervals",
            JS::Number::New(env, cpp_state.spaceBetweenIntervals.convert_to<double>())
        );

        js_state.Set("numContracts", JS::Number::New(env, cpp_state.numContracts));

        js_state.Set("position", JS::Number::New(env, cpp_state.position));

        js_state.Set("targetPosition", JS::Number::New(env, cpp_state.targetPosition));

        js_state.Set(
            "realizedPnL",
            JS::Number::New(env, cpp_state.realizedPnL.convert_to<double>())
        );

        js_state.Set(
            "realizedPnLAsPercentage",
            JS::Number::New(env, cpp_state.realizedPnLAsPercentage.convert_to<double>())
        );

        js_state.Set(
            "exitPnL", JS::Number::New(env, cpp_state.exitPnL.convert_to<double>())
        );

        js_state.Set(
            "exitPnLAsPercentage",
            JS::Number::New(env, cpp_state.exitPnLAsPercentage.convert_to<double>())
        );

        js_state.Set(
            "maxMovingProfitAsPercentage",
            JS::Number::New(
                env, cpp_state.maxMovingProfitAsPercentage.convert_to<double>()
            )
        );

        js_state.Set(
            "maxMovingLossAsPercentage",
            JS::Number::New(
                env, cpp_state.maxMovingLossAsPercentage.convert_to<double>()
            )
        );

        js_state.Set(
            "lastAsk", JS::Number::New(env, cpp_state.lastAsk.convert_to<double>())
        );

        js_state.Set(
            "lastBid", JS::Number::New(env, cpp_state.lastBid.convert_to<double>())
        );

        JS::Array js_intervals = JS::Array::New(env, cpp_state.intervals.size());
        for (size_t i = 0; i < cpp_state.intervals.size(); ++i)
        {
            const SmoothingInterval& cpp_interval = cpp_state.intervals[i];
            JS::Object js_interval = JS::Object::New(env);

            std::string typeStr =
                (cpp_interval.type == IntervalType::LONG) ? "LONG" : "SHORT";
            js_interval.Set("type", JS::String::New(env, typeStr));

            js_interval.Set(
                "positionLimit", JS::Number::New(env, cpp_interval.positionLimit)
            );

            JS::Object js_sell = JS::Object::New(env);
            js_sell.Set("active", JS::Boolean::New(env, cpp_interval.SELL.active));
            js_sell.Set("crossed", JS::Boolean::New(env, cpp_interval.SELL.crossed));
            js_sell.Set(
                "price",
                JS::Number::New(env, cpp_interval.SELL.price.convert_to<double>())
            );

            if (cpp_interval.SELL.boughtAtPrice.has_value())
            {
                js_sell.Set(
                    "boughtAtPrice",
                    JS::Number::New(
                        env,
                        cpp_interval.SELL.boughtAtPrice.value().convert_to<double>()
                    )
                );
            }
            else
            {
                js_sell.Set("boughtAtPrice", env.Null());
            }

            js_interval.Set("SELL", js_sell);

            JS::Object js_buy = JS::Object::New(env);
            js_buy.Set("active", JS::Boolean::New(env, cpp_interval.BUY.active));
            js_buy.Set("crossed", JS::Boolean::New(env, cpp_interval.BUY.crossed));
            js_buy.Set(
                "price",
                JS::Number::New(env, cpp_interval.BUY.price.convert_to<double>())
            );

            if (cpp_interval.BUY.soldAtPrice.has_value())
            {
                js_buy.Set(
                    "soldAtPrice",
                    JS::Number::New(
                        env, cpp_interval.BUY.soldAtPrice.value().convert_to<double>()
                    )
                );
            }
            else
            {
                js_buy.Set("soldAtPrice", env.Null());
            }

            js_interval.Set("BUY", js_buy);

            js_intervals.Set(i, js_interval);
        }
        js_state.Set("intervals", js_intervals);

        js_states.Set(key, js_state);
    }

    return js_states;
}
