// tslint:disable  no-any
export type TODO = any;

type Impossible<K extends keyof TODO> = { [P in K]: never }

export type NoExtraProps<T, U extends T = T> = U & Impossible<Exclude<keyof U, keyof T>>;
