import {Buffer} from 'node:buffer';
import {readFile, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
const readline = require('node:readline/promises');

const appKey = 'AFpYDZTkXjlLHnftVfwtAFPfZJdDFFGB';
const appSecret = 'C1M34osY2rfeMdAU';
const refreshTokenPath = './refresh-token.txt';

export async function getAccessToken(): Promise<string> {
    if (existsSync(refreshTokenPath)) {
        // Try to use refresh token
        try {
            const storedRefreshToken = (
                await readFile(refreshTokenPath, 'utf8')
            ).trim();
            const accessToken = await getAccessTokenFromRefreshToken(storedRefreshToken);

            return accessToken;
        } catch {
            console.log(
                'Saved refresh token is invalid or expired. Please re-authenticate.\n',
            );
        }
    }

    return await getAccessTokenFromUserInput();
}

async function getAccessTokenFromRefreshToken(storedRefreshToken: string) {
    const basicAuth = Buffer.from(`${appKey}:${appSecret}`).toString('base64');
    const headers = {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
    };
    const data = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: storedRefreshToken,
        redirect_uri: 'https://127.0.0.1',
    });

    const resp = await fetch('https://api.schwabapi.com/v1/oauth/token', {
        method: 'POST',
        headers,
        body: data,
    });
    if (!resp.ok) throw new Error('Failed to refresh token');

    const tD = await resp.json();

    const accessToken = tD.access_token;

    return accessToken;
}

async function getAccessTokenFromUserInput(): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    const returnedLink = await rl.question('Paste the redirect URL here:');
    rl.close();

    const codeStart = returnedLink.indexOf('code=') + 5;
    const codeEnd = returnedLink.indexOf('%40');
    const code = `${returnedLink.slice(codeStart, codeEnd)}@`;

    console.log(`\n${code}\n`);

    const tD = await getTokensWithAuthCode(code);
    const refresh_token = tD.refresh_token;

    await writeFile(refreshTokenPath, refresh_token, 'utf8');

    return tD.access_token;
}

async function getTokensWithAuthCode(code: string) {
    const basicAuth = Buffer.from(`${appKey}:${appSecret}`).toString('base64');
    const headers = {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
    };
    const data = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: 'https://127.0.0.1',
    });

    const resp = await fetch('https://api.schwabapi.com/v1/oauth/token', {
        method: 'POST',
        headers,
        body: data,
    });
    if (!resp.ok) throw new Error('Failed to get token with auth code');

    return resp.json();
}
