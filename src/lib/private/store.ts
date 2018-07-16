import kindOf from "kind-of";
import path from "path";
import properLockfile from "proper-lockfile";
import {callbackify} from "util";

import * as Model from "./model";
import {fs as defaultFs} from "./fs-impl/fs/index";
import {FS_ERROR_CODE_EEXIST, FS_ERROR_CODE_ENOENT, MKDIR_MODE} from "./constants";
import {NAME as MEMFS_NAME} from "./fs-impl/mem-fs";
import {StoreFsReference} from "./model";

export class Store<E extends Model.StoreEntity> implements Model.Store<E> {
    private readonly options: Model.StoreOptions<E>;

    constructor(options: Model.StoreOptionsInput<E>) {
        this.options = Object.freeze({...options, fs: options.fs || defaultFs});
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

    public clone(opts?: Partial<Model.StoreOptions<E>>) {
        return new Store<E>({
            ...this.options,
            ...opts,
            // enforcing options state to always have the "file" property filled
            file: path.resolve(opts && opts.file || this.file),
        });
    }

    public async readable() {
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

    public async readExisting(options?: { adapter?: Model.StoreAdapter }) {
        const response = await this.read(options);

        if (!response) {
            throw new Error(`${this.file} does not exist`);
        }

        return response;
    }

    public async read(options?: { adapter?: Model.StoreAdapter }) {
        const readable = await this.readable();

        if (!readable) {
            return null;
        }

        const buffer = await this.fs.readFile(this.file);
        const adapter = (options && options.adapter) || this.adapter;
        const adaptedBuffer = adapter ? await adapter.read(buffer) : buffer;
        const data = JSON.parse(adaptedBuffer.toString());

        await this.validate(data, "Reading validation: ");

        return data;
    }

    public async write(data: E, options?: { readAdapter?: Model.StoreAdapter }) {
        const dataType = kindOf(data);
        const dir = path.dirname(this.file);

        if (this.optimisticLocking && dataType !== "object") {
            throw new Error([
                `With the optimistic locking enabled stored data must be of the "object" type, `,
                `while passed for writing data is of the "${dataType}" type.`,
            ].join(""));
        }

        data = Object.freeze(data);

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
            const buffer = Buffer.from(JSON.stringify(dataToSave, null, 4));
            const adaptedBuffer = this.adapter ? await this.adapter.write(buffer) : buffer;

            await this.fs.writeFile(this.file, adaptedBuffer);

            return this.readExisting();
        };

        if (this.optimisticLocking) {
            const nextRevision = await this.resolveNewRevision(data, options && options.readAdapter);
            const releaseLock = await properLockfile.lock(`${this.file}`, {fs: this.callbackifiedFsImpl(), realpath: false});

            try {
                return await finalAction(Object.assign({}, data, {_rev: nextRevision}));
            } finally {
                await releaseLock();
            }
        }

        return await finalAction(data);
    }

    public async validate(data: E, messagePrefix?: string) {
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

    public async remove() {
        await this.fs.unlink(this.file);
    }

    protected async resolveNewRevision(payloadData: E, readAdapter?: Model.StoreAdapter): Promise<number> {
        const {_rev} = payloadData;
        const storedData = await this.read({adapter: readAdapter});

        if (!storedData) {
            return typeof _rev === "number" ? _rev : 0;
        }

        const storedDataVersioned = typeof storedData._rev === "number";
        const payloadDataVersioned = typeof _rev === "number";

        if (!storedDataVersioned && payloadDataVersioned) {
            throw new Error(`Version value (${_rev}) can't be passed for updating not yet versioned file "${this.file}"`);
        }

        if (!storedDataVersioned || !payloadDataVersioned || storedData._rev !== _rev) {
            throw new Error([
                `"${this.file}" has been updated by another process. `,
                `Revisions of the persisted (${storedData._rev}) and payload (${_rev}) data don't match`,
            ].join(""));
        }

        return storedData._rev + 1;
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

    protected callbackifiedFsImpl(): Record<keyof StoreFsReference, (...params: any[]) => void> {
        if (this.fs._name === MEMFS_NAME) {
            return this.fs._impl;
        }

        return Object
            .keys(this.fs._impl)
            .filter((key) => {
                return !["writeFileAtomic", "impl"].includes(key) && typeof this.fs._impl[key] === "function";
            })
            .reduce((accumulator, key) => {
                accumulator[key] = callbackify(this.fs._impl[key]);
                return accumulator;
            }, {} as any);
    }
}
