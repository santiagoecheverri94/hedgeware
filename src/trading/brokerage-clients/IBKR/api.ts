export enum IbkrApiEndpoint {
    stockSnapshot = 'stock-snapshot',
    placeOrder = 'place-order',
    orderStatus = 'order-status',
}

export async function ibkrApiReq(path: IbkrApiEndpoint, body: any) {
    const data = await fetch(`http://127.0.0.1:8001/${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const response = await data.json();

    if (data.status !== 200) {
        debugger;
        throw new Error(response.detail);
    }

    return response;
}
