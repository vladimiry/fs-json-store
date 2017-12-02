import {Options} from "fs-no-eperm-anymore/model";

export interface WriteFileAtomicOptions {
    retry: Options;
    fsync: boolean;
}
