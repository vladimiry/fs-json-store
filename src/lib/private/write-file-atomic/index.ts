import combineErrors from "combine-errors";
import imurmurhash from "imurmurhash";
import {PathLike, Stats} from "fs";
import onExit from "signal-exit";

import * as Model from "./model";
import {FS_ERROR_CODE_ENOENT} from "../constants";
import {WriteFileOptions} from "../fs-write-model";
import {StoreFsReference} from "../model";
import {TODO} from "../types";

const defaultAtomicOptions: Model.WriteFileAtomicOptions = {
    fsync: true,
    disableChmod: true,
    disableChown: true,
};

const generateTmpFileName: (file: string) => string = ((): TODO => {
    let getTmpFilePathInvocation = 0;

    return (file: string) => file + "." + imurmurhash(__filename)
        .hash(String(process.pid))
        .hash(String(++getTmpFilePathInvocation))
        .hash(String(Date.now()))
        .result();
})();

async function writeFileAtomic(
    fs: Pick<StoreFsReference, "stat" | "realpath" | "open" | "writeFile" | "fsync" | "close" | "chown" | "chmod" | "rename" | "unlink">
        & { unlinkSync: typeof import("fs")["unlinkSync"] },
    filePath: PathLike,
    data: TODO,
    writeFileOptions?: WriteFileOptions,
    atomicOptionsInput?: Partial<Model.WriteFileAtomicOptions>,
): Promise<void> {
    const atomicOptions: Model.WriteFileAtomicOptions = {...defaultAtomicOptions, ...atomicOptionsInput};
    const file = filePath.toString();
    const cleanup: { threw: boolean; unlinkTmpFileSync?: () => void; removeOnExitHandler?: () => void } = {threw: true};

    try {
        // in order to reduce the same file locking probability renaming occurs in serial mode using "queue" approach
        // locking leads to the "EPERM" errors on Windows https://github.com/isaacs/node-graceful-fs/pull/119
        const tmpFile = await (async () => {
            let fileStats: Stats | undefined;

            try {
                fileStats = await fs.stat(file);
            } catch (error) {
                if ((Object(error) as {code?: unknown}).code !== FS_ERROR_CODE_ENOENT) {
                    throw error;
                }
            }

            const resultFile = generateTmpFileName(fileStats ? await fs.realpath(file) : file);

            cleanup.removeOnExitHandler = onExit(
                cleanup.unlinkTmpFileSync = () => {
                    try {
                        fs.unlinkSync(tmpFile);
                    } catch (_) {
                        // NOOP
                    }
                },
            );

            const fd = await fs.open(resultFile, "w");

            try {
                await fs.writeFile(resultFile, data, writeFileOptions);

                if (atomicOptions.fsync) {
                    await fs.fsync(fd);
                }
            } finally {
                try {
                    await fs.close(fd);
                } catch (_) {
                    // the "fd" might be already closed by error
                }
            }

            if (fileStats) {
                if (!atomicOptions.disableChown) {
                    await fs.chown(resultFile, fileStats.uid, fileStats.gid);
                }
                if (!atomicOptions.disableChmod) {
                    await fs.chmod(resultFile, fileStats.mode);
                }
            }

            return resultFile;
        })();

        try {
            const result = await fs.rename(tmpFile, file);
            cleanup.threw = false;
            return result;
        } catch (renameError) {
            const errors = [
                renameError,
                new Error(`Failed to rename "${tmpFile}" => "${file}".`),
            ] as const;

            try {
                await fs.unlink(tmpFile);
            } catch (_) {
                // also gets unlinked in "finally" block
            }

            throw combineErrors(errors);
        }
    } finally {
        const {threw, removeOnExitHandler, unlinkTmpFileSync} = cleanup;

        if (removeOnExitHandler) {
            removeOnExitHandler();
        }
        if (threw && unlinkTmpFileSync) {
            unlinkTmpFileSync();
        }
    }
}

export {
    Model,
    writeFileAtomic,
};
