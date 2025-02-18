#include "Utils.hpp"

using namespace std;

void HelloFromCpp() { Print("Hello from Main Debug C++ x64!"); }

int main()
{
    try
    {
        HelloFromCpp();
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
