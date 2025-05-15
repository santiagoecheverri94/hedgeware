#pragma once
#include <napi.h>

#include <string>
#include <unordered_map>
#include <variant>

#include "types.hpp"

namespace JS = Napi;

std::vector<std::vector<std::string>> BindJsListOfListOfDatesToCppListOfListOfDates(
    const JS::Array& js_list_of_list_of_dates
);

PartialStockState BindJsPartialStockStateToCppMap(
    const JS::Object& js_partial_stock_argument
);

std::vector<std::vector<std::unordered_map<std::string, StockState>>>
BindJsListOfStatesListToCppListOfStatesList(const JS::Array& js_states_list);

std::vector<std::unordered_map<std::string, StockState>>
BindJsStatesListToCppStatesList(const JS::Array& js_states_list);

std::unordered_map<std::string, StockState> BindJsStatesToCppStates(
    const JS::Object& js_states
);

JS::Object BindCppStatesToJsStates(
    JS::Env env, const std::unordered_map<std::string, StockState>& cpp_states
);
