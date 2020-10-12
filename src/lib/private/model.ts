import {NAME as FS_NAME} from "./fs-impl/fs";
import {WriteFile, WriteFileAtomic} from "./fs-write-model";
import {TODO} from "./types";
import {promisify} from "util";
import fs from "fs";

export interface Store<E extends StoreEntity> extends StoreOptions<E> {
    clone(opts?: Partial<StoreOptions<E>>): Store<E>;

    readable(): Promise<boolean>;

    readExisting(options?: { adapter?: StoreAdapter }): Promise<E>;

    read(options?: { adapter?: StoreAdapter }): Promise<E | null>;

    write(data: E, options?: { readAdapter?: StoreAdapter }): Promise<E>;

    validate(data: E, messagePrefix?: string): Promise<void>;

    remove(): Promise<void>;
}

export interface VersionedStoreEntity {
    readonly _rev: number;
}

export interface StoreEntity extends Partial<VersionedStoreEntity> {
}

export interface StoreOptionsBase<E extends StoreEntity> {
    readonly file: string;
    readonly adapter?: StoreAdapter;
    readonly optimisticLocking?: boolean;
    readonly validators?: Array<StoreValidator<E>>;
}

export type StoreOptions<E extends StoreEntity> = StoreOptionsBase<E> & { readonly fs: StoreFs; };

export type StoreOptionsInput<E extends StoreEntity> = StoreOptionsBase<E> & {
    readonly fs?: StoreFs;
    readonly serialize?: (data: E) => Uint8Array | Buffer;
    readonly deserialize?: (data: Uint8Array | Buffer) => E;
};

export interface StoreAdapter {
    write(data: Buffer): Promise<Buffer>;

    read(data: Buffer): Promise<Buffer>;
}

export type StoreValidator<E extends StoreEntity> = (data: E) => Promise<string | null>;

const storeFsMethods = Object.freeze({
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

export type StoreFsReference = typeof storeFsMethods & WriteFile;

export type StoreFs =
    StoreFsReference
    & WriteFileAtomic
    & { _impl: TODO; }
    & { _name: typeof FS_NAME | string; };
