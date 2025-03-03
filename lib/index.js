"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extract = exports.archiveFolder = exports.archiveFile = void 0;
const zip_1 = require("./zip");
const unzip_1 = require("./unzip");
__exportStar(require("./zip"), exports);
__exportStar(require("./unzip"), exports);
/**
 * Compress a single file to zip.
 * @param file
 * @param zipFile the zip file path.
 * @param options
 */
function archiveFile(file, zipFile, options) {
    const zip = new zip_1.Zip(options);
    zip.addFile(file);
    return zip.archive(zipFile);
}
exports.archiveFile = archiveFile;
/**
 * Compress all the contents of the specified folder to zip.
 * @param folder
 * @param zipFile the zip file path.
 * @param options
 */
function archiveFolder(folder, zipFile, options) {
    const zip = new zip_1.Zip(options);
    zip.addFolder(folder);
    return zip.archive(zipFile);
}
exports.archiveFolder = archiveFolder;
/**
 * Extract the zip file to the specified location.
 * @param zipFile
 * @param targetFolder
 * @param options
 */
function extract(zipFile, targetFolder, options) {
    const unzip = new unzip_1.Unzip(options);
    return unzip.extract(zipFile, targetFolder);
}
exports.extract = extract;
//# sourceMappingURL=index.js.map