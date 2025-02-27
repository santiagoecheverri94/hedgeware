#include "bindings.hpp"

using namespace std;

std::unordered_map<std::string, StockState> BindJsStatesToCppStates(
    const JS::Object& js_states
)
{
    unordered_map<string, StockState> cpp_stock_states;

    JS::Array stocks = js_states.GetPropertyNames();
    for (int i = 0; i < stocks.Length(); ++i)
    {
        string stock = stocks.Get(i).As<JS::String>().Utf8Value();
        JS::Object js_stock_state = js_states.Get(stock).As<JS::Object>();

        StockState cpp_stock_state;

        if (js_stock_state.Has("isStaticIntervals"))
        {
            cpp_stock_state.isStaticIntervals =
                js_stock_state.Get("isStaticIntervals").As<JS::Boolean>().Value();
        }

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

        cpp_stock_state.callStrikePrice = GetDecimal(
            js_stock_state.Get("callStrikePrice").As<JS::Number>().DoubleValue()
        );

        cpp_stock_state.initialPrice =
            GetDecimal(js_stock_state.Get("initialPrice").As<JS::Number>().DoubleValue()
            );

        cpp_stock_state.putStrikePrice = GetDecimal(
            js_stock_state.Get("putStrikePrice").As<JS::Number>().DoubleValue()
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

        if (js_stock_state.Has("lastAsk"))
        {
            cpp_stock_state.lastAsk =
                GetDecimal(js_stock_state.Get("lastAsk").As<JS::Number>().DoubleValue()
                );
        }

        if (js_stock_state.Has("lastBid"))
        {
            cpp_stock_state.lastBid =
                GetDecimal(js_stock_state.Get("lastBid").As<JS::Number>().DoubleValue()
                );
        }

        JS::Array js_intervals = js_stock_state.Get("intervals").As<JS::Array>();
        for (int j = 0; j < js_intervals.Length(); ++j)
        {
            JS::Object js_interval = js_intervals.Get(j).As<JS::Object>();
            SmoothingInterval cpp_interval;

            cpp_interval.positionLimit =
                js_interval.Get("positionLimit").As<JS::Number>().Int32Value();

            JS::Object js_sell = js_interval.Get("SELL").As<JS::Object>();
            cpp_interval.SELL.active = js_sell.Get("active").As<JS::Boolean>().Value();
            cpp_interval.SELL.crossed =
                js_sell.Get("crossed").As<JS::Boolean>().Value();
            cpp_interval.SELL.price =
                GetDecimal(js_sell.Get("price").As<JS::Number>().DoubleValue());

            JS::Object js_buy = js_interval.Get("BUY").As<JS::Object>();
            cpp_interval.BUY.active = js_buy.Get("active").As<JS::Boolean>().Value();
            cpp_interval.BUY.crossed = js_buy.Get("crossed").As<JS::Boolean>().Value();
            cpp_interval.BUY.price =
                GetDecimal(js_buy.Get("price").As<JS::Number>().DoubleValue());

            cpp_stock_state.intervals.push_back(cpp_interval);
        }

        JS::Array js_tradingLogs = js_stock_state.Get("tradingLogs").As<JS::Array>();
        for (int k = 0; k < js_tradingLogs.Length(); ++k)
        {
            JS::Object js_log = js_tradingLogs.Get(k).As<JS::Object>();
            TradingLog cpp_log;

            cpp_log.timeStamp = js_log.Get("timeStamp").As<JS::String>().Utf8Value();
            cpp_log.action = js_log.Get("action").As<JS::String>().Utf8Value();
            cpp_log.price =
                GetDecimal(js_log.Get("price").As<JS::Number>().DoubleValue());
            cpp_log.previousPosition =
                js_log.Get("previousPosition").As<JS::Number>().Int32Value();
            cpp_log.newPosition =
                js_log.Get("newPosition").As<JS::Number>().Int32Value();

            cpp_stock_state.tradingLogs.push_back(cpp_log);
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

        if (cpp_state.isStaticIntervals.has_value())
        {
            js_state.Set(
                "isStaticIntervals",
                JS::Boolean::New(env, cpp_state.isStaticIntervals.value())
            );
        }
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
            "callStrikePrice",
            JS::Number::New(env, cpp_state.callStrikePrice.convert_to<double>())
        );
        js_state.Set(
            "initialPrice",
            JS::Number::New(env, cpp_state.initialPrice.convert_to<double>())
        );
        js_state.Set(
            "putStrikePrice",
            JS::Number::New(env, cpp_state.putStrikePrice.convert_to<double>())
        );
        js_state.Set(
            "spaceBetweenIntervals",
            JS::Number::New(env, cpp_state.spaceBetweenIntervals.convert_to<double>())
        );
        js_state.Set("numContracts", JS::Number::New(env, cpp_state.numContracts));
        js_state.Set("position", JS::Number::New(env, cpp_state.position));
        js_state.Set("targetPosition", JS::Number::New(env, cpp_state.targetPosition));

        if (cpp_state.lastAsk.has_value())
        {
            js_state.Set(
                "lastAsk",
                JS::Number::New(env, cpp_state.lastAsk.value().convert_to<double>())
            );
        }
        if (cpp_state.lastBid.has_value())
        {
            js_state.Set(
                "lastBid",
                JS::Number::New(env, cpp_state.lastBid.value().convert_to<double>())
            );
        }

        JS::Array js_intervals = JS::Array::New(env, cpp_state.intervals.size());
        for (size_t i = 0; i < cpp_state.intervals.size(); ++i)
        {
            const SmoothingInterval& cpp_interval = cpp_state.intervals[i];
            JS::Object js_interval = JS::Object::New(env);

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
            js_interval.Set("SELL", js_sell);

            JS::Object js_buy = JS::Object::New(env);
            js_buy.Set("active", JS::Boolean::New(env, cpp_interval.BUY.active));
            js_buy.Set("crossed", JS::Boolean::New(env, cpp_interval.BUY.crossed));
            js_buy.Set(
                "price",
                JS::Number::New(env, cpp_interval.BUY.price.convert_to<double>())
            );
            js_interval.Set("BUY", js_buy);

            js_intervals.Set(i, js_interval);
        }
        js_state.Set("intervals", js_intervals);

        JS::Array js_tradingLogs = JS::Array::New(env, cpp_state.tradingLogs.size());
        for (size_t j = 0; j < cpp_state.tradingLogs.size(); ++j)
        {
            const TradingLog& cpp_log = cpp_state.tradingLogs[j];
            JS::Object js_log = JS::Object::New(env);

            js_log.Set("timeStamp", JS::String::New(env, cpp_log.timeStamp));
            js_log.Set("action", JS::String::New(env, cpp_log.action));
            js_log.Set(
                "price", JS::Number::New(env, cpp_log.price.convert_to<double>())
            );
            js_log.Set(
                "previousPosition", JS::Number::New(env, cpp_log.previousPosition)
            );
            js_log.Set("newPosition", JS::Number::New(env, cpp_log.newPosition));

            js_tradingLogs.Set(j, js_log);
        }
        js_state.Set("tradingLogs", js_tradingLogs);

        js_states.Set(key, js_state);
    }

    return js_states;
}
