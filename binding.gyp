{
    "targets": [
        {
            "target_name": "deephedge",
            "sources": ["<!@(python get_cpp_files.py)"],
            "dependencies": [
                "<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except_all",
            ],
            "include_dirs": ["src/trading/strategies/stop-loss-arb/cpp/include"],
            "msvs_settings": {
                "VCCLCompilerTool": {
                    "AdditionalOptions": [
                        "-std:c++20",
                    ],
                },
            },
        }
    ]
}  # type: ignore
