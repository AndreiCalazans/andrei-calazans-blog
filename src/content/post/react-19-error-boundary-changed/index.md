---
title: "React 19 Error Boundary Behaves Differently"
description: "An exploration of changes in error boundary behavior in React 19."
publishDate: "2025-11-06"
tags: ["react"]
---

I recently upgraded a React Native app to React 19 and found an interesting
change of behavior regarding error boundaries.

[In React 19 blog post](https://it.react.dev/blog/2024/12/05/react-19#error-handling) it
mentions how error handling has been improved by reducing the duplicate error
logs that get caught in componentDidCatch. Now React will
only throw one error.


But there is more, let's look at the following example:

```jsx
import React from "react";

function Throws({ id }) {
	console.log("rendered throw ", id);
	throw new Error("Something went wrong " + id);
	return null;
}

class ErrorBoundary extends React.Component {
	constructor(props) {
		super(props);
		this.state = { hasError: false };
	}

	static getDerivedStateFromError(error) {
		return { hasError: true };
	}

	componentDidCatch(error, errorInfo) {
		console.log(error, errorInfo);
	}

	render() {
		if (this.state.hasError) {
			return <h1>Something went wrong.</h1>;
		}

		return this.props.children;
	}
}

export default function App() {
	return (
		<div className="App">
			<h1>Test the error boundary</h1>
			<ErrorBoundary fallback={<p>opps yo</p>}>
				<h1>Hello world</h1>
				<Throws id="one" />
				<Throws id="two" />
			</ErrorBoundary>
		</div>
	);
}
```

## Rendering Order

Will the "rendered throw one" and "rendered throw two" messages be logged to the
console?

In React 18 and earlier, both messages would be logged and the componentDidCatch
would be called for twice for each error thrown by the Throws component.

```logs
rendered throw  one
rendered throw  one
Error: Something went wrong one
Error: Something went wrong one
rendered throw  two
rendered throw  two
Error: Something went wrong two
Error: Something went wrong two
```

*Interesting note how React attempts to render twice the errored component
before calling componentDidCatch. It's supposedly seeing if it is recoverable.*

However, in React 19 the renderer chooses to bail out after the first error is
thrown. Therefore, only "rendered throw one" is logged and componentDidCatch

```logs
rendered throw  one
rendered throw  one
Error: Something went wrong one
```

This makes a lot of sense specially since if the first error throws the sibling
component is wasting resource and won't be rendered anyway given the shared
ErrorBoundary parent.

## Conclusion

At work we had some logic to avoid error log duplication and now we were able to
remove most of this logic.
