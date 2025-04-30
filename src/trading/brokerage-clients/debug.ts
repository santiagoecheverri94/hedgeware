import express, {Request, Response} from 'express';
import cors from 'cors';

interface SetPositionRequest {
    currentPostion: number;
    newPosition: number;
}

export function brokerageDebug(): void {
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
