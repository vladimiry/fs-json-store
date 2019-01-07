// tslint:disable  no-any
export type TODO = any;

export type Arguments<F extends (...x: TODO[]) => TODO> =
    F extends (...x: infer A) => TODO ? A : never;

export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
