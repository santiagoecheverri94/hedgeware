import { Args, Command, Flags } from "@oclif/core";
import { createNewStockStateFromExisting } from "../../trading/strategies/stop-loss-arb/new-state";

export default class StopLossArbNewState extends Command {
    static description = "";

    static examples = ["<%= config.bin %> <%= command.id %>"];

    static args = {
        stocks: Args.string({ description: "stocks to trade", required: true }),
    };

    public async run(): Promise<void> {
        const { args } = await this.parse(StopLossArbNewState);

        for (const stock of args.stocks.split(",")) {
            await createNewStockStateFromExisting(stock);
        }

        this.exit();
    }
}
