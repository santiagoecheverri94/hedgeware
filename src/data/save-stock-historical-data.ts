import {restClient, IQuotes} from '@polygon.io/client-js';
import {getNanoSecondsEpochTimestampForDateAndTimeInNewYork, getSecondsFromNanoSecondsTimestamp, getTimestampForDateAndTimeInNewYorkFromNanoSecondsEpochTimestamp, MARKET_CLOSES, MARKET_OPENS} from '../utils/time';
import {Snapshot} from '../trading/brokerage-clients/brokerage-client';
import {syncWriteJSONFile} from '../utils/file';

export async function saveStockHistoricalDataForStockOnDate(stock: string, date: string): Promise<void> {
  const polygonQuotes = await getPolygonQuotesForDate(stock, date);
  const snapshotsByTheSecond = getSnapshotsByTheSecond(polygonQuotes);
  syncWriteJSONFile(getFilePathForStockOnDate(stock, date), JSON.stringify(snapshotsByTheSecond));
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
    throw new Error('No quotes found for stock');
  }

  return response.results;
}

export interface SnapshotByTheSecond {
  timestamp: string;
  snapshot: Snapshot;
}

function getSnapshotsByTheSecond(polygonQuotes: PolygonQuote[]): SnapshotByTheSecond[] {
  const snapshotsByTheSecond: SnapshotByTheSecond[] = [];

  let lastSeconds: number | undefined;
  for (const quote of polygonQuotes) {
    const seconds = getSecondsFromNanoSecondsTimestamp(quote.sip_timestamp);

    if (seconds !== lastSeconds) {
      lastSeconds = seconds;

      const snapshotByTheSecond = {
        timestamp: getTimestampForDateAndTimeInNewYorkFromNanoSecondsEpochTimestamp(quote.sip_timestamp),
        snapshot: {
          ask: quote.ask_price,
          bid: quote.bid_price,
        },
      };

      snapshotsByTheSecond.push(snapshotByTheSecond);
    }
  }

  return snapshotsByTheSecond;
}

export function getFilePathForStockOnDate(stock: string, date?: string): string {
  if (!date) {
    throw new Error('date must be provided');
  }

  return `${process.cwd()}\\src\\data\\dailies\\${stock}\\${date}.json`;
}

export function getFilePathForStockOnDateRange(stock: string, startDate?: string, endDate?: string): string {
  if (!startDate || !endDate) {
    throw new Error('dates must be provided');
  }

  return `${process.cwd()}\\src\\data\\date-ranges\\${stock}\\${startDate}_${endDate}.json`;
}
