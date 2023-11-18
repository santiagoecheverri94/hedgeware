import {restClient, IQuotes} from '@polygon.io/client-js';
import {getNanoSecondsEpochTimestampForDateAndTimeInNewYork, getSecondsFromNanoSecondsTimestamp, getTimestampForDateAndTimeInNewYorkFromNanoSecondsEpochTimestamp, getWeekdaysInRange, MARKET_CLOSES, MARKET_OPENS} from '../utils/time';
import {Snapshot} from '../trading/brokerage-clients/brokerage-client';
import {jsonPrettyPrint, syncWriteJSONFile} from '../utils/file';
import {existsSync, mkdirSync} from 'node:fs';
import {setTimeout} from 'node:timers/promises';

export async function saveStockHistoricalDailyDataForStockFromStartToEndDate(stock: string, startDate: string, endDate: string): Promise<void> {
  const requests: Promise<void>[] = [];
  const dateRange = getWeekdaysInRange(startDate, endDate);
  for (const date of dateRange) {
    await setTimeout(100);
    requests.push(saveStockHistoricalDataForStockOnDate(stock, date));
  }

  await Promise.all(requests);
}

export async function saveStockHistoricalDataForStockOnDate(stock: string, date: string): Promise<void> {
  const polygonQuotes = await getPolygonQuotesForDate(stock, date);
  const snapshotsByTheSecond = getSnapshotsByTheSecond(polygonQuotes);
  syncWriteJSONFile(getFilePathForStockDataOnDate(stock, date), jsonPrettyPrint(snapshotsByTheSecond));
}

type PolygonQuote = Exclude<IQuotes['results'], undefined>[0];

async function getPolygonQuotesForDate(stock: string, date: string): Promise<PolygonQuote[]> {
  if (!process.env.POLYGON_API_KEY) {
    throw new Error('POLYGON_API_KEY is not set');
  }

  const polygon = restClient(process.env.POLYGON_API_KEY, 'https://api.polygon.io', {pagination: true});

  const POLYGON_LIMIT = 50_000;
  const response = await polygon.stocks.quotes(stock, {
    'timestamp.gte': `${getNanoSecondsEpochTimestampForDateAndTimeInNewYork(date, MARKET_OPENS)}`,
    'timestamp.lt': `${getNanoSecondsEpochTimestampForDateAndTimeInNewYork(date, MARKET_CLOSES)}`,
    order: 'asc',
    limit: POLYGON_LIMIT,
    sort: 'timestamp',
  });

  if (!response.results?.length) {
    // TODO: deal better with non-trading days (e.g. labor day)
    return [];
  }

  return response.results;
}

function getSnapshotsByTheSecond(polygonQuotes: PolygonQuote[]): Snapshot[] {
  const snapshotsByTheSecond: Snapshot[] = [];

  let lastSeconds: number | undefined;
  for (const quote of polygonQuotes) {
    const seconds = getSecondsFromNanoSecondsTimestamp(quote.sip_timestamp);

    if (seconds !== lastSeconds) {
      lastSeconds = seconds;

      const snapshotByTheSecond: Snapshot = {
        ask: quote.ask_price,
        bid: quote.bid_price,
        timestamp: getTimestampForDateAndTimeInNewYorkFromNanoSecondsEpochTimestamp(quote.sip_timestamp),
      };

      snapshotsByTheSecond.push(snapshotByTheSecond);
    }
  }

  return snapshotsByTheSecond;
}

export function getFilePathForStockDataOnDate(stock: string, date: string): string {
  return `${getFolderPathForStockData(stock)}\\${date}.json`;
}

function getFolderPathForStockData(stock: string): string {
  const path = `${process.cwd()}\\src\\historical-data\\${stock}`;

  if (!existsSync(path)) {
    mkdirSync(path);
  }

  return path;
}
