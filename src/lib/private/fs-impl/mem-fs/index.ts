import {createFsFromVolume, Volume} from "memfs";
import {promisify} from "util";

import {StoreFs} from "../../model";
import {TODO} from "../../types";

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
        mkdir: promisify(impl.mkdir) as TODO,
        open: promisify(impl.open) as TODO,
        close: promisify(impl.close),
        fsync: promisify(impl.fsync),
        readFile: promisify(impl.readFile) as TODO,
        realpath: promisify(impl.realpath) as TODO,
        rename: promisify(impl.rename),
        stat: promisify(impl.stat) as TODO,
        writeFile: promisify(impl.writeFile),
        writeFileAtomic: promisify(impl.writeFile),
        unlink: promisify(impl.unlink),
    };
}

export const fs: StoreFs = volume();
