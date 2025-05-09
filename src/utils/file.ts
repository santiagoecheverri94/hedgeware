import {promises as fsPromises} from 'node:fs';

export async function readJSONFile<T>(filePath: string): Promise<T> {
    const file = await fsPromises.readFile(filePath, 'utf8');
    return JSON.parse(file);
}

export async function writeJSONFile(
    filePath: string,
    jsonString: string,
): Promise<void> {
    await fsPromises.writeFile(filePath, jsonString);
}

export async function renameFile(oldPath: string, newPath: string): Promise<void> {
    await fsPromises.rename(oldPath, newPath);
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
