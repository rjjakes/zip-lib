import * as yazl from "yazl";
import { WriteStream, createWriteStream, createReadStream } from "fs";
import * as exfs from "./fs";
import * as path from "path";
import * as util from "./util";
import { Cancelable, CancellationToken } from "./cancelable";
import * as matcher from 'matcher';

interface ZipEntry {
    path: string;
    metadataPath?: string;
}

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
export class Zip extends Cancelable {
    /**
     *
     */
    constructor(private options?: IZipOptions) {
        super();
        this.zipFiles = [];
        this.zipFolders = [];
    }
    private yazlFile: yazl.ZipFile;
    private isPipe: boolean = false;
    private zipStream: WriteStream;
    private zipFiles: ZipEntry[];
    private zipFolders: ZipEntry[];

    private token: CancellationToken | null;
    /**
     * Adds a file from the file system at realPath into the zipfile as metadataPath.
     * @param file
     * @param metadataPath Typically metadataPath would be calculated as path.relative(root, realPath).
     * A valid metadataPath must not start with "/" or /[A-Za-z]:\//, and must not contain "..".
     */
    public addFile(file: string, metadataPath?: string): void {
        let mpath = metadataPath;
        if (!mpath) {
            mpath = path.basename(file);
        }
        this.zipFiles.push({
            path: file,
            metadataPath: mpath
        });
    }

    /**
     * Adds a folder from the file system at realPath into the zipfile as metadataPath.
     * @param folder
     * @param metadataPath Typically metadataPath would be calculated as path.relative(root, realPath).
     * A valid metadataPath must not start with "/" or /[A-Za-z]:\//, and must not contain "..".
     */
    public addFolder(folder: string, metadataPath?: string): void {
        this.zipFolders.push({
            path: folder,
            metadataPath
        });
    }

    /**
     * Generate zip file.
     * @param zipFile the zip file path.
     */
    public async archive(zipFile: string): Promise<void> {
        if (!zipFile) {
            return Promise.reject(new Error("zipPath must not be empty"));
        }
        const token = new CancellationToken();
        this.token = token;
        this.isPipe = false;
        await exfs.ensureFolder(path.dirname(zipFile));
        // Re-instantiate yazl every time the archive method is called to ensure that files are not added repeatedly.
        // This will also make the Zip class reusable.
        this.yazlFile = new yazl.ZipFile();
        return new Promise<void>(async (c, e) => {
            (this.yazlFile as any).once("error", (err: any) => {
                e(this.wrapError(err, token.isCancelled));
            });
            const zip = this.yazlFile;
            if (!token.isCancelled) {
                this.zipStream = createWriteStream(zipFile);
                this.zipStream.once("error", (err) => {
                    e(this.wrapError(err, token.isCancelled));
                });
                this.zipStream.once("close", () => {
                    if (token.isCancelled) {
                        e(this.canceledError());
                    } else {
                        c(void 0);
                    }
                });
                zip.outputStream.once("error", (err) => {
                    e(this.wrapError(err, token.isCancelled));
                });
                zip.outputStream.pipe(this.zipStream);
                this.isPipe = true;
            }
            try {
                const files = this.zipFiles;
                for (const file of files) {
                    const entry = await exfs.getFileEntry(file.path);
                    await this.addEntry(zip, entry, file, token);
                }
                if (this.zipFolders.length > 0) {
                    await this.walkDir(this.zipFolders, token);
                }
            } catch (error) {
                e(this.wrapError(error, token.isCancelled));
                return;
            }
            zip.end();
        });
    }

    /**
     * Cancel compression.
     * If the cancel method is called after the archive is complete, nothing will happen.
     */
    public cancel(): void {
        if(this.token) {
            this.token.cancel();
            this.token = null;
        }
        this.stopPipe(this.canceledError());
    }

    private async addEntry(zip: yazl.ZipFile, entry: exfs.FileEntry, file: ZipEntry, token: CancellationToken): Promise<void> {
        if (!this.ignoreFile(file)) {
            if (entry.isSymbolicLink) {
                if (this.followSymlink()) {
                    if (entry.type === "dir") {
                        const realPath = await util.realpath(file.path);
                        await this.walkDir([{path: realPath, metadataPath: file.metadataPath}], token);
                    } else {
                        zip.addFile(file.path, file.metadataPath!);
                    }
                } else {
                    await this.addSymlink(zip, entry, file.metadataPath!);
                }
            } else {
                if (entry.type === "dir") {
                    zip.addEmptyDirectory(file.metadataPath!, {
                        mtime: entry.mtime,
                        mode: entry.mode
                    });
                } else {
                    await this.addFileStream(zip, entry, file.metadataPath!, token);
                }
            }
        }
    }

    private addFileStream(zip: yazl.ZipFile, file: exfs.FileEntry, metadataPath: string, token: CancellationToken): Promise<void> {
        return new Promise<void>((c, e) => {
            const fileStream = createReadStream(file.path);
            fileStream.once("error", (err) => {
                const wrappedError = this.wrapError(err, token.isCancelled);
                this.stopPipe(wrappedError);
                e(wrappedError);
            });
            fileStream.once("close", () => {
                c();
            });
            // If the file attribute is known, add the entry using `addReadStream`,
            // this can reduce the number of calls to the `fs.stat` method.
            zip.addReadStream(fileStream, metadataPath, {
                mode: file.mode,
                mtime: file.mtime
            });
        });
    }

    private async addSymlink(zip: yazl.ZipFile, file: exfs.FileEntry, metadataPath: string): Promise<void> {
        const linkTarget = await util.readlink(file.path);
        zip.addBuffer(Buffer.from(linkTarget), metadataPath, {
            mtime: file.mtime,
            mode: file.mode
        });
    }

    private async walkDir(folders: ZipEntry[], token: CancellationToken): Promise<void> {
        for (const folder of folders) {
            if (token.isCancelled) {
                return;
            }
            const entries = await exfs.readdirp(folder.path);
            if (entries.length > 0) {
                for (const entry of entries) {
                    if (token.isCancelled) {
                        return;
                    }
                    const relativePath = path.relative(folder.path, entry.path);
                    const metadataPath = folder.metadataPath ? path.join(folder.metadataPath, relativePath) : relativePath;
                    await this.addEntry(this.yazlFile, entry, { path: entry.path, metadataPath }, token);
                }
            } else {
                // If the folder is empty and the metadataPath has a value,
                // an empty folder should be created based on the metadataPath
                if (folder.metadataPath) {
                    this.yazlFile.addEmptyDirectory(folder.metadataPath);
                }
            }
        }
    }

    private stopPipe(err: Error): void {
        if (this.isPipe) {
            this.yazlFile.outputStream.unpipe(this.zipStream);
            this.zipStream.destroy(err);
            this.isPipe = false;
        }
    }

    private ignoreFile(file: ZipEntry): boolean {
        if (typeof this.options?.ignorePattern === 'object') {
            const result = matcher([file.path], this.options?.ignorePattern)
            if (result.length !== 0) {
                return true;
            }
        }
        return false;
    }

    private followSymlink(): boolean {
        let followSymlink: boolean = false;
        if (this.options &&
            this.options.followSymlinks === true) {
            followSymlink = true;
        }
        return followSymlink;
    }
}