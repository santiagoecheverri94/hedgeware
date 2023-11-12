import {promises as fsPromises, readFileSync, writeFileSync} from 'node:fs';

export function readJSONFile<T>(filePath: string): T {
  const file = readFileSync(filePath, 'utf8');
  return JSON.parse(file);
}

export async function asyncWriteJSONFile(filePath: string, jsonString: string): Promise<void> {
  await fsPromises.writeFile(filePath, jsonString);
}

export function syncWriteJSONFile(filePath: string, jsonString: string): void {
  writeFileSync(filePath, jsonString);
}

export function jsonPrettyPrint(obj: unknown): string {
  return `${JSON.stringify(obj, null, 2)}\n`;
}

export async function getFileNamesWithinFolder(folderPath: string): Promise<string[]> {
  const fileNames = await fsPromises.readdir(folderPath);
  return fileNames.filter(fileName => fileName !== 'simulated').map(fileName => fileName.split('.')[0]);
}
