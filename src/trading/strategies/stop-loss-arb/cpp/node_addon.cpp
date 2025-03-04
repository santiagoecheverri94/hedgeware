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
    JS::Env env = info.Env();

    const auto js_stocks = info[0].As<JS::Array>();
    const auto js_states = info[1].As<JS::Object>();

    const auto cpp_stocks = BindJsStocksToCppStocks(js_stocks);
    auto cpp_states = BindJsStatesToCppStates(js_states);

    StartStopLossArbCpp(cpp_stocks, cpp_states);
}

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

    return exports;
}

NODE_API_MODULE(deephedge, Init)
