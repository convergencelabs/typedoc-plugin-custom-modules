/**
 * Foo. Not bar.
 *
 * @moduledefinition Foo
 */

import { SomeParams } from "../multiple-ancestor-modules";

/**
 * @module Foo
 */
export class EntryPoint {
  private _num: number;

  constructor(params: SomeParams) {
    this._num = params.num + 1;
  }

  get num(): number {
    return this._num;
  }
}
