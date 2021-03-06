/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from 'vs/workbench/common/editor';
import { URI } from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { BinaryEditorModel } from 'vs/workbench/common/editor/binaryEditorModel';
import { DataUri } from 'vs/base/common/resources';
import { withUndefinedAsNull } from 'vs/base/common/types';

/**
 * An editor input to present data URIs in a binary editor. Data URIs have the form of:
 * data:[mime type];[meta data <key=value>;...];base64,[base64 encoded value]
 */
export class DataUriEditorInput extends EditorInput {

	static readonly ID: string = 'workbench.editors.dataUriEditorInput';

	constructor(
		private readonly name: string | undefined,
		private readonly description: string | undefined,
		private readonly resource: URI,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();

		this.name = name;
		this.description = description;
		this.resource = resource;

		if (!this.name || !this.description) {
			const metadata = DataUri.parseMetaData(this.resource);

			if (!this.name) {
				this.name = metadata.get(DataUri.META_DATA_LABEL);
			}

			if (!this.description) {
				this.description = metadata.get(DataUri.META_DATA_DESCRIPTION);
			}
		}
	}

	getResource(): URI {
		return this.resource;
	}

	getTypeId(): string {
		return DataUriEditorInput.ID;
	}

	getName(): string | null {
		return withUndefinedAsNull(this.name);
	}

	getDescription(): string | null {
		return withUndefinedAsNull(this.description);
	}

	resolve(): Promise<BinaryEditorModel> {
		return this.instantiationService.createInstance(BinaryEditorModel, this.resource, this.getName()).load();
	}

	matches(otherInput: unknown): boolean {
		if (super.matches(otherInput) === true) {
			return true;
		}

		if (otherInput instanceof DataUriEditorInput) {
			const otherDataUriEditorInput = <DataUriEditorInput>otherInput;

			// Compare by resource
			return otherDataUriEditorInput.resource.toString() === this.resource.toString();
		}

		return false;
	}
}
