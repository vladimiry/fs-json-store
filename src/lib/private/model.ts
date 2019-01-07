import {NAME as FS_NAME} from "./fs-impl/fs";
import {NAME as MEMFS_NAME} from "./fs-impl/mem-fs";
import {STORE_FS_METHODS} from "./constants";
import {WriteFile, WriteFileAtomic} from "./fs-write-model";
import {TODO} from "./types";

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

export type StoreFsReference = typeof STORE_FS_METHODS & WriteFile;

export type StoreFs =
    StoreFsReference
    & WriteFileAtomic
    & { _impl: TODO; }
    & { _name: typeof MEMFS_NAME | typeof FS_NAME | string; };
