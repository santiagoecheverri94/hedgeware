#include "utils.hpp"

#include <sstream>

using namespace std;

void Print(variant<std::wstring, std::string> message)
{
    if (holds_alternative<wstring>(message))
    {
        wcout << get<wstring>(message) << endl << flush;
    }
    else
    {
        cout << get<string>(message) << endl << flush;
    }
};

std::string DoubleToStr(const double& value)
{
    std::ostringstream oss{};
    oss.precision(kDecimalPrecision);
    oss << value;
    return oss.str();
}

Decimal GetDecimal(const double& value) { return Decimal{DoubleToStr(value)}; }

std::vector<std::string> string_split(const std::string& str, const char& delimiter)
{
    vector<string> result{};
    string current{};

    for (char character_in_input : str)
    {
        if (character_in_input == delimiter)
        {
            if (!current.empty())
            {
                result.push_back(current);
                current.clear();
            }
        }
        else
        {
            current += character_in_input;
        }
    }

    if (!current.empty())
    {
        result.push_back(current);
    }

    return result;
}
