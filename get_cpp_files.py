import os

for f in os.listdir("src/trading/strategies/stop-loss-arb/cpp"):
    if f.endswith(".cpp"):
        print(os.path.join("src/trading/strategies/stop-loss-arb/cpp", f).replace("\\", "/"))
