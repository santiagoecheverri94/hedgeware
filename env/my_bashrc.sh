
export PATH="/usr/local/nodejs/bin:$PATH"
export CC="gcc-13"
export CXX="g++-13"

live-trading() {
    export LIVE_TRADING="true"
    export RANDOM_SNAPSHOT=""
    export HISTORICAL_SNAPSHOT=""
    export CPP_NODE_ADDON=""
}
random-snapshot() {
    export RANDOM_SNAPSHOT="true"
    export HISTORICAL_SNAPSHOT=""
    export CPP_NODE_ADDON=""
    export LIVE_TRADING=""
}
historical-snapshot() {
    export HISTORICAL_SNAPSHOT="true"
    export RANDOM_SNAPSHOT=""
    export CPP_NODE_ADDON=""
    export LIVE_TRADING=""
}
cpp-node-addon() {
    export CPP_NODE_ADDON="true"
}
cpp-random-snapshot() {
    random-snapshot
    cpp-node-addon
}
cpp-historical-snapshot() {
    historical-snapshot
    cpp-node-addon
}
print-pnl-values() {
    export PRINT_PNL_VALUES="true"
}

alias r-stop-loss-arb="node ./bin/run.js stop-loss-arb"
alias stop-loss-arb="node ./bin/dev.js stop-loss-arb"
alias stop-loss-arb-debug="node --inspect-brk ./bin/dev.js stop-loss-arb"
alias brokerage-debug="node ./bin/dev.js brokerage-debug"
