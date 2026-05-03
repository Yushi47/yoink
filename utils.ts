import fs from 'fs';
import path from 'path';

export function uniqueOutputPath(outputDir: string, filename: string): string {
    let outPath = path.join(outputDir, filename);
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    let counter = 1;
    while (fs.existsSync(outPath)) {
        outPath = path.join(outputDir, `${base}-${counter}${ext}`);
        counter++;
    }
    return outPath;
}
