import {PathLike} from "fs";

import {TODO} from "./types";

export type WriteFileOptions = {
    encoding?: string | null; mode?: number | string; flag?: string;
} | string | null;

export interface WriteFile {
    writeFile: (path: PathLike /*| number*/, data: TODO, options?: WriteFileOptions) => Promise<void>;
}

export interface WriteFileAtomic {
    writeFileAtomic: (path: PathLike /*| number*/, data: TODO, options?: WriteFileOptions) => Promise<void>;
}
