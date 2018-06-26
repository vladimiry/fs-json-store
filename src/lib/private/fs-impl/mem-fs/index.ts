import {createFsFromVolume, Volume} from "memfs";
import {PathLike} from "fs";
import {promisify} from "util";

import {WriteFileOptions} from "../../fs-write-model";
import {StoreFs} from "../../model";
import {Model as WriteFileAtomicModel, writeFileAtomic} from "../../write-file-atomic/index";

// keep definition on file top
export const NAME = "internal.memfs";

export function volume(volumeOptions?: {
    writeFileAtomicOptions: WriteFileAtomicModel.WriteFileAtomicOptions;
}): StoreFs {
    const vol = new Volume();
    const impl = createFsFromVolume(vol);

    return {
        _impl: impl,
        _name: NAME,
        chmod: promisify(impl.chmod),
        chown: promisify(impl.chown),
        mkdir: promisify(impl.mkdir),
        open: promisify(impl.open),
        close: promisify(impl.close),
        fsync: promisify(impl.fsync),
        readFile: promisify(impl.readFile),
        realpath: promisify(impl.realpath),
        rename: promisify(impl.rename),
        stat: promisify(impl.stat),
        writeFile: promisify(impl.writeFile),
        writeFileAtomic(path: PathLike /*| number*/, data: any, writeFileOptions?: WriteFileOptions): Promise<void> {
            return writeFileAtomic(impl, path, data, writeFileOptions, volumeOptions && volumeOptions.writeFileAtomicOptions);
        },
        unlink: promisify(impl.unlink),
    };
}

export const fs: StoreFs = volume();
