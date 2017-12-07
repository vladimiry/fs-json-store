import {PathLike} from "fs";
import {instantiate, Model as FsNoEpermAnymoreModel} from "fs-no-eperm-anymore";

import {StoreFs} from "../../model";
import {WriteFileOptions} from "../../fs-write-model";
import {Model as WriteFileAtomicModel, writeFileAtomic} from "../../write-file-atomic/index";

const DEFAULT_FS_NO_EPERM_ANYMORE_OPTIONS: FsNoEpermAnymoreModel.Options = {
    items: [
        {
            platforms: ["win32"],
            errorCodes: ["EPERM", "EBUSY"],
            options: {
                retryIntervalMs: 100,
                retryTimeoutMs: 10 * 1000,
            },
        },
    ],
};

export function volume(volumeOptions?: {
    writeFileAtomicOptions: WriteFileAtomicModel.WriteFileAtomicOptions;
    fsNoEpermAnymore: FsNoEpermAnymoreModel.Options;
}): StoreFs {
    const instanceOptions = {...DEFAULT_FS_NO_EPERM_ANYMORE_OPTIONS, ...(volumeOptions ? volumeOptions.fsNoEpermAnymore : {})};
    const impl = instantiate(instanceOptions);

    return {
        impl,
        chmod: impl.chmod,
        chown: impl.chown,
        close: impl.close,
        fsync: impl.fsync,
        mkdir: impl.mkdir,
        open: impl.open,
        readFile: impl.readFile,
        realpath: impl.realpath,
        rename: impl.rename,
        stat: impl.stat,
        writeFile: impl.writeFile,
        writeFileAtomic(path: PathLike /*| number*/, data: any, writeFileOptions?: WriteFileOptions): Promise<void> {
            return writeFileAtomic(impl, path, data, writeFileOptions, volumeOptions && volumeOptions.writeFileAtomicOptions);
        },
        unlink: impl.unlink,
    };
}

export const fs = volume();
