#include "data.hpp"
#include "js_bindings.hpp"
#include "start.hpp"

#define GET_SYMBOL_NAME(symbol) #symbol

using namespace std;
using namespace JS;

void JsTestCallJSFunction(const JS::CallbackInfo& info)
{
    JS::Env env = info.Env();

    JS::Function callback = info[0].As<JS::Function>();
    callback.Call({JS::String::New(env, "string from cpp"), JS::Number::New(env, 100)});
}

void JsStartStopLossArbCpp(const JS::CallbackInfo& info)
{
    const auto js_lists_of_list_of_dates = info[0].As<JS::Array>();
    const auto js_partial_stock_state = info[1].As<JS::Object>();

    const auto cpp_lists_of_list_of_dates =
        BindJsListOfListOfDatesToCppListOfListOfDates(js_lists_of_list_of_dates);

    const auto cpp_partial_stock_state =
        BindJsPartialStockStateToCppMap(js_partial_stock_state);

    StartStopLossArbCpp(cpp_lists_of_list_of_dates, cpp_partial_stock_state);
}

void JsFilterHistoricalData(const JS::CallbackInfo& info) { CopyFilteredJsonFiles(); }

JS::Object Init(JS::Env env, JS::Object exports)
{
    exports.Set(
        JS::String::New(env, GET_SYMBOL_NAME(JsTestCallJSFunction)),
        JS::Function::New(env, JsTestCallJSFunction)
    );

    exports.Set(
        JS::String::New(env, GET_SYMBOL_NAME(JsStartStopLossArbCpp)),
        JS::Function::New(env, JsStartStopLossArbCpp)
    );

    exports.Set(
        JS::String::New(env, GET_SYMBOL_NAME(JsFilterHistoricalData)),
        JS::Function::New(env, JsFilterHistoricalData)
    );

    return exports;
}

NODE_API_MODULE(deephedge, Init)
