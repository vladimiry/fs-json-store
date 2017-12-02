import {createFsFromVolume, Volume} from "memfs";

import {StoreFs} from "../../model";
import {promisify} from "../../private/util.promisify";

export function volume(): StoreFs {
    const vol = new Volume();
    const impl = createFsFromVolume(vol);

    return {
        impl,
        mkdir: promisify(impl.mkdir),
        open: promisify(impl.open),
        close: promisify(impl.close),
        readFile: promisify(impl.readFile),
        stat: promisify(impl.stat),
        writeFile: promisify(impl.writeFile),
        unlink: promisify(impl.unlink),
    };
}

export const fs: StoreFs = volume();
