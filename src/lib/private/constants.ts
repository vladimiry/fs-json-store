import * as url from "url"; // needed fro the automatic TypeScript declaration generating
import * as fs from "fs";

import {promisify} from "./util.promisify";

export const FS_ERROR_CODE_ENOENT = "ENOENT";
export const FS_ERROR_CODE_EEXIST = "EEXIST";

export const MKDIR_MODE = 0o755;

export const storeFsMethods = Object.freeze({
    close: promisify(fs.close),
    mkdir: promisify(fs.mkdir),
    open: promisify(fs.open),
    readFile: promisify(fs.readFile),
    stat: promisify(fs.stat),
    unlink: promisify(fs.unlink),
});
