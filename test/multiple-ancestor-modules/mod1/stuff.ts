import { SomeParams } from "./nested";

/**
 * Let's just add a comment to this one.
 *
 * @module Module 1
 */
export function decorate(obj: SomeParams): SomeParams {
  return {
    ...obj,
    num: obj.num + 1
  };
}

/**
 * @module Module 1
 */
let typeLiteral = {
  valueA: "stuff"
};

export { typeLiteral };
