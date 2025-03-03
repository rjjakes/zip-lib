import { Cancelable } from "./cancelable";
export interface IZipOptions {
    /**
     * Indicates how to handle when the given path is a symbolic link.
     *
     * `true`: add the target of the symbolic link to the zip.
     *
     * `false`: add symbolic link itself to the zip.
     *
     * The default value is `false`.
     */
    followSymlinks?: boolean;
    /**
     * Ignore files that follow a certain glob style pattern.
     */
    ignorePattern: Array<string>;
}
/**
 * Compress files or folders to a zip file.
 */
export declare class Zip extends Cancelable {
    private options?;
    /**
     *
     */
    constructor(options?: IZipOptions | undefined);
    private yazlFile;
    private isPipe;
    private zipStream;
    private zipFiles;
    private zipFolders;
    private token;
    /**
     * Adds a file from the file system at realPath into the zipfile as metadataPath.
     * @param file
     * @param metadataPath Typically metadataPath would be calculated as path.relative(root, realPath).
     * A valid metadataPath must not start with "/" or /[A-Za-z]:\//, and must not contain "..".
     */
    addFile(file: string, metadataPath?: string): void;
    /**
     * Adds a folder from the file system at realPath into the zipfile as metadataPath.
     * @param folder
     * @param metadataPath Typically metadataPath would be calculated as path.relative(root, realPath).
     * A valid metadataPath must not start with "/" or /[A-Za-z]:\//, and must not contain "..".
     */
    addFolder(folder: string, metadataPath?: string): void;
    /**
     * Generate zip file.
     * @param zipFile the zip file path.
     */
    archive(zipFile: string): Promise<void>;
    /**
     * Cancel compression.
     * If the cancel method is called after the archive is complete, nothing will happen.
     */
    cancel(): void;
    private addEntry;
    private addFileStream;
    private addSymlink;
    private walkDir;
    private stopPipe;
    private ignoreFile;
    private followSymlink;
}
