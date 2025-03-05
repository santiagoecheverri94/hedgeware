#pragma once

#include <boost/multiprecision/cpp_dec_float.hpp>
#include <functional>
#include <iostream>
#include <variant>

void Print(std::variant<std::wstring, std::string> message);

const int kDecimalPrecision = 12;

using Decimal = boost::multiprecision::number<
    boost::multiprecision::backends::cpp_dec_float<kDecimalPrecision>>;

Decimal GetDecimal(const double& value);

std::vector<std::string> string_split(const std::string& str, const char& delimiter);

using MyJSON = std::unordered_map<
    std::wstring,
    std::unordered_map<
        std::wstring,
        std::variant<std::wstring, double, std::nullptr_t>>>;

void Print1DVector(const std::vector<std::wstring>& vec);

void PrintJson(MyJSON& data);
