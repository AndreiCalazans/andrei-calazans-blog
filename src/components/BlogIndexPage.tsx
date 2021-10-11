import { Route } from "navi";
import React from "react";
import { Link } from "react-navi";
import siteMetadata from "../siteMetadata";
import ArticleSummary from "./ArticleSummary";
import Bio from "./Bio";
import Pagination from "./Pagination";
import styles from "./BlogIndexPage.module.css";

interface BlogIndexPageProps {
  blogRoot: string;
  pageCount: number;
  pageNumber: number;
  postRoutes: Route[];
}

function BlogIndexPage({
  blogRoot,
  pageCount,
  pageNumber,
  postRoutes,
}: BlogIndexPageProps) {
  return (
    <div>
      <header>
        <h1 className={styles.title}>
          <Link href={blogRoot}>{siteMetadata.title}</Link>
        </h1>
        <Bio />
      </header>
      <ul className={styles.articlesList}>
        {postRoutes.map((route) => (
          <li key={route.url.href}>
            <ArticleSummary blogRoot={blogRoot} route={route} />
          </li>
        ))}
      </ul>
      {pageCount > 1 && (
        <Pagination
          blogRoot={blogRoot}
          pageCount={pageCount}
          pageNumber={pageNumber}
        />
      )}
      <footer className={styles.footer}>
        <div>
          <a href="./rss.xml" target="_blank" style={{ float: "right" }}>
            RSS
          </a>
          <Link href="./about">About</Link> &bull;{" "}
          <Link href="./tags">Tags</Link> &bull; : blogRoot{" "}
          <a
            href="https://github.com/andreiCalazans"
            target="_blank"
            rel="noopener noreferrer"
          >
            Github
          </a>{" "}
          &bull;{" "}
          <a
            href="https://twitter.com/Andrei_Calazans"
            target="_blank"
            rel="noopener noreferrer"
          >
            Twitter
          </a>{" "}
          &bull;{" "}
          <a
            href="https://www.linkedin.com/in/andrei-xavier-de-oliveira-calazans-8b1269115"
            target="_blank"
            rel="noopener noreferrer"
          >
            Linkedin
          </a>
        </div>
      </footer>
    </div>
  );
}

export default BlogIndexPage;
