#pragma once
#include <string>
#include <filesystem>
#include <nlohmann/json.hpp>

#include "utils.hpp"

void CopyFilteredJsonFiles();

void CopyFilteredJsonFilesForYear(const std::string& year);

std::string GetHistoricalDataFolderSuffix(const std::filesystem::path& filePath);

Decimal GetFirstNMinutesClosePrice(const nlohmann::json& json_data);
