/// <reference types="node" />
import * as fs from "fs";
export declare function unlink(path: fs.PathLike): Promise<void>;
export declare function mkdir(path: fs.PathLike, mode?: string | number | null | undefined): Promise<void>;
export declare function realpath(path: fs.PathLike): Promise<string>;
export declare function stat(path: fs.PathLike): Promise<fs.Stats>;
export declare function lstat(path: fs.PathLike): Promise<fs.Stats>;
export declare function chmod(path: fs.PathLike, mode: string | number): Promise<void>;
export declare function readdir(path: fs.PathLike): Promise<string[]>;
export declare function access(path: fs.PathLike, mode?: number | undefined): Promise<void>;
export declare function rmdir(path: fs.PathLike): Promise<void>;
export declare function symlink(target: fs.PathLike, path: fs.PathLike, type: "dir" | "file" | "junction" | null | undefined): Promise<void>;
export declare function readlink(path: fs.PathLike): Promise<string>;
