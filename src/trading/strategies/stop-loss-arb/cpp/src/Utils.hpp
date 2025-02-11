#pragma once

#include <functional>
#include <iostream>
#include <variant>

using MyJSON = std::unordered_map<
    std::wstring,
    std::unordered_map<
        std::wstring, std::variant<std::wstring, double, std::nullptr_t>>>;

void Print(std::variant<std::wstring, std::string> message);

void Print1DVector(const std::vector<std::wstring>& vec);

void PrintJson(MyJSON& data);
