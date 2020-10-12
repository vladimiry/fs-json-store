import kindOf from "kind-of";
import path from "path";
import properLockfile, {LockOptions} from "proper-lockfile";
import {callbackify} from "util";
import {fs as defaultFs} from "./fs-impl/fs";

import * as Model from "./model";
import {StoreFs} from "./model";
import {FS_ERROR_CODE_EEXIST, FS_ERROR_CODE_ENOENT, MKDIR_MODE} from "./constants";
import {TODO} from "./types";

export class Store<E extends Model.StoreEntity> implements Model.Store<E> {
    private readonly options: Model.StoreOptions<E>;
    private readonly serialize: Required<Model.StoreOptionsInput<E>>["serialize"];
    private readonly deserialize: Required<Model.StoreOptionsInput<E>>["deserialize"];
    private readonly properLockfileFs: Required<LockOptions>["fs"];

    constructor(options: Model.StoreOptionsInput<E>) {
        this.options = Object.freeze({...options, fs: options.fs ?? defaultFs});
        this.serialize = options.serialize ?? ((data: E) => Buffer.from(JSON.stringify(data)));
        this.deserialize = options.deserialize ?? ((data: Uint8Array | Buffer) => JSON.parse(Buffer.from(data).toString()));
        this.properLockfileFs = this.callbackifyFsImpl();
    }

    get adapter(): Model.StoreAdapter | undefined {
        return this.options.adapter;
    }

    get file(): string {
        return this.options.file;
    }

    get fs(): Model.StoreFs {
        return this.options.fs;
    }

    get optimisticLocking(): boolean {
        return this.options.optimisticLocking || false;
    }

    get validators(): Array<Model.StoreValidator<E>> | undefined {
        return this.options.validators;
    }

    public clone(opts?: Partial<Model.StoreOptions<E>>): Store<E> {
        return new Store<E>({
            ...this.options,
            ...opts,
            // enforcing options state to always have the "file" property filled
            file: path.resolve(opts && opts.file || this.file),
        });
    }

    public async readable(): Promise<boolean> {
        let fd: number;

        try {
            fd = await this.fs.open(this.file, "r+");
        } catch (error) {
            if (error.code === FS_ERROR_CODE_ENOENT) {
                return false;
            }
            throw error;
        }

        await this.fs.close(fd);

        return true;
    }

    public async readExisting(options?: { adapter?: Model.StoreAdapter }): Promise<E> {
        const response = await this.read(options);

        if (!response) {
            throw new Error(`${this.file} does not exist`);
        }

        return response;
    }

    public async read(options?: { adapter?: Model.StoreAdapter }): Promise<E | null> {
        const readable = await this.readable();

        if (!readable) {
            return null;
        }

        const buffer = await this.fs.readFile(this.file);
        const adapter = (options && options.adapter) ?? this.adapter;
        const adaptedBuffer = adapter ? await adapter.read(buffer) : buffer;
        const data = this.deserialize(adaptedBuffer);

        await this.validate(data, "Reading validation: ");

        return data;
    }

    public async write(data: E, options?: { readAdapter?: Model.StoreAdapter }): Promise<E> {
        const dataType = kindOf(data);
        const dir = path.dirname(this.file);

        if (this.optimisticLocking && dataType !== "object") {
            throw new Error([
                `With the optimistic locking enabled stored data must be of the "object" type, `,
                `while passed for writing data is of the "${dataType}" type.`,
            ].join(""));
        }

        await this.validate(data, "Writing validation: ");

        try {
            await this.fs.stat(dir);
        } catch (err) {
            if (err.code === FS_ERROR_CODE_ENOENT) {
                await this.mkdirRecursive(dir);
            } else {
                throw err;
            }
        }

        const finalAction = async (dataToSave: E) => {
            const buffer = Buffer.from(this.serialize(dataToSave));
            const adaptedBuffer = this.adapter ? await this.adapter.write(buffer) : buffer;

            await this.fs.writeFileAtomic(this.file, adaptedBuffer);

            return this.readExisting();
        };

        if (this.optimisticLocking) {
            const nextRevision = await this.resolveNewRevision(data, options && options.readAdapter);
            const releaseLock = await properLockfile.lock(
                `${this.file}`,
                {fs: this.properLockfileFs, realpath: false},
            );

            try {
                return await finalAction(Object.assign({}, data, {_rev: nextRevision}));
            } finally {
                await releaseLock();
            }
        }

        return await finalAction(data);
    }

    public async validate(data: E, messagePrefix?: string): Promise<void> {
        if (!this.validators || !this.validators.length) {
            return;
        }

        for (const validator of this.validators) {
            const invalidMessage = await validator(data);

            if (invalidMessage !== null) {
                throw new Error(`${messagePrefix || ""}${invalidMessage}`);
            }
        }
    }

    public async remove(): Promise<void> {
        await this.fs.unlink(this.file);
    }

    protected async resolveNewRevision(payloadData: E, readAdapter?: Model.StoreAdapter): Promise<number> {
        const {_rev: payloadRev} = payloadData;
        const storedData = await this.read({adapter: readAdapter});

        if (!storedData) {
            return typeof payloadRev === "number" ? payloadRev : 0;
        }

        const {_rev: storedRev} = storedData;
        // TODO TS doesn't understand constant based "typeof" type guards
        const payloadDataVersioned = typeof payloadRev === "number";
        const storedDataVersioned = typeof storedRev === "number";

        if (!storedDataVersioned && payloadDataVersioned) {
            throw new Error(`Version value (${payloadRev}) can't be passed for updating unversioned file "${this.file}"`);
        }

        if (!storedDataVersioned || typeof payloadRev !== "number" || storedRev !== payloadRev) {
            throw new Error([
                `"${this.file}" has been updated by another process. `,
                `Revisions of the persisted (${storedRev}) and payload (${payloadRev}) data don't match`,
            ].join(""));
        }

        return storedRev + 1;
    }

    protected async mkdirRecursive(value: string) {
        const folderNames = value.split(path.sep);
        const pathsToCreate = [];

        for (let i = 0; i < folderNames.length; i++) {
            const partialPath = folderNames
                .slice(0, folderNames.length - i)
                .join(path.sep);

            try {
                if ((await this.fs.stat(partialPath)).isDirectory()) {
                    break;
                }
            } catch (err) {
                if (err.code !== FS_ERROR_CODE_ENOENT) {
                    throw err;
                }
            }

            if (partialPath) {
                pathsToCreate.push(partialPath);
            }
        }

        pathsToCreate.reverse();

        for (const pathToCreate of pathsToCreate) {
            try {
                await this.fs.mkdir(pathToCreate, MKDIR_MODE);
            } catch (error) {
                if (error.code !== FS_ERROR_CODE_EEXIST) { // directory might already be created by another/parallel process
                    throw error;
                }
            }
        }
    }

    protected callbackifyFsImpl(): Record<keyof StoreFs, (...args: unknown[]) => unknown> {
        return Object
            .keys(this.fs._impl)
            .filter((key) => typeof this.fs._impl[key] === "function")
            .reduce(
                (accumulator, key) => {
                    accumulator[key] = callbackify(
                        this.fs._impl[key],
                    );
                    return accumulator;
                },
                {} as TODO,
            );
    }
}
