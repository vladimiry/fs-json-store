import {PathLike} from "fs";
import {instantiate, Model as FsNoEpermAnymoreModel} from "fs-no-eperm-anymore";

import {StoreFs} from "../../model";
import {NoExtraProps} from "../../types";
import {WriteFileOptions} from "../../fs-write-model";
import {Model as WriteFileAtomicModel, writeFileAtomic} from "../../write-file-atomic/index";
import {TODO} from "../../types";

// keep definition on file top
export const NAME = "internal.fs-no-eperm-anymore";

const defaultFsNoEpermAnymoreOptions: FsNoEpermAnymoreModel.Options = {
    items: [
        {
            platforms: ["win32"],
            errorCodes: ["EPERM", "EBUSY"],
            options: {
                retryIntervalMs: 100, // every 100 ms
                retryTimeoutMs: 5 * 1000, // 5 seconds
            },
        },
    ],
};

export function volume(
    volumeOptions?: {
        writeFileAtomicOptions?: WriteFileAtomicModel.WriteFileAtomicOptions;
        fsNoEpermAnymore?: FsNoEpermAnymoreModel.Options;
    },
): NoExtraProps<StoreFs> {
    const impl = instantiate(
        {
            ...defaultFsNoEpermAnymoreOptions,
            ...volumeOptions?.fsNoEpermAnymore,
        },
    );

    return {
        _impl: impl,
        _name: NAME,
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
        writeFileAtomic(
            path: PathLike,
            data: TODO,
            writeFileOptions?: WriteFileOptions,
        ): Promise<void> {
            return writeFileAtomic(
                impl,
                path,
                data,
                writeFileOptions,
                volumeOptions?.writeFileAtomicOptions,
            );
        },
        unlink: impl.unlink,
    };
}

export const fs = volume();
