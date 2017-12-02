import {PathLike} from "fs";
import {instantiate} from "fs-no-eperm-anymore";

import {StoreFs} from "../../model";
import {WriteFileAtomicOptions} from "./model";
import {WriteFileOptions} from "../../private/model";
import {writeFileAtomic} from "./write-file-atomic";

export function volume(volumeOptions?: WriteFileAtomicOptions): StoreFs {
    const impl = instantiate(volumeOptions ? volumeOptions.retry : undefined);

    return {
        impl,
        close: impl.close,
        mkdir: impl.mkdir,
        open: impl.open,
        readFile: impl.readFile,
        stat: impl.stat,
        writeFile(path: PathLike/* | number*/, data: any, options?: WriteFileOptions): Promise<void> {
            // TODO move to the https://github.com/npm/write-file-atomic as soon as it gets decent EPERM errors handling
            return writeFileAtomic(path, data, options, volumeOptions);
        },
        unlink: impl.unlink,
    };
}

export const fs = volume();
