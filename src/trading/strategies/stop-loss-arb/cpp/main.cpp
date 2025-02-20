#include <format>

#include "utils.hpp"

using namespace std;

void DecimalTest()
{
    const Decimal left = GetDecimal(2);
    const Decimal right = GetDecimal(0.25);
    const Decimal sum = left + right;

    Print(std::format("'sum' with str(): {}", sum.str()));

    const Decimal decimal_operation = left / right;

    Print(std::format("{} / {} = {}", left.str(), right.str(), decimal_operation.str())
    );
}

int main()
{
    try
    {
        DecimalTest();
        // // Command to run the Node.js script
        // const char* command = "node test.js";

        // // Execute the command
        // int result = std::system(command);

        // // Check the result
        // if (result == 0)
        // {
        //     std::cout << "Node.js script executed successfully." << std::endl;
        // }
        // else
        // {
        //     std::cerr << "Failed to execute Node.js script." << std::endl;
        // }

        // return result;
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
