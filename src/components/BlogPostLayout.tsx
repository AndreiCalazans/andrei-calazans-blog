import React from "react";
import { Link, useCurrentRoute, useView } from "react-navi";
import { MDXProvider } from "@mdx-js/react";
import { Helmet } from "react-navi-helmet-async";
import siteMetadata from "../siteMetadata";
import ArticleMeta from "./ArticleMeta";
import { Subscribe } from "./Subscribe";
import Bio from "./Bio";
import styles from "./BlogPostLayout.module.css";

interface BlogPostLayoutProps {
  blogRoot: string;
}

function BlogPostLayout({ blogRoot }: BlogPostLayoutProps) {
  let { title, data, url } = useCurrentRoute();

  let fullUrl = `https://www.andrei-calazans.com${url.pathname}`;
  let shareableLink = encodeURIComponent(fullUrl);

  let discussUrl = `https://mobile.twitter.com/search?q=${shareableLink}`;
  let shareLink = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    `${title} by @Andrei_Calazans - ${fullUrl}`
  )}`;

  let { connect, content, head } = useView()!;
  let { MDXComponent, readingTime } = content;

  // The content for posts is an MDX component, so we'll need
  // to use <MDXProvider> to ensure that links are rendered
  // with <Link>, and thus use pushState.
  return connect(
    <>
      <Helmet>
        <meta name="description" content={data.spoiler} />
        <meta name="keywords" content={data.tags} />

        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.andrei-calazans.com/" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={data.spoiler} />

        <meta
          property="twitter:url"
          content="https://www.andrei-calazans.com/"
        />
        <meta property="twitter:title" content={title} />
        <meta property="twitter:description" content={data.spoiler} />
      </Helmet>
      {head}
      <article className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>
            <Link href={url.pathname}>{title}</Link>
          </h1>
          <ArticleMeta
            blogRoot={blogRoot}
            data={data}
            readingTime={readingTime}
          />
        </header>
        <MDXProvider
          components={{
            a: Link,
            wrapper: ({ children }) => (
              <div className={styles.content}>{children}</div>
            ),
          }}
        >
          <MDXComponent />
        </MDXProvider>
        <footer className={styles.footer}>
          <p>
            <a target="_blank" rel="noopener noreferrer" href={shareLink}>
              Share on Twitter
            </a>
            {` • `}
            <a href={discussUrl} target="_blank" rel="noopener noreferrer">
              Discuss on Twitter
            </a>
            {` • `}
            <a
              className="buy_me_coffee"
              target="_blank"
              rel="noopener noreferrer"
              href="https://www.buymeacoffee.com/andreicalazans"
            >
              <img
                style={{ width: 16, height: 16 }}
                src={require("./BMC_Logo.svg")}
                alt="Coffee Image"
              />
              Buy me coffee = )
            </a>
          </p>
          <Subscribe />
          <h3 className={styles.title}>
            <Link href={blogRoot}>{siteMetadata.title}</Link>
          </h3>
          <Bio className={styles.bio} />
          <section className={styles.links}>
            {data.previousDetails && (
              <Link
                className={styles.previous}
                href={data.previousDetails.href}
              >
                ← {data.previousDetails.title}
              </Link>
            )}
            {data.nextDetails && (
              <Link className={styles.next} href={data.nextDetails.href}>
                {data.nextDetails.title} →
              </Link>
            )}
          </section>
        </footer>
      </article>
    </>
  );
}

export default BlogPostLayout;
