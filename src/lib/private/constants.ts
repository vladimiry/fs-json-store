// TODO TS4023: get rid of the not actually used "url" import
// related issue https://github.com/Microsoft/TypeScript/issues/9944
import fs from "fs";
import url from "url";
import {promisify} from "util";

export const FS_ERROR_CODE_ENOENT = "ENOENT";
export const FS_ERROR_CODE_EEXIST = "EEXIST";

export const MKDIR_MODE = 0o755;

export const STORE_FS_METHODS = Object.freeze({
    chmod: promisify(fs.chmod),
    chown: promisify(fs.chown),
    close: promisify(fs.close),
    fsync: promisify(fs.fsync),
    mkdir: promisify(fs.mkdir),
    open: promisify(fs.open),
    readFile: promisify(fs.readFile),
    realpath: promisify(fs.realpath),
    rename: promisify(fs.rename),
    stat: promisify(fs.stat),
    unlink: promisify(fs.unlink),
    writeFile: promisify(fs.writeFile),
});
