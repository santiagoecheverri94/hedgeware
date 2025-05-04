import {promises as fsPromises, renameSync, writeFileSync} from 'node:fs';

export async function readJSONFile<T>(filePath: string): Promise<T> {
    const file = await fsPromises.readFile(filePath, 'utf8');
    return JSON.parse(file);
}

export function syncWriteJSONFile(filePath: string, jsonString: string): void {
    writeFileSync(filePath, jsonString);
}

export function syncRenameFile(oldPath: string, newPath: string): void {
    renameSync(oldPath, newPath);
}

export function jsonPrettyPrint(obj: unknown): string {
    return `${JSON.stringify(obj, null, 2)}\n`;
}

export async function getFileNamesWithinFolder(folderPath: string): Promise<string[]> {
    const fileNames = await fsPromises.readdir(folderPath);
    return fileNames
        .filter(fileName => fileName !== 'simulated')
        .map(fileName => fileName.split('.')[0]);
}
