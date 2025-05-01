import express, {Request, Response} from 'express';
import cors from 'cors';
import {SchwabClient} from './Schwab/client';

interface SetPositionRequest {
    currentPostion: number;
    newPosition: number;
}

export async function brokerageDebug(): Promise<void> {
    const brokerageClient = await SchwabClient.getInstance();

    const app = express();
    app.use(cors());
    app.use(express.json());

    app.post('/set-position', (req: Request, res: Response) => {
        const body: SetPositionRequest = req.body;
        res.json([`went from ${body.currentPostion} to ${body.newPosition}`]);
    });

    const PORT = 8000;
    app.listen(PORT, () => {
        console.log(`Brokerage Debug Server running on port ${PORT}`);
    });
}
