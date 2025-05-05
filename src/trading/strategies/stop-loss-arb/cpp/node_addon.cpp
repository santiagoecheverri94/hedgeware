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
    const auto js_states_list = info[0].As<JS::Array>();

    auto cpp_states_list = BindJsStatesListToCppStatesList(js_states_list);

    StartStopLossArbCpp(cpp_states_list);
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
