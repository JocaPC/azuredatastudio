/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { globals } from 'vs/base/common/platform';
import { IWorker, IWorkerCallback, IWorkerFactory, logOnceWebWorkerWarning } from 'vs/base/common/worker/simpleWorker';

function getWorker(workerId: string, label: string): Worker | Promise<Worker> {
	// Option for hosts to overwrite the worker script (used in the standalone editor)
	if (globals.MonacoEnvironment) {
		if (typeof globals.MonacoEnvironment.getWorker === 'function') {
			return globals.MonacoEnvironment.getWorker(workerId, label);
		}
		if (typeof globals.MonacoEnvironment.getWorkerUrl === 'function') {
			return new Worker(globals.MonacoEnvironment.getWorkerUrl(workerId, label));
		}
	}
	// ESM-comment-begin
	if (typeof require === 'function') {
		// check if the JS lives on a different origin

		const workerMain = require.toUrl('./' + workerId);
		if (/^(http:)|(https:)|(file:)/.test(workerMain)) {
			const currentUrl = String(window.location);
			const currentOrigin = currentUrl.substr(0, currentUrl.length - window.location.hash.length - window.location.search.length - window.location.pathname.length);
			if (workerMain.substring(0, currentOrigin.length) !== currentOrigin) {
				// this is the cross-origin case
				// i.e. the webpage is running at a different origin than where the scripts are loaded from
				const workerBaseUrl = workerMain.substr(0, workerMain.length - 'vs/base/worker/workerMain.js'.length);
				const js = `/*${label}*/self.MonacoEnvironment={baseUrl: '${workerBaseUrl}'};importScripts('${workerMain}');/*${label}*/`;
				const url = `data:text/javascript;charset=utf-8,${encodeURIComponent(js)}`;
				return new Worker(url);
			}
		}
		return new Worker(workerMain + '#' + label);
	}
	// ESM-comment-end
	throw new Error(`You must define a function MonacoEnvironment.getWorkerUrl or MonacoEnvironment.getWorker`);
}

function isPromiseLike<T>(obj: any): obj is PromiseLike<T> {
	if (typeof obj.then === 'function') {
		return true;
	}
	return false;
}

/**
 * A worker that uses HTML5 web workers so that is has
 * its own global scope and its own thread.
 */
class WebWorker implements IWorker {

	private id: number;
	private worker: Promise<Worker> | null;

	constructor(moduleId: string, id: number, label: string, onMessageCallback: IWorkerCallback, onErrorCallback: (err: any) => void) {
		this.id = id;
		const workerOrPromise = getWorker('workerMain.js', label);
		if (isPromiseLike(workerOrPromise)) {
			this.worker = workerOrPromise;
		} else {
			this.worker = Promise.resolve(workerOrPromise);
		}
		this.postMessage(moduleId);
		this.worker.then((w) => {
			w.onmessage = function (ev: any) {
				onMessageCallback(ev.data);
			};
			(<any>w).onmessageerror = onErrorCallback;
			if (typeof w.addEventListener === 'function') {
				w.addEventListener('error', onErrorCallback);
			}
		});
	}

	public getId(): number {
		return this.id;
	}

	public postMessage(msg: string): void {
		if (this.worker) {
			this.worker.then(w => w.postMessage(msg));
		}
	}

	public dispose(): void {
		if (this.worker) {
			this.worker.then(w => w.terminate());
		}
		this.worker = null;
	}
}

export class DefaultWorkerFactory implements IWorkerFactory {

	private static LAST_WORKER_ID = 0;

	private _label: string | undefined;
	private _webWorkerFailedBeforeError: any;

	constructor(label: string | undefined) {
		this._label = label;
		this._webWorkerFailedBeforeError = false;
	}

	public create(moduleId: string, onMessageCallback: IWorkerCallback, onErrorCallback: (err: any) => void): IWorker {
		let workerId = (++DefaultWorkerFactory.LAST_WORKER_ID);

		if (this._webWorkerFailedBeforeError) {
			throw this._webWorkerFailedBeforeError;
		}

		return new WebWorker(moduleId, workerId, this._label || 'anonymous' + workerId, onMessageCallback, (err) => {
			logOnceWebWorkerWarning(err);
			this._webWorkerFailedBeforeError = err;
			onErrorCallback(err);
		});
	}
}
