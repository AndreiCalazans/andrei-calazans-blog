---
title: "Hidden Cost of Large List of Objects in GraphQL"
description: "The cost of large list of objects in GraphQL and possible ways to optimize them."
publishDate: "2024-04-04"
tags: ["graphql", "relay"]
---

Of course we default to pagination whenever you intend to return to the client a
large list of items. But, what if you can't? what if you are rendering price
data for instance for a given period?

## The Problem

This is the case I encountered at work. We show crypto assets and we like to
render lines that show these asset's performance over time. At first the price
data was designed as the following in GraphQL:

```graphql

type CurrencyQuote {
  price: String
  timestamp: Time
  # omitting other parts...
}

type AssetPriceData {
  quotes: [CurrencyQuote!]
  percentChange: Float
  earliestQuote: CurrencyQuote
  # omitting other parts...
}

```

Super trivial. However, `AssetPriceData.quotes` returns 335 data points for a
given period. This is trivial for a single asset, but what happens when we are
rendering a list of assets where each row shows the asset's performance data in
a sparkline?

Now we have the number of assets times 335: n assets * 335, initially we show 10 so
that quickly becomes 3350 object references in whatever GraphQL client you are
using.

This is because GraphQL creates an object representation which
typically includes a `__id` and a `__typename` as follows:


```
  "client:<OMITTED>:priceDataForDayV2(quoteCurrency:\"usd\"):quotes:0":{
        "__id":"client:<OMITTED>:priceDataForDayV2(quoteCurrency:\"usd\"):quotes:0",
        "__typename":"CurrencyQuote",
        "price":"43764.9374",
        "timestamp":"2024-03-27T08:55:00-03:00"
    },
```

So with 3350 object references like these you will start to have problems.

On the
client. For us, since we use Relay, we noticed that Relay's
[`responseNormalize`](https://github.com/facebook/relay/blob/6b7ef4c56423b05b5294cc2740549c58ccb58006/packages/relay-runtime/store/normalizeResponse.js#L25)
calls were taking much longer than usual for these queries, around 500ms.

Then we also noticed that our persistent logic was taking much longer to save
all this data to local storage due to the size of the Relay Store.


## The Solution

So what can you do?

Paginate if you can and avoid sending all that data to the client, if that's not
possible ask yourself how can you optimize this case.

With GraphQL you opt into array of primitives to avoid all the extra steps
related to storing an object by the client.


So we would go from:

```graphql

type CurrencyQuote {
  price: String
  timestamp: Time
  # omitting other parts...
}

type AssetPriceData {
  quotes: [CurrencyQuote!]
  percentChange: Float
  earliestQuote: CurrencyQuote
  # omitting other parts...
}

```

To:

```graphql

type CurrencyQuoteV2 {
  prices: [String]
  timestamps: [Time]
}

type AssetPriceData {
  quotes: [CurrencyQuote!]
  quote: CurrencyQuoteV2
  percentChange: Float
  earliestQuote: CurrencyQuote
  # omitting other parts...
}

```

Noticed we didn't update the existing field to not cause a breaking change.

By doing this it was enough for us to see our local Relay Store to lose over
1.5mb in Store size and to have its `responseNormalize` call go from 500ms back
to 20ms.

## Conclusion

You can always look into optimizing the data type. Another solution we also
thought about was encoding that data into something that fits into less disk
space, however we also needed access to these price data points for other things.

