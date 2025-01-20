import {getCurrentTimeStamp} from './time';
import {createInterface} from 'node:readline';

export function stopSystem(errorMsg: string): void {
    throw new Error(`${getCurrentTimeStamp()}: ${errorMsg}`);
}

export function onUserInterrupt(callback: () => void): void {
    const USER_INTERRUPT = 'SIGINT';

    if (process.platform === 'win32') {
        const terminalInput = createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        terminalInput.on(USER_INTERRUPT, () => {
            process.emit(USER_INTERRUPT, USER_INTERRUPT);
        });
    }

    process.on(USER_INTERRUPT, callback);
}
