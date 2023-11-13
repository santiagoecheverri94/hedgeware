import {restClient, IQuotes} from '@polygon.io/client-js';
import {getNanoSecondsEpochTimestampForDateAndTimeInNewYork, getSecondsFromNanoSecondsTimestamp, getTimestampForDateAndTimeInNewYorkFromNanoSecondsEpochTimestamp, MARKET_CLOSES, MARKET_OPENS} from '../utils/time';
import {Snapshot} from '../trading/brokerage-clients/brokerage-client';
import {jsonPrettyPrint, syncWriteJSONFile} from '../utils/file';
import {existsSync, mkdirSync} from 'node:fs';

export enum DateType {
  DAILY = 'daily',
  DATE_RANGE = 'date-range',
}

export async function saveStockHistoricalDataForStockOnDate(stock: string, date: string): Promise<void> {
  const polygonQuotes = await getPolygonQuotesForDate(stock, date);
  const snapshotsByTheSecond = getSnapshotsByTheSecond(polygonQuotes);
  syncWriteJSONFile(getFilePathForStockOnDateType(stock, DateType.DAILY, date), jsonPrettyPrint(snapshotsByTheSecond));
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

export function getFilePathForStockOnDateType(stock: string, dateType: DateType, startDate?: string, endDate?: string): string {
  if (dateType === DateType.DATE_RANGE) {
    if (!endDate) {
      throw new Error('endDate must be provided when dateType is DATE_RANGE');
    }

    return `${getFolderPathForStockOnDateType(stock, dateType)}\\${startDate}_${endDate}.json`;
  }

  if (!startDate) {
    throw new Error('startDate must always be provided');
  }

  return `${getFolderPathForStockOnDateType(stock, dateType)}\\${startDate}.json`;
}

function getFolderPathForStockOnDateType(stock: string, dateType: DateType): string {
  const path = `${process.cwd()}\\src\\historical-data\\${dateType}\\${stock}`;

  if (!existsSync(path)) {
    mkdirSync(path);
  }

  return path;
}
