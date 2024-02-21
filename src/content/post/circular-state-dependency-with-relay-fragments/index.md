---
title: "The Problem With Relay Fragments And Conditional Rendering"
description: "GraphQL's fragments always fetch irregardless if the consuming component renders or not causing over-fetching"
publishDate: "2024-02-16"
tags: ["graphql", "relay"]
---

GraphQL's fragments causes an issue with conditional rendering. Let's say you query the following data:

```jsx
graphql`
	query Main {
		viewer {
			...internalDataFragment
		}
	}
`;
```

Let's say `internalDataFragment` is a conditionally rendered component.

When that component is not rendered the data required inside the fragment will be queried. This is technically over-fetching.

## How do you fix this?

GraphQL clients often support directives to skip a query. For example Relay has a `@skip` directive we can use as such:

```jsx
graphql`
	query Main($skipInternalData: Boolean!) {
		viewer {
			hasFirstBuy
			...internalDataFragment @skip(if: $skipInternalData)
		}
	}
`;
```

However, this now introduces another problem - how do you manage `skipInternalData` state? What if `skipInternalData` is derived from the GraphQL response itself? This circular data dependency would cause a network waterfall. This is non-trivial to solve.

```jsx
return !viewer.hasFirstBuy ? <ComponentWithInternalData queryRef={viewer} /> : null;
```

Solving this requires us to create state indirection. That is, create a state above the query and updated it once your GraphQL response arrives with the information to know if that query should render or not.

```jsx
const [hasFirstBuy, setHasFirstBuy] = useState(false);
const query = useQuery(
	graphql`
		query Main($skipInternalData: Boolean!) {
			viewer {
				hasFirstBuy
				...internalDataFragment @skip(if: $skipInternalData)
			}
		}
	`,
	{ skipInternalData: !hasFirstBuy },
);

if (!hasFirstBuy && query.viewer.hasFirstBuy) {
	setHasFirstBuy(true);
}

return viewer.hasFirstBuy ? <ComponentWithInternalData queryRef={viewer} /> : null;
```

The above fixes the issue by kinda of causing another one - a request waterfall. The `internalDataFragment` will only get fetched on the second pass which is not ideal. However, Relay and other GraphQL clients don't give us a way to solve this kinda of data dependency unless you move this logic to your server at the resolver level.

## Sidenote On Setting State In Render

```javascript
if (!hasFirstBuy && query.viewer.hasFirstBuy) {
	setHasFirstBuy(true);
}
```

It is smart to set state in the render body as done above instead of within a
useEffect so you can abort the current rendering of the component and
immediately cause a re-render.
