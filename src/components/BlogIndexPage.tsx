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
      <hr />
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
    </div>
  );
}

export default BlogIndexPage;
