#pragma once

#include <boost/multiprecision/cpp_dec_float.hpp>
#include <functional>
#include <iostream>
#include <variant>

void Print(std::variant<std::wstring, std::string> message);

const int kDecimalPrecision = 8;

using Decimal = boost::multiprecision::number<
    boost::multiprecision::backends::cpp_dec_float<kDecimalPrecision>>;

std::string DoubleToStr(const double& value);

using MyJSON = std::unordered_map<
    std::wstring,
    std::unordered_map<
        std::wstring, std::variant<std::wstring, double, std::nullptr_t>>>;

void Print1DVector(const std::vector<std::wstring>& vec);

void PrintJson(MyJSON& data);
