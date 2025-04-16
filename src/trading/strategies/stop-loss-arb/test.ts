import { setTimeout } from "timers/promises";

async function main() {
    while (true) {
        try {
            await Promise.all([funcA(), funcB()]);
            break;
        } catch (error) {
            console.error("Error in main:", error);
            console.log("Will try again...");
        }
    }
}

async function funcA() {
    while (true) {
        await setTimeout(1000);
        console.log("Function A does work!");
    }
}

async function funcB() {
    while (true) {
        await setTimeout(1000);
        console.log("Function B does work ... that possibly throws!");
    }
}

main();
