import os

for f in os.listdir("src"):
    if f.endswith(".cpp"):
        print(os.path.join("src", f).replace("\\", "/"))
