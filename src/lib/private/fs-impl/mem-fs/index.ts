import {createFsFromVolume, Volume} from "memfs";
import {promisify} from "util";

import {StoreFs} from "../../model";

// keep definition on file top
export const NAME = "internal.memfs";

export function volume(): StoreFs {
    const vol = new Volume();
    const impl = createFsFromVolume(vol);

    return {
        _impl: impl,
        _name: NAME,
        chmod: promisify(impl.chmod),
        chown: promisify(impl.chown),
        mkdir: promisify(impl.mkdir),
        open: promisify(impl.open),
        close: promisify(impl.close),
        fsync: promisify(impl.fsync),
        readFile: promisify(impl.readFile),
        realpath: promisify(impl.realpath),
        rename: promisify(impl.rename),
        stat: promisify(impl.stat),
        writeFile: promisify(impl.writeFile),
        writeFileAtomic: promisify(impl.writeFile),
        unlink: promisify(impl.unlink),
    };
}

export const fs: StoreFs = volume();
