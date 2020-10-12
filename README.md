# fs-json-store

is a module for Node.js for storing JSON data on the file system.

[![Build Status: Linux / MacOS](https://travis-ci.org/vladimiry/fs-json-store.svg?branch=master)](https://travis-ci.org/vladimiry/fs-json-store) [![Build status: Windows](https://ci.appveyor.com/api/projects/status/xd0bul53gtt112lj?svg=true)](https://ci.appveyor.com/project/vladimiry/fs-json-store)

Module simply serializes/deserializes a file using `JSON.stringify / JSON.parse` functions, so it would not be a great idea to use it with a huge data sets, but it's ok for handling simple needs like storing app settings, etc.

## Features

- Atomic writing. Means data is not going to be corrupted (like getting half-written data file on abnormal program exit or power loss).
- File system abstraction.
- Custom adapters support. See [fs-json-store-encryption-adapter](https://github.com/vladimiry/fs-json-store-encryption-adapter) as an example.
- Custom validation functions support.
- Optimistic locking support (versioning).

## Technical Notes
- Module provides only `async` methods that return ES2015 Promises, `sync` methods set is not supported.
- Module copes with [EPERM errors](https://github.com/search?q=EPERM&type=Issues) using [fs-no-eperm-anymore](https://github.com/vladimiry/fs-no-eperm-anymore) module.
- Module uses a custom atomic file writing implementation for the following reasons:
  - atomic writing should be applied to all the fs abstractions (`StoreFs` implementations), not to just the node's `fs` module only, see [related issue](https://github.com/vladimiry/fs-json-store/issues/1) for details.
  - [write-file-atomic](https://github.com/npm/write-file-atomic) module [doesn't yet properly handle](https://github.com/npm/write-file-atomic/issues/28) the [EPERM errors](https://github.com/isaacs/node-graceful-fs/pull/119) on Windows.  

## Motivation

I needed a simple to use module for storing JSON data on the file system with atomic writing, custom adapters, custom validators, optimistic locking features supported and TypeScript declarations provided. Besides store is supposed to cope with the EPERM errors pseudo-randomly happening on Windows. I didn't find an existing module that would meet the criteria, so a new one has been built.

## Getting started

Using JavaScript and Promises:

```javascript
const {Store} = require("fs-json-store");

const store = new Store({file: "data.json"});

store.write(["hello"])
    .then((data) => store.write([...data, "world"]))
    .then(console.log) // prints "[ 'hello', 'world' ]"
    .then(() => store.read())
    .then(console.log); // prints "[ 'hello', 'world' ]"
```

Using TypeScript and async/await:

```typescript
import {Store} from "fs-json-store";

(async () => {
    const store = new Store({file: "data.json"});

    console.log( // prints "[ 'hello', 'world' ]"
        await store.write([...await store.write(["hello"]), "world",]),
    );
    console.log( // prints "[ 'hello', 'world' ]"
        await store.read(),
    );
})();
```

## Store Signatures 

### `constructor(options)`

- **`options`** `(object, required)`: an object with the flowing properties:
    - **`file`** `(string, required)`: store file path.
    - **`fs`** `(object, optional, defaults to the built-in node's "fs" wrapper)`: file system abstraction implementation. There is ony one built-in implementations which is a wrapped node's `fs` module. Custom abstractions can be added implementing the `StoreFs` interface.
    - **`adapter`** `(object, optional)`: object or class instance with the `write(data: Buffer): Promise<Buffer>` and `read(data: Buffer): Promise<Buffer` functions implemented. The custom adapter can be used for example for data encryption/archiving.
    - **`optimisticLocking`** `(boolean, optional, defaults to false)`: flag property that toggles optimistic locking feature. With optimistic locking feature enabled stored data must be of the JSON `object` type, since the system `_rev` counter property needs be injected into the stored object.

    - **`validators`** `(array, optional)`: array of the custom validation functions with the ```(data) => Promise<string | null>``` signature, where `data` is the stored data. Store executes exposed `validate` method during both `read / write` operations.

### `clone([options]): Store<E>`

Synchronous method that returns a cloned store instance. See `options` parameter description in the `constructor` section, with the only difference is in that all the properties are optional, including the `file` property.

### `readable(): Promise<boolean>`

Asynchronous method that returns `true` if `file` associated with store is readable. It's basically a replacement for the `exists` method.

### `readExisting([options]): Promise<E>`

Asynchronous method that returns the stored data. Method throws an error if store is not `readable()`. Optional `options` argument is an object that can have the optional `adapter` property. Store uses the explicitly specified `adapter` overriding the instance's adapter just for the single `read` method execution (it might be useful for example in case if the data file initially was written using another adapter, so initial reading can be done using explicitly specified adapter).

### `read([options]): Promise<E | null>`

Asynchronous method that returns the stored data. Optional `options` argument is the same argument as in the `readExisting` method case.

### `write(data, [options]): Promise<E>`

Asynchronous method that writes data to `file` and returns the actual data. Optional `options.readAdapter` argument will be passed to the `read` method as the `options.adapter` argument (`read` method needs to be called during writing in case of the optimistic locking feature enabled).

### `validate(data, messagePrefix?: string): Promise<void>`

Asynchronous method that runs validation functions and throws an error in case of failed validation. Optional `messagePrefix` parameter will be added as a prefix to the error message.

### `remove(): Promise<void>`

Asynchronous method that removes the store associated `file`.

## Usage Examples

```typescript
import * as path from "path";
import * as pako from "pako";
import {Store, Model} from "fs-json-store";

const dataDirectory = path.join(process.cwd(), "output", String(Number(new Date())));

const examples = [
    // basic
    async () => {
        const store = new Store({file: path.join(dataDirectory, "basic.json")});

        await store.write([
            ...await store.write(["hello"]),
            "world",
        ]);

        console.log((await store.read()).join(" ")); // prints `hello world`
    },

    // archiving adapter
    async () => {
        const store = new Store({
            file: path.join(dataDirectory, "archiving-adapter.bin"),
            adapter: {
                async read(data) {
                    return Buffer.from(pako.ungzip(data.toString(), {to: "string"}));
                },
                async write(data) {
                    return Buffer.from(pako.gzip(data.toString(), {to: "string"}));
                },
            },
        });

        await store.write({data: "archive data"});

        console.log(JSON.stringify(await store.read())); // prints `{"data":"archive data"}`
    },

    // validation
    async () => {
        interface DataModel extends Partial<Model.StoreEntity> {
            numbers: number[];
        }

        const store = new Store<DataModel>({
            file: path.join(dataDirectory, "validation.json"),
            validators: [
                async ({numbers}) => {
                    if (!numbers || !numbers.length) {
                        return `"numbers" array is not supposed to be empty`;
                    }

                    return null;
                },
            ],
        });

        try {
            await store.write({numbers: []});
        } catch (error) {
            console.log(error); // prints error due to the failed validation
        }

        const storedData = await  store.write({numbers: [1]});
        console.log(JSON.stringify(storedData)); // prints `{"numbers":[1]}`
    },

    // optimistic locking (versioning)
    async () => {
        const store = new Store({
            file: path.join(dataDirectory, "versioning.json"),
            optimisticLocking: true,
        });
        let storedData = await store.write({property: "initial data"});

        console.log(storedData._rev); // prints `0`

        try {
            await store.write({newProperty: "new data"});
        } catch (error) {
            console.log(error); // prints error since `_rev` has not been specified
        }

        try {
            await store.write({newProperty: "new data", _rev: 3});
        } catch (error) {
            console.log(error); // prints error since valid `_rev` has not been specified
        }

        storedData = await store.write({newProperty: "new data", _rev: storedData._rev});
        console.log(storedData._rev); // prints `1`
    },
];

(async () => {
    for (const example of examples) {
        await example();
    }
})();

```
