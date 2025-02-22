#include "bindings.hpp"
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

void JsHedgeStockWhileMarketIsOpen(const JS::CallbackInfo& info)
{
    JS::Env env = info.Env();

    auto stock = info[0].As<JS::String>().Utf8Value();
    auto js_states = info[1].As<JS::Object>();
    auto cpp_states = BindJsStatesToCppStates(js_states);

    HedgeStockWhileMarketIsOpen(stock, cpp_states);
}

JS::Object Init(JS::Env env, JS::Object exports)
{
    exports.Set(
        JS::String::New(env, GET_SYMBOL_NAME(JsTestCallJSFunction)),
        JS::Function::New(env, JsTestCallJSFunction)
    );

    exports.Set(
        JS::String::New(env, GET_SYMBOL_NAME(JsHedgeStockWhileMarketIsOpen)),
        JS::Function::New(env, JsHedgeStockWhileMarketIsOpen)
    );

    return exports;
}

NODE_API_MODULE(deephedge, Init)
