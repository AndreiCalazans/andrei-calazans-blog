import importAll from 'import-all.macro'
import * as Navi from 'navi'
import { join } from 'path'
import { sortBy } from 'lodash'
import slugify from 'slugify'

interface Context {
  blogRoot: string
}

// Get a list of all posts, that will not be loaded until the user
// requests them.
const postModules = importAll.deferred('./**/post.ts?(x)')
const importPost = pathname => postModules[pathname]()
const postPathnames = Object.keys(postModules)
const datePattern = /^((\d{1,4})-(\d{1,4})-(\d{1,4}))[/-]/

let postDetails = postPathnames.map(pathname => {
  let slug = slugify(
    pathname.replace(/post.tsx?$/, '').replace(/(\d)\/(\d)/, '$1-$2'),
  )
    .replace(/^[-.]+|[.-]+$/g, '')
    .replace(datePattern, '$1/')

  let date
  let dateMatch = slug.match(datePattern)
  if (dateMatch) {
    date = new Date(
      parseInt(dateMatch[2], 10),
      parseInt(dateMatch[3], 10) - 1,
      parseInt(dateMatch[4], 10),
    )
  }

  return {
    slug,
    pathname,
    date,
  }
})

// Sort the pages by slug (which contain the dates)
postDetails = sortBy(postDetails, ['slug']).reverse()

// Create url-friendly slugs from post pathnames, and a `getPage()` function
// that can be used to load and return the post's Page object.
let posts = postDetails.map(({ slug, pathname, date }, i) => ({
  getPage: Navi.map(async () => {
    let { default: post } = await importPost(pathname)
    let { title, getContent, ...meta } = post
    let previousSlug, previousPost, nextSlug, nextPost

    if (i !== 0) {
      let previousPostDetails = postDetails[i - 1]
      previousPost = (await importPost(previousPostDetails.pathname)).default
      previousSlug = previousPostDetails.slug
    }

    if (i + 1 < postDetails.length) {
      let nextPostDetails = postDetails[i + 1]
      nextPost = (await importPost(nextPostDetails.pathname)).default
      nextSlug = nextPostDetails.slug
    }

    return Navi.route({
      title,
      getData: (req, context: Context) => ({
        date,
        pathname,
        slug,
        previousDetails: previousPost && {
          title: previousPost.title,
          href: previousPost.link || join(context.blogRoot, 'posts', previousSlug),
        },
        nextDetails: nextPost && {
          title: nextPost.title,
          href: nextPost.link || join(context.blogRoot, 'posts', nextSlug),
        },
        ...meta,
      }),
      getView: async () => {
        let { default: MDXComponent, ...other } = await getContent()
        return { MDXComponent, ...other }
      },
    })
  }),
  slug,
}))

export default posts
