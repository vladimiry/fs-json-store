import combineErrors from "combine-errors";
import imurmurhash from "imurmurhash";
import {PathLike, Stats} from "fs";

import * as Model from "./model";
import {FS_ERROR_CODE_ENOENT} from "../constants";
import {WriteFileOptions} from "../fs-write-model";
import {StoreFsReference} from "../model";
import {TODO} from "../types";

const DEFAULT_ATOMIC_OPTIONS: Model.WriteFileAtomicOptions = {
    fsync: false,
};

const generateTmpFileName: (file: string) => string = ((): TODO => {
    let getTmpFilePathInvocation = 0;

    return (file: string) => file + "." + imurmurhash(__filename)
        .hash(String(process.pid))
        .hash(String(++getTmpFilePathInvocation))
        .hash(Number(new Date()))
        .result();
})();

async function writeFileAtomic(
    fs: StoreFsReference,
    filePath: PathLike /*| number*/,
    data: TODO,
    writeFileOptions?: WriteFileOptions,
    atomicOptionsInput?: Partial<Model.WriteFileAtomicOptions>,
): Promise<void> {
    const atomicOptions: Model.WriteFileAtomicOptions = {...DEFAULT_ATOMIC_OPTIONS, ...atomicOptionsInput};
    const file = filePath.toString();

    // in order to reduce the same file locking probability renaming occurs in serial mode using "queue" approach
    // locking leads to the "EPERM" errors on Windows https://github.com/isaacs/node-graceful-fs/pull/119
    const tmpFile = await (async () => {
        let fileStats: Stats | undefined;

        try {
            fileStats = await fs.stat(file);
        } catch (error) {
            if (error.code !== FS_ERROR_CODE_ENOENT) {
                throw error;
            }
        }

        const resultFile = generateTmpFileName(fileStats ? await fs.realpath(file) : file);
        const fd = await fs.open(resultFile, "w");

        try {
            await fs.writeFile(resultFile, data, writeFileOptions);

            if (atomicOptions.fsync) {
                await fs.fsync(fd);
            }
        } finally {
            await fs.close(fd);
        }

        if (fileStats) {
            await fs.chown(resultFile, fileStats.uid, fileStats.gid);
            await fs.chmod(resultFile, fileStats.mode);
        }

        return resultFile;
    })();

    try {
        return await fs.rename(tmpFile, file);
    } catch (renameError) {
        const errors = [
            renameError,
            new Error(`Failed to rename "${tmpFile}" => "${file}".`),
        ];

        // making sure temporary file is removed
        // TODO consider removing temp file on "process.on('exit')"
        try {
            await fs.unlink(tmpFile);
        } catch (unlinkError) {
            errors.push(unlinkError);
        }

        throw combineErrors(errors);
    }
}

export {
    Model,
    writeFileAtomic,
};
