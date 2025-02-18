#ifndef MAIN_DEBUG

#include <napi.h>

#define GET_SYMBOL_NAME(symbol) #symbol

namespace JS = Napi;

JS::String CppFunction(const JS::CallbackInfo& info)
{
    JS::Env env = info.Env();
    return JS::String::New(env, "Hello From CPP Node Addon!");
}

JS::Object Init(JS::Env env, JS::Object exports)
{
    exports.Set(
        JS::String::New(env, GET_SYMBOL_NAME(CppFunction)),
        JS::Function::New(env, CppFunction)
    );

    return exports;
}

NODE_API_MODULE(deephedge, Init)

#endif
