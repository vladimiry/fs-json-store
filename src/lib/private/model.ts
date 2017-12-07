import {storeFsMethods} from "./constants";
import {WriteFile, WriteFileAtomic} from "./fs-write-model";

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

export type StoreOptionsInput<E extends StoreEntity> = StoreOptionsBase<E> & { readonly fs?: StoreFs; };

export interface StoreAdapter {
    write(data: Buffer): Promise<Buffer>;

    read(data: Buffer): Promise<Buffer>;
}

export type StoreValidator<E extends StoreEntity> = (data: E) => Promise<string | null>;

export type StoreFsReference = typeof storeFsMethods & WriteFile;

export type StoreFs = StoreFsReference & WriteFileAtomic & { impl: any; };
