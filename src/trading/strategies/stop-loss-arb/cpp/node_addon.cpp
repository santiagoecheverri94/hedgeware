#ifndef MAIN_DEBUG

#include <napi.h>

#define GET_SYMBOL_NAME(symbol) #symbol

namespace JS = Napi;

JS::String PrintFromCpp(const JS::CallbackInfo& info)
{
    JS::Env env = info.Env();
    return JS::String::New(env, "Hello From CPP Node Addon!");
}

void ModifyObject(JS::CallbackInfo const& info)
{
    JS::Object obj = info[0].As<JS::Object>();
    obj.Set("field4", "f4");
}

void CallJSFunction(const JS::CallbackInfo& info)
{
    JS::Env env = info.Env();

    JS::Function callback = info[0].As<JS::Function>();
    callback.Call({JS::String::New(env, "string from cpp"), JS::Number::New(env, 100)});
}

JS::Object Init(JS::Env env, JS::Object exports)
{
    exports.Set(
        JS::String::New(env, GET_SYMBOL_NAME(PrintFromCpp)),
        JS::Function::New(env, PrintFromCpp)
    );

    exports.Set(
        JS::String::New(env, GET_SYMBOL_NAME(ModifyObject)),
        JS::Function::New(env, ModifyObject)
    );

    exports.Set(
        JS::String::New(env, GET_SYMBOL_NAME(CallJSFunction)),
        JS::Function::New(env, CallJSFunction)
    );

    return exports;
}

NODE_API_MODULE(deephedge, Init)

#endif
