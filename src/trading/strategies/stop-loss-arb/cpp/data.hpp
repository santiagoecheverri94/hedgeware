#pragma once

#include <filesystem>
#include <nlohmann/json.hpp>
#include <string>

#include "utils.hpp"

void CopyFilteredJsonFiles();

void CopyFilteredJsonFilesForYear(const std::string& year);

std::string GetHistoricalDataFolderSuffix(const std::filesystem::path& filePath);

Decimal GetFirstNMinutesClosePrice(const nlohmann::json& json_data);
