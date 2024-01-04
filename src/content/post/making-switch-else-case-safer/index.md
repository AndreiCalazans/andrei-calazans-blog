---
title: "Enhancing Safety in TypeScript: Exhaustive Checks for Switch Cases"
description: "Explore how to enable exhaustive checks in TypeScript switch cases, enhancing code safety and reducing unhandled errors"
publishDate: "2024-01-04"
tags: ["typescript"]
---

This article reviews how you can enforce switch case exhaustiveness by either
using a global Eslint rule or explicitly enforcing it via the usage of
_assertNever_.

## assertNever approach

While you can use ESLINT rule that is type aware like
[switch-exhaustiveness-check](https://github.com/typescript-eslint/typescript-eslint/blob/main/packages/eslint-plugin/docs/rules/switch-exhaustiveness-check.md)

You can also make this approach more explicit allowing better control to when
you want to make the switch-case strict or not.

```typescript
/**
 * The `assertNever` function is used for exhaustiveness checks in TypeScript.
 * It acts as a safeguard in switch statements where all possible cases of an enum are meant to be handled.
 * If a new case is added to the enum and not handled in the switch, calling this function will cause a TypeScript
 * compile-time error, alerting the developer that a case has been missed.
 *
 * Usage:
 * In a switch statement, use the `assertNever` function in the default case. Pass the variable being switched on
 * to the function. If all enum cases are handled, the function will never be called. If an unhandled case exists,
 * TypeScript will throw an error because the function expects a type of `never`, which indicates an unreachable code
 * segment under normal circumstances.
 *
 * Example:
 * switch (myEnumValue) {
 *   case MyEnum.FirstCase:
 *     // Handle first case
 *     break;
 *   case MyEnum.SecondCase:
 *     // Handle second case
 *     break;
 *   default:
 *     assertNever(myEnumValue); // TypeScript will error if a new MyEnum case is not handled.
 * }
 */
export function assertNever(x: never): never {
  throw new Error(`Unexpected object: ${x}`);
}
```

## Examples

This forces the switch-case to handle all cases.

```jsx
switch (transferType) {
    case 'withdrawal':
    case 'deposit':
      currency = {
        code: transfer?.amount?.currency,
        type: 'fiat' as CurrencyType,
      };
      break;
    default:
      assertNever(transferType);
```

Even when you are returning something, you can return assertNever to ensure there is always a valid return.

```jsx

return useMemo(() => {
    switch (execution) {
      case 'allowTaker':
        return formatMessage(messages.executionTrayOptionAllowTaker);
      case 'postOnly':
        return formatMessage(messages.executionTrayOptionPostOnly);
      default:
        return assertNever(execution);
    }
  }, [execution, formatMessage]);
```

This also allows you to explicitly opt out by returning undefined instead.
Particularly nice to keep the return type consistent and not imply undefined.

```jsx
switch (tradeType) {
      case 'Buy':
      case 'Sell':
        return Analytics.track('convert_tapped_source_asset', params);
      case 'ConvertTo':
        return Analytics.track('convert_tapped_target_asset', params);
      default:
        return undefined;
    }
```

Use this paired with the [default-case](https://eslint.org/docs/latest/rules/default-case) lint rule to enforce everyone to
always handle a default case intentionally.



