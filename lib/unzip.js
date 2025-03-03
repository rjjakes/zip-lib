"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Unzip = void 0;
const yauzl = require("yauzl");
const exfs = require("./fs");
const fs_1 = require("fs");
const path = require("path");
const util = require("./util");
const cancelable_1 = require("./cancelable");
class EntryEvent {
    /**
     *
     */
    constructor(_entryCount) {
        this._entryCount = _entryCount;
        this._isPrevented = false;
    }
    get entryName() {
        return this._entryName;
    }
    set entryName(name) {
        this._entryName = name;
    }
    get entryCount() {
        return this._entryCount;
    }
    get isPrevented() {
        return this._isPrevented;
    }
    preventDefault() {
        this._isPrevented = true;
    }
    reset() {
        this._isPrevented = false;
    }
}
class EntryContext {
    constructor(_targetFolder, _realTargetFolder, symlinkAsFileOnWindows) {
        this._targetFolder = _targetFolder;
        this._realTargetFolder = _realTargetFolder;
        this.symlinkAsFileOnWindows = symlinkAsFileOnWindows;
        this._symlinkFileNames = [];
    }
    get decodeEntryFileName() {
        return this._decodeEntryFileName;
    }
    set decodeEntryFileName(name) {
        this._decodeEntryFileName = name;
    }
    get targetFolder() {
        return this._targetFolder;
    }
    get realTargetFolder() {
        return this._realTargetFolder;
    }
    get symlinkFileNames() {
        return this._symlinkFileNames;
    }
    getFilePath() {
        return path.join(this.targetFolder, this.decodeEntryFileName);
    }
    async isOutsideTargetFolder(tpath) {
        if (this.symlinkFileNames.length === 0) {
            return false;
        }
        if (process.platform === "win32" &&
            this.symlinkAsFileOnWindows) {
            return false;
        }
        for (const fileName of this.symlinkFileNames) {
            if (tpath.includes(fileName)) {
                const realFilePath = await util.realpath(tpath);
                if (realFilePath.indexOf(this.realTargetFolder) !== 0) {
                    return true;
                }
            }
        }
        return false;
    }
}
/**
 * Extract the zip file.
 */
class Unzip extends cancelable_1.Cancelable {
    /**
     *
     */
    constructor(options) {
        super();
        this.options = options;
    }
    /**
     * Extract the zip file to the specified location.
     * @param zipFile
     * @param targetFolder
     * @param options
     */
    async extract(zipFile, targetFolder) {
        let extractedEntriesCount = 0;
        const token = new cancelable_1.CancellationToken();
        this.token = token;
        if (this.isOverwrite()) {
            await exfs.rimraf(targetFolder);
        }
        if (token.isCancelled) {
            return Promise.reject(this.canceledError());
        }
        await exfs.ensureFolder(targetFolder);
        const realTargetFolder = await util.realpath(targetFolder);
        const zfile = await this.openZip(zipFile, token);
        this.zipFile = zfile;
        zfile.readEntry();
        return new Promise((c, e) => {
            let anyError = null;
            const total = zfile.entryCount;
            zfile.once("error", (err) => {
                this.closeZip();
                e(this.wrapError(err, token.isCancelled));
            });
            zfile.once("close", () => {
                this.zipFile = null;
                if (anyError) {
                    e(this.wrapError(anyError, token.isCancelled));
                }
                else {
                    if (token.isCancelled) {
                        e(this.canceledError());
                    }
                    // If the zip content is empty, it will not receive the `zfile.on("entry")` event.
                    else if (total === 0) {
                        c(void 0);
                    }
                }
            });
            // Because openZip is an asynchronous method, openZip may not be completed when calling cancel,
            // so we need to check if it has been canceled after the openZip method returns.
            if (token.isCancelled) {
                this.closeZip();
                return;
            }
            const entryContext = new EntryContext(targetFolder, realTargetFolder, this.symlinkToFile());
            const entryEvent = new EntryEvent(total);
            zfile.on("entry", async (entry) => {
                // use UTF-8 in all situations
                // see https://github.com/thejoshwolfe/yauzl/issues/84
                const rawName = entry.fileName.toString("utf8");
                // allow backslash
                const fileName = rawName.replace(/\\/g, "/");
                // Because `decodeStrings` is `false`, we need to manually verify the entryname
                // see https://github.com/thejoshwolfe/yauzl#validatefilenamefilename
                const errorMessage = yauzl.validateFileName(fileName);
                if (errorMessage != null) {
                    anyError = new Error(errorMessage);
                    this.closeZip();
                    e(anyError);
                    return;
                }
                entryEvent.entryName = fileName;
                this.onEntryCallback(entryEvent);
                entryContext.decodeEntryFileName = fileName;
                try {
                    if (entryEvent.isPrevented) {
                        entryEvent.reset();
                        zfile.readEntry();
                    }
                    else {
                        await this.handleEntry(zfile, entry, entryContext, token);
                    }
                    extractedEntriesCount++;
                    if (extractedEntriesCount === total) {
                        c();
                    }
                }
                catch (error) {
                    anyError = this.wrapError(error, token.isCancelled);
                    this.closeZip();
                    e(anyError);
                }
            });
        });
    }
    /**
     * Cancel decompression.
     * If the cancel method is called after the extract is complete, nothing will happen.
     */
    cancel() {
        if (this.token) {
            this.token.cancel();
            this.token = null;
        }
        this.closeZip();
    }
    closeZip() {
        if (this.zipFile) {
            this.zipFile.close();
            this.zipFile = null;
        }
    }
    openZip(zipFile, token) {
        return new Promise((c, e) => {
            yauzl.open(zipFile, {
                lazyEntries: true,
                // see https://github.com/thejoshwolfe/yauzl/issues/84
                decodeStrings: false
            }, (err, zfile) => {
                if (err) {
                    e(this.wrapError(err, token.isCancelled));
                }
                else {
                    c(zfile);
                }
            });
        });
    }
    async handleEntry(zfile, entry, entryContext, token) {
        if (/\/$/.test(entryContext.decodeEntryFileName)) {
            // Directory file names end with '/'.
            // Note that entires for directories themselves are optional.
            // An entry's fileName implicitly requires its parent directories to exist.
            await exfs.ensureFolder(entryContext.getFilePath());
            zfile.readEntry();
        }
        else {
            // file entry
            await this.extractEntry(zfile, entry, entryContext, token);
        }
    }
    openZipFileStream(zfile, entry, token) {
        return new Promise((c, e) => {
            zfile.openReadStream(entry, (err, readStream) => {
                if (err) {
                    e(this.wrapError(err, token.isCancelled));
                }
                else {
                    c(readStream);
                }
            });
        });
    }
    async extractEntry(zfile, entry, entryContext, token) {
        const filePath = entryContext.getFilePath();
        const fileDir = path.dirname(filePath);
        await exfs.ensureFolder(fileDir);
        const outside = await entryContext.isOutsideTargetFolder(fileDir);
        if (outside) {
            const error = new Error(`Refuse to write file outside "${entryContext.targetFolder}", file: "${filePath}"`);
            error.name = "AFWRITE";
            return Promise.reject(error);
        }
        const readStream = await this.openZipFileStream(zfile, entry, token);
        await this.writeEntryToFile(readStream, entry, entryContext, token);
        zfile.readEntry();
    }
    async writeEntryToFile(readStream, entry, entryContext, token) {
        let fileStream;
        token.onCancelled(() => {
            if (fileStream) {
                readStream.unpipe(fileStream);
                fileStream.destroy(this.canceledError());
            }
        });
        return new Promise(async (c, e) => {
            try {
                const filePath = entryContext.getFilePath();
                const mode = this.modeFromEntry(entry);
                // see https://unix.stackexchange.com/questions/193465/what-file-mode-is-a-symlink
                const isSymlink = ((mode & 0o170000) === 0o120000);
                readStream.once("error", (err) => {
                    e(this.wrapError(err, token.isCancelled));
                });
                if (isSymlink) {
                    entryContext.symlinkFileNames.push(entryContext.decodeEntryFileName);
                }
                if (isSymlink && !this.symlinkToFile()) {
                    let linkContent = "";
                    readStream.on("data", (chunk) => {
                        if (chunk instanceof String) {
                            linkContent += chunk;
                        }
                        else {
                            linkContent += chunk.toString();
                        }
                    });
                    readStream.once("end", () => {
                        this.createSymlink(linkContent, filePath).then(c, e);
                    });
                }
                else {
                    fileStream = fs_1.createWriteStream(filePath, { mode });
                    fileStream.once("close", () => c());
                    fileStream.once("error", (err) => {
                        e(this.wrapError(err, token.isCancelled));
                    });
                    readStream.pipe(fileStream);
                }
            }
            catch (error) {
                e(this.wrapError(error, token.isCancelled));
            }
        });
    }
    modeFromEntry(entry) {
        const attr = entry.externalFileAttributes >> 16 || 33188;
        return [448 /* S_IRWXU */, 56 /* S_IRWXG */, 7 /* S_IRWXO */]
            .map(mask => attr & mask)
            .reduce((a, b) => a + b, attr & 61440 /* S_IFMT */);
    }
    async createSymlink(linkContent, des) {
        let linkType = "file";
        if (process.platform === 'win32') {
            if (/\/$/.test(linkContent)) {
                linkType = "dir";
            }
            else {
                let targetPath = linkContent;
                if (!path.isAbsolute(linkContent)) {
                    targetPath = path.join(path.dirname(des), linkContent);
                }
                try {
                    const stat = await util.stat(targetPath);
                    if (stat.isDirectory()) {
                        linkType = "dir";
                    }
                }
                catch (error) {
                    // ignore
                }
            }
        }
        await util.symlink(linkContent, des, linkType);
    }
    isOverwrite() {
        if (this.options &&
            this.options.overwrite) {
            return true;
        }
        return false;
    }
    onEntryCallback(event) {
        if (this.options && this.options.onEntry) {
            this.options.onEntry(event);
        }
    }
    symlinkToFile() {
        let symlinkToFile = false;
        if (process.platform === "win32") {
            if (this.options &&
                this.options.symlinkAsFileOnWindows === false) {
                symlinkToFile = false;
            }
            else {
                symlinkToFile = true;
            }
        }
        return symlinkToFile;
    }
}
exports.Unzip = Unzip;
//# sourceMappingURL=unzip.js.map