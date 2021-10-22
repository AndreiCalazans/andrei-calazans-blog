import React from 'react'
import {
  Link,
  NotFoundBoundary,
  View,
  useLoadingRoute
} from 'react-navi'
import { Helmet } from 'react-navi-helmet-async'
import siteMetadata from '../siteMetadata'
import NotFoundPage from './NotFoundPage'
import LoadingIndicator from './LoadingIndicator'
import styles from './BlogLayout.module.css'

interface BlogLayoutProps {
  blogRoot: string
  isViewingIndex: boolean
}

function BlogLayout({ blogRoot, isViewingIndex }: BlogLayoutProps) {
  let loadingRoute = useLoadingRoute()
  return (
    <>
    <Helmet>
        <meta name="description" content={siteMetadata.description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.andrei-calazans.com/" />
        <meta property="og:title" content={siteMetadata.title} />
        <meta property="og:description" content={siteMetadata.description} />

        <meta property="twitter:url" content="https://www.andrei-calazans.com/" />
        <meta property="twitter:title" content={siteMetadata.title} />
        <meta property="twitter:description" content={siteMetadata.description} />
      </Helmet>
    <div>
      <LoadingIndicator active={!!loadingRoute} />

      {// Don't show the header on index pages, as it has a special
      // header.
      !isViewingIndex && (
        <header>
          <h3 className={styles.title}>
            <Link href={blogRoot}>{siteMetadata.title}</Link>
          </h3>
        </header>
      )}

      <main>
        <NotFoundBoundary render={() => <NotFoundPage />}>
          <View />
        </NotFoundBoundary>
      </main>
    </div>
    </>
  )
}

export default BlogLayout
