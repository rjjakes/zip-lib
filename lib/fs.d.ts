export interface FileEntry {
    path: string;
    isSymbolicLink: boolean;
    type: FileType;
    mtime: Date;
    mode: number;
}
export declare type FileType = "file" | "dir";
export declare function readdirp(folder: string): Promise<FileEntry[]>;
export declare function getFileEntry(target: string): Promise<FileEntry>;
export declare function ensureFolder(folder: string): Promise<void>;
export declare function pathExists(target: string): Promise<boolean>;
export declare function rimraf(target: string): Promise<void>;
export declare function isRootPath(target: string): boolean;
