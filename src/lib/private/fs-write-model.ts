import {PathLike} from "fs";

export type WriteFileOptions = {
    encoding?: string | null; mode?: number | string; flag?: string;
} | string | null;

export interface WriteFile {
    writeFile: (path: PathLike /*| number*/, data: any, options?: WriteFileOptions) => Promise<void>;
}

export interface WriteFileAtomic {
    writeFileAtomic: (path: PathLike /*| number*/, data: any, options?: WriteFileOptions) => Promise<void>;
}
