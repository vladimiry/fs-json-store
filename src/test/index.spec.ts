import kindOf from "kind-of";
import path from "path";
import randomstring from "randomstring";
import sinon from "sinon";
import {test, TestContext} from "ava";

import {Fs, Model, Store} from "dist";

interface StoredObject extends Partial<Model.StoreEntity> {
    data: any;
}

const defaultFs = Fs.Fs.fs;
const buildMemFsVolume = Fs.MemFs.volume;

test("instantiating with default options", async (t) => {
    const options = Object.freeze({
        file: randomstring.generate(),
    });
    const store = new Store(options);
    t.is(store.file, options.file);
    t.is(store.fs, defaultFs);
    t.falsy(store.adapter);
    t.false(store.optimisticLocking);
    t.falsy(store.validators);
});

const memFsVolume = buildMemFsVolume();

memFsVolume.impl.mkdirpSync(process.cwd());

run(memFsVolume, {
    fsName: "memFs",
    outputPath: process.cwd(),
});

run(defaultFs, {
    fsName: "fs",
    outputPath: path.join(process.cwd(), "./output/test"),
});

function run(fs: Model.StoreFs, opts: { fsName: string, outputPath: string }) {
    test(`${opts.fsName}: read/write/remove`, async (t) => {
        const {spies, store} = buildStore(t);
        let store2: Store<StoredObject> | undefined;

        t.false(await store.readable());
        t.is(await store.read(), null);
        const error = await t.throws(store.readExisting());
        t.is(error.message, `${store.file} does not exist`);
        t.true(spies.adapter.read.notCalled);
        t.true(spies.adapter.write.notCalled);
        t.true(spies.validator.notCalled);

        try {
            // initial
            let data = {data: {value1: {random: Number(new Date())}, value2: {random: Number(new Date())}}};
            let dataDump = JSON.stringify(data);
            let storedData = await store.write(data);
            t.is(JSON.stringify(data), dataDump, "making sure data parameter has not been mutated");
            let expectedData = {...data, _rev: 0};
            t.deepEqual(storedData, expectedData);
            t.deepEqual(await store.readExisting(), expectedData);
            t.is(spies.adapter.write.callCount, 1);
            t.is(spies.adapter.read.callCount, 2);
            t.is(spies.validator.callCount, 3);

            // update
            data = {...storedData, data: {value3: {random: Number(new Date())}, value4: {random: Number(new Date())}}};
            dataDump = JSON.stringify(data);
            expectedData = {...data, _rev: storedData._rev + 1};
            storedData = await store.write(data);
            t.is(JSON.stringify(data), dataDump, "making sure data parameter has not been mutated");
            t.deepEqual(storedData, expectedData);
            t.deepEqual(await store.readExisting(), expectedData);
            t.is(spies.adapter.write.callCount, 2);
            t.is(spies.adapter.read.callCount, 5);
            t.is(spies.validator.callCount, 7);

            // without adapter
            store2 = store.clone({adapter: undefined});
            t.falsy(store2.adapter);
            data = {...storedData, data: {value5: {random: Number(new Date())}}};
            expectedData = {...data, _rev: storedData._rev + 1};
            storedData = await store2.write(data);
            t.deepEqual(storedData, expectedData);
            t.deepEqual(await store2.readExisting(), expectedData);
            t.is(spies.adapter.write.callCount, 2); // remains unchanged
            t.is(spies.adapter.read.callCount, 5); // remains unchanged
            t.is(spies.validator.callCount, 11);
        } finally {
            await store.remove();
            t.false(await store.readable());

            if (store2) {
                await t.throws(store2.remove());
            }
        }
    });

    test(`${opts.fsName}: versioning (optimistic locking)`, async (t) => {
        const {store} = buildStore(t);
        let store2: Store<StoredObject> | undefined;

        try {
            const invalidDataItems: any[] = [
                undefined,
                null,
                true,
                false,
                new Buffer(""),
                42,
                "str",
                new Date(),
                [1, 2, 3],
                /foo/,
                // tslint:disable:no-empty
                () => {
                },
                // tslint:enable:no-empty
            ];
            invalidDataItems.forEach(async (dataItem) => {
                const dataTypeError = await t.throws(store.write(dataItem));
                t.true(dataTypeError.message.indexOf(`while passed for writing data is of the "${kindOf(dataItem)}" type.`) !== -1);
            });

            const data = {_rev: 123, data: {value1: {random: Number(new Date())}, value2: {random: Number(new Date())}}};
            let storedData = await store.write(data);
            let expectedData = data;
            t.deepEqual(storedData, expectedData);

            expectedData = {...storedData, _rev: storedData._rev + 1};
            storedData = await store.write(storedData);
            t.deepEqual(storedData, expectedData);

            const wrongRevData1 = {...storedData, _rev: storedData._rev - 1};
            const failedRevValidation1 = await t.throws(store.write(wrongRevData1));
            t.true(failedRevValidation1.message.startsWith(`"${store.file}" has been updated by another process`));
            const wrongRevData2 = {...storedData, _rev: storedData._rev + 1};
            const failedRevValidation2 = await t.throws(store.write(wrongRevData2));
            t.true(failedRevValidation2.message.startsWith(`"${store.file}" has been updated by another process`));

            store2 = store.clone({optimisticLocking: false});
            storedData = await store2.write(wrongRevData1);
            t.deepEqual(storedData, wrongRevData1);
            storedData = await store2.write(wrongRevData2);
            t.deepEqual(storedData, wrongRevData2);
        } finally {
            await store.remove();
            t.false(await store.readable());

            if (store2) {
                await t.throws(store2.remove());
            }
        }
    });

    test(`${opts.fsName}: clone`, (t) => {
        const {store} = buildStore(t);

        // copy clone
        const store2 = store.clone();
        let state = {
            adapter: store2.adapter,
            fs: store2.fs,
            file: store2.file,
            optimisticLocking: store2.optimisticLocking,
            validators: store2.validators,
        };
        let expectedState = {
            adapter: store.adapter,
            fs: store.fs,
            file: store.file,
            optimisticLocking: store.optimisticLocking,
            validators: store.validators,
        };
        t.deepEqual(state, expectedState);

        // full clone expect "file"
        const {options} = buildStore(t);
        expectedState = {...options, file: store.file};
        const store3 = store.clone(expectedState);
        state = {
            adapter: store3.adapter,
            fs: store3.fs,
            file: store3.file,
            optimisticLocking: store3.optimisticLocking,
            validators: store3.validators,
        };
        t.deepEqual(state, expectedState);

        // reset clone
        const store4 = store.clone({
            adapter: undefined,
            fs: undefined,
            file: undefined,
            optimisticLocking: undefined,
            validators: undefined,
        });
        t.falsy(store4.adapter);
        t.is(store4.fs, defaultFs);
        t.is(store4.file, store.file, `"file" should remain filled despite of the "undefined" parameter passed`);
        t.falsy(store4.optimisticLocking);
        t.falsy(store4.validators);
    });

    test(`${opts.fsName}: custom validation`, async (t) => {
        interface Account {
            login: string;
        }

        interface Accounts extends Partial<Model.StoreEntity> {
            accounts: Account[];
        }

        const uniqueLoginValidatorSpy = sinon.spy();
        const uniqueLoginValidator = (async (value) => {
            uniqueLoginValidatorSpy(value);

            const duplicatedLogins = value.accounts
                .map((account) => account.login)
                .reduce((duplicated: string[], el, i, logins) => {
                    if (logins.indexOf(el) !== i && duplicated.indexOf(el) === -1) {
                        duplicated.push(el);
                    }
                    return duplicated;
                }, []);
            const result = duplicatedLogins.length
                ? `Duplicate accounts identified. Duplicated logins: ${duplicatedLogins.join(", ")}.`
                : null;

            return Promise.resolve(result);
        }) as Model.StoreValidator<Accounts>;
        const {store} = buildStore<Accounts>(t, {
            validators: [uniqueLoginValidator],
        });
        const login = "login1";

        t.is(store.validators && store.validators[0], uniqueLoginValidator);

        try {
            let data: Accounts = {accounts: []};
            let updatedData = await store.write(data);
            t.is(uniqueLoginValidatorSpy.callCount, 2);
            t.true(uniqueLoginValidatorSpy.calledWithExactly(data));

            data = {...updatedData, accounts: [...updatedData.accounts, {login}]};
            updatedData = await store.write(data);
            t.is(uniqueLoginValidatorSpy.callCount, 5);
            t.true(uniqueLoginValidatorSpy.calledWithExactly(data));

            data = {...updatedData, accounts: [...updatedData.accounts, {login}]};
            const validationError = await t.throws(store.write(data));
            t.true(validationError.message.indexOf(`Duplicate accounts identified. Duplicated logins: ${login}.`) !== -1);
            t.deepEqual(await store.read(), updatedData);
            t.is(uniqueLoginValidatorSpy.callCount, 7);
            t.true(uniqueLoginValidatorSpy.calledWithExactly(data));

            data = {...updatedData, accounts: [...updatedData.accounts, {login: "login2"}]};
            await store.write(data);
            t.deepEqual(await store.read(), {...data, _rev: updatedData._rev + 1});
            t.is(uniqueLoginValidatorSpy.callCount, 11);
            t.true(uniqueLoginValidatorSpy.calledWithExactly(data));

        } finally {
            await store.remove();
            t.false(await store.readable());
        }
    });

    // TODO test concurrent writing

    function buildStore<E extends Partial<Model.StoreEntity> = StoredObject>(
        t: TestContext,
        storeOpts?: Partial<Model.StoreOptions<E>>,
    ) {
        const spies = {
            adapter: {
                write: sinon.spy(),
                read: sinon.spy(),
            },
            validator: sinon.spy(),
        };
        const options = Object.freeze({
            ...{
                file: path.join(opts.outputPath, randomstring.generate({length: 7})),
                fs,
                optimisticLocking: true,
                adapter: {
                    async write(data: Buffer): Promise<Buffer> {
                        spies.adapter.write(data);
                        return data;
                    },
                    async read(data: Buffer): Promise<Buffer> {
                        spies.adapter.read(data);
                        return data;
                    },
                },
                validators: [
                    (async (data: E) => {
                        spies.validator(data);
                        return null;
                    }) as Model.StoreValidator<E>,
                ],
            },
            ...storeOpts,
        });
        const store = new Store<E>(options);

        t.is(store.file, options.file);
        t.is(store.fs, options.fs);
        t.is(store.adapter, options.adapter);
        t.is(store.optimisticLocking, options.optimisticLocking);
        t.is(store.validators, options.validators);

        return {spies, options, store};
    }
}
