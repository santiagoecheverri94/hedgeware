export enum SchwabGetEndpoint {
    // oauth = "oauth/authorize",
}

export enum SchwabPostEndpoint {
    oauth = 'oauth/token',
}

export async function schwabGetReq(path: SchwabGetEndpoint, params: any) {
    const urlParams = new URLSearchParams(params).toString();

    const data = await fetch(`https://api.schwabapi.com/v1/${path}?${urlParams}`);

    const response = await data.json();

    if (data.status !== 200) {
        debugger;
        throw new Error(response.detail);
    }

    return response;
}

export async function schwabPostReq(
    path: SchwabPostEndpoint,
    body: string,
    headers: any = {
        'Content-Type': 'application/json',
    },
) {
    const data = await fetch(`https://api.schwabapi.com/v1/${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });

    const response = await data.json();

    if (data.status !== 200) {
        const text = await data.text();
        console.log(text);
        debugger;
        throw new Error(response.detail);
    }

    return response;
}
