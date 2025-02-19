#include <format>

#include "Utils.hpp"

using namespace std;

int main()
{
    try
    {
        Print("");
        Print("Hello from Main Debug C++ x64!");
        Print("Let's test some floating point operations.");

        const Decimal left{DoubleToStr(2200.1111)};
        const Decimal right{DoubleToStr(2200.1111)};
        const Decimal sum = left + right;

        Print(format("'sum' with str(): {}", sum.str()));

        const auto decimal_operation = left < right;

        Print(format("{} < {} = {}", left.str(), right.str(), decimal_operation));
    }
    catch (const std::exception& e)
    {
        std::cerr << e.what() << std::endl;
        return 1;
    }
    catch (...)
    {
        std::cerr << "Unknown failure at main() level." << std::endl;
        return 1;
    }

    return 0;
}
