
/**
 * @module Module 1
 */
export class Module1Nested {
  constructor(params: SomeParams) {
    console.log(params.str);
  }
}

/**
 * @module Module 1
 */
export interface SomeParams {
  str: string;
  num: number;
}