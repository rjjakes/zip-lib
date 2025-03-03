"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Zip = void 0;
const yazl = require("yazl");
const fs_1 = require("fs");
const exfs = require("./fs");
const path = require("path");
const util = require("./util");
const cancelable_1 = require("./cancelable");
const matcher = require("matcher");
/**
 * Compress files or folders to a zip file.
 */
class Zip extends cancelable_1.Cancelable {
    /**
     *
     */
    constructor(options) {
        super();
        this.options = options;
        this.isPipe = false;
        this.zipFiles = [];
        this.zipFolders = [];
    }
    /**
     * Adds a file from the file system at realPath into the zipfile as metadataPath.
     * @param file
     * @param metadataPath Typically metadataPath would be calculated as path.relative(root, realPath).
     * A valid metadataPath must not start with "/" or /[A-Za-z]:\//, and must not contain "..".
     */
    addFile(file, metadataPath) {
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
    addFolder(folder, metadataPath) {
        this.zipFolders.push({
            path: folder,
            metadataPath
        });
    }
    /**
     * Generate zip file.
     * @param zipFile the zip file path.
     */
    async archive(zipFile) {
        if (!zipFile) {
            return Promise.reject(new Error("zipPath must not be empty"));
        }
        const token = new cancelable_1.CancellationToken();
        this.token = token;
        this.isPipe = false;
        await exfs.ensureFolder(path.dirname(zipFile));
        // Re-instantiate yazl every time the archive method is called to ensure that files are not added repeatedly.
        // This will also make the Zip class reusable.
        this.yazlFile = new yazl.ZipFile();
        return new Promise(async (c, e) => {
            this.yazlFile.once("error", (err) => {
                e(this.wrapError(err, token.isCancelled));
            });
            const zip = this.yazlFile;
            if (!token.isCancelled) {
                this.zipStream = fs_1.createWriteStream(zipFile);
                this.zipStream.once("error", (err) => {
                    e(this.wrapError(err, token.isCancelled));
                });
                this.zipStream.once("close", () => {
                    if (token.isCancelled) {
                        e(this.canceledError());
                    }
                    else {
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
            }
            catch (error) {
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
    cancel() {
        if (this.token) {
            this.token.cancel();
            this.token = null;
        }
        this.stopPipe(this.canceledError());
    }
    async addEntry(zip, entry, file, token) {
        if (!this.ignoreFile(file)) {
            if (entry.isSymbolicLink) {
                if (this.followSymlink()) {
                    if (entry.type === "dir") {
                        const realPath = await util.realpath(file.path);
                        await this.walkDir([{ path: realPath, metadataPath: file.metadataPath }], token);
                    }
                    else {
                        zip.addFile(file.path, file.metadataPath);
                    }
                }
                else {
                    await this.addSymlink(zip, entry, file.metadataPath);
                }
            }
            else {
                if (entry.type === "dir") {
                    zip.addEmptyDirectory(file.metadataPath, {
                        mtime: entry.mtime,
                        mode: entry.mode
                    });
                }
                else {
                    await this.addFileStream(zip, entry, file.metadataPath, token);
                }
            }
        }
    }
    addFileStream(zip, file, metadataPath, token) {
        return new Promise((c, e) => {
            const fileStream = fs_1.createReadStream(file.path);
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
    async addSymlink(zip, file, metadataPath) {
        const linkTarget = await util.readlink(file.path);
        zip.addBuffer(Buffer.from(linkTarget), metadataPath, {
            mtime: file.mtime,
            mode: file.mode
        });
    }
    async walkDir(folders, token) {
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
            }
            else {
                // If the folder is empty and the metadataPath has a value,
                // an empty folder should be created based on the metadataPath
                if (folder.metadataPath) {
                    this.yazlFile.addEmptyDirectory(folder.metadataPath);
                }
            }
        }
    }
    stopPipe(err) {
        if (this.isPipe) {
            this.yazlFile.outputStream.unpipe(this.zipStream);
            this.zipStream.destroy(err);
            this.isPipe = false;
        }
    }
    ignoreFile(file) {
        var _a, _b;
        if (typeof ((_a = this.options) === null || _a === void 0 ? void 0 : _a.ignorePattern) === 'object') {
            const result = matcher([file.path], (_b = this.options) === null || _b === void 0 ? void 0 : _b.ignorePattern);
            if (result.length !== 0) {
                return true;
            }
        }
        return false;
    }
    followSymlink() {
        let followSymlink = false;
        if (this.options &&
            this.options.followSymlinks === true) {
            followSymlink = true;
        }
        return followSymlink;
    }
}
exports.Zip = Zip;
//# sourceMappingURL=zip.js.map