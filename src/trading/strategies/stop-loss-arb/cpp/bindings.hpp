#pragma once
#include <string>
#include <unordered_map>

#include "types.hpp"

std::unordered_map<std::string, StockState> BindJsStatesToCppStates(
    const JS::Object& js_states
);

JS::Object BindCppStatesToJsStates(
    JS::Env env, const std::unordered_map<std::string, StockState>& cpp_states
);
