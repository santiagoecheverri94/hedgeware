#include "data.hpp"

#include <format>
#include <fstream>
#include <future>

using json = nlohmann::json;

using namespace std;

void CopyFilteredJsonFiles()
{
    vector<string> years{"2025"};
    for (int year = 2012; year <= 2025; ++year)
    {
        years.push_back(to_string(year));
    }

    vector<future<void>> futures;
    futures.reserve(years.size());

    for (const auto& year : years)
    {
        futures.push_back(async(launch::async, CopyFilteredJsonFilesForYear, year));
    }

    for (auto& fut : futures)
    {
        fut.wait();
    }
}

void CopyFilteredJsonFilesForYear(const string& year)
{
    const filesystem::path srcBase =
        filesystem::current_path() / ".." / "deephedge" / "historical-data" / year;

    for (const auto& monthEntry : filesystem::directory_iterator(srcBase))
    {
        if (!monthEntry.is_directory()) continue;
        const auto& monthPath = monthEntry.path();

        for (const auto& dayEntry : filesystem::directory_iterator(monthPath))
        {
            if (!dayEntry.is_directory()) continue;
            const auto& dayPath = dayEntry.path();

            for (const auto& fileEntry : filesystem::directory_iterator(dayPath))
            {
                if (!fileEntry.is_regular_file()) continue;
                const auto& filePath = fileEntry.path();

                if (filePath.extension() == ".json")
                {
                    // Construct destination path
                    filesystem::path relativePath =
                        filesystem::relative(filePath, srcBase);

                    const auto folderSuffix = GetHistoricalDataFolderSuffix(filePath);

                    if (folderSuffix == "")
                    {
                        continue;
                    }

                    filesystem::path dstBase =
                        filesystem::current_path() / ".." / "deephedge" /
                        format("historical-data-{}-100M", folderSuffix) / year;

                    filesystem::path dstPath = dstBase / relativePath;

                    // Create directories if needed
                    filesystem::create_directories(dstPath.parent_path());

                    // Copy file
                    filesystem::copy_file(
                        filePath, dstPath, filesystem::copy_options::overwrite_existing
                    );
                }
            }
        }
    }
}

std::string GetHistoricalDataFolderSuffix(const filesystem::path& filePath)
{
    std::ifstream file(filePath);
    if (!file.is_open())
    {
        cerr << "Failed to open file: " << filePath << endl;
        return "";
    }

    json json_data;
    try
    {
        file >> json_data;
    }
    catch (const std::exception& e)
    {
        cerr << "JSON parse error in file: " << filePath << " - " << e.what() << endl;
        return "";
    }

    const Decimal price = GetFirstNMinutesClosePrice(json_data);

    if (GetDecimal(1) <= price && price < GetDecimal(2))
    {
        return "[1-2)";
    }
    else if (GetDecimal(2) <= price && price < GetDecimal(3.5))
    {
        return "[2-3p5)";
    }
    else if (GetDecimal(3.5) <= price && price < GetDecimal(7))
    {
        return "[3p5-7)";
    }
    else if (GetDecimal(7) <= price && price < GetDecimal(10))
    {
        return "[7-10)";
    }
    else
    {
        return "";
    }
}

Decimal GetFirstNMinutesClosePrice(const nlohmann::json& json_data)
{
    if (!json_data.contains("raw_time_steps") ||
        !json_data["raw_time_steps"].is_array())
    {
        throw std::runtime_error(
            "Missing or invalid 'raw_time_steps' array in JSON data."
        );
    }

    const auto& time_steps = json_data["raw_time_steps"];
    for (auto it = time_steps.rbegin(); it != time_steps.rend(); ++it)
    {
        if (it->is_null()) continue;
        if (it->contains("close") && (*it)["close"].is_number())
        {
            double close_val = (*it)["close"].get<double>();
            return GetDecimal(close_val);
        }
    }

    throw std::runtime_error("No valid 'close' value found in 'raw_time_steps'.");
}
