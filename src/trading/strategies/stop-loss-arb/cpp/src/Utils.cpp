#include "Utils.hpp"

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

void Print1DVector(const std::vector<std::wstring>& vec)
{
    std::wostringstream woss;
    woss << "[" << std::endl;
    for (size_t i = 0; i < vec.size(); ++i)
    {
        woss << "  " << vec[i];
        if (i != vec.size() - 1)
        {
            woss << "," << std::endl;
        }
    }
    woss << std::endl << "]";

    Print(woss.str());
};

void PrintJson(MyJSON& data)
{
    std::cout << "{\n";
    for (auto it = data.begin(); it != data.end(); ++it)
    {
        std::wcout << "  \"" << it->first << "\": {\n";
        const auto& innerMap = it->second;
        for (auto innerIt = innerMap.begin(); innerIt != innerMap.end(); ++innerIt)
        {
            std::wcout << "    \"" << innerIt->first << "\": ";
            std::visit([](const auto& value) { std::wcout << value; }, innerIt->second);
            if (std::next(innerIt) != innerMap.end())
            {
                std::cout << ",";
            }
            std::cout << "\n";
        }
        std::cout << "  }";
        if (std::next(it) != data.end())
        {
            std::cout << ",";
        }
        std::cout << "\n";
    }
    std::cout << "}\n";
};
