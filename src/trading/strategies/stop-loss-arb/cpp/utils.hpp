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
