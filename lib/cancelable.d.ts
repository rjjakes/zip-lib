export interface ICancelable {
    /**
     * Cancel operation
     */
    cancel(): void;
}
export declare class CancellationToken {
    private _isCancelled;
    private _callbacks;
    /**
     * A flag signalling is cancellation has been requested.
     */
    get isCancelled(): boolean;
    /**
     * Subscribe a callback when cancellation is requested. The callback
     * only ever fires `once` as cancellation can only happen once.
     * @param cb A function will be called whent cancellation is requested.
     * @returns A function that Unsubscribe the cancellation callback.
     */
    onCancelled(cb: () => void): () => void;
    cancel(): void;
}
export declare abstract class Cancelable implements ICancelable {
    abstract cancel(): void;
    /**
     * Ignore any other error if the `cancel` method has been called
     *
     * Error: EBADF: bad file descriptor, read
     * EBADF error may occur when calling the cancel method.
     * see https://travis-ci.org/fpsqdb/zip-lib/jobs/606040627#L124
     * @param error
     */
    protected wrapError(error: Error, isCanceled: boolean): Error;
    /**
     * Returns an error that signals cancellation.
     */
    protected canceledError(): Error;
}
