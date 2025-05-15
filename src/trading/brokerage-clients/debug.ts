import express, {Request, Response} from 'express';
import cors from 'cors';
import {SchwabClient} from './Schwab/client';
import {BrokerageClient, Snapshot} from './brokerage-client';

interface SnapshotRequest {
    ticker: string;
}

interface SetPositionRequest {
    brokerageIdOfSecurity: string;
    currentPosition: number;
    newPosition: number;
}

export async function brokerageDebug(): Promise<void> {
    const brokerageClient: BrokerageClient = await SchwabClient.getInstance();

    const app = express();
    app.use(cors());
    app.use(express.json());

    app.post('/snapshot', async (req: Request, res: Response) => {
        const body: SnapshotRequest = req.body;

        const snapshot = await brokerageClient.getSnapshot(body.ticker);

        res.json(snapshot);
    });

    app.post('/set-position', async (req: Request, res: Response) => {
        const body: SetPositionRequest = req.body;
        const {brokerageIdOfSecurity, currentPosition, newPosition} = body;

        const pricePerShare = await brokerageClient.setSecurityPosition({
            brokerageIdOfSecurity,
            currentPosition,
            newPosition,
        });

        res.json({pricePerShare});
    });

    const PORT = 8000;
    app.listen(PORT, () => {
        console.log(`Brokerage Debug Server running on port ${PORT}`);
    });
}
