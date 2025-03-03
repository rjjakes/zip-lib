"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Cancelable = exports.CancellationToken = void 0;
class CancellationToken {
    constructor() {
        this._isCancelled = false;
        this._callbacks = new Set();
    }
    /**
     * A flag signalling is cancellation has been requested.
     */
    get isCancelled() {
        return this._isCancelled;
    }
    /**
     * Subscribe a callback when cancellation is requested. The callback
     * only ever fires `once` as cancellation can only happen once.
     * @param cb A function will be called whent cancellation is requested.
     * @returns A function that Unsubscribe the cancellation callback.
     */
    onCancelled(cb) {
        if (this.isCancelled) {
            cb();
            return () => {
                // noop
            };
        }
        this._callbacks.add(cb);
        return () => this._callbacks.delete(cb);
    }
    cancel() {
        if (this._isCancelled) {
            return;
        }
        this._isCancelled = true;
        this._callbacks.forEach((cb) => cb());
        this._callbacks.clear();
    }
}
exports.CancellationToken = CancellationToken;
class Cancelable {
    /**
     * Ignore any other error if the `cancel` method has been called
     *
     * Error: EBADF: bad file descriptor, read
     * EBADF error may occur when calling the cancel method.
     * see https://travis-ci.org/fpsqdb/zip-lib/jobs/606040627#L124
     * @param error
     */
    wrapError(error, isCanceled) {
        if (isCanceled) {
            return this.canceledError();
        }
        return error;
    }
    /**
     * Returns an error that signals cancellation.
     */
    canceledError() {
        const error = new Error("Canceled");
        error.name = error.message;
        return error;
    }
}
exports.Cancelable = Cancelable;
//# sourceMappingURL=cancelable.js.map