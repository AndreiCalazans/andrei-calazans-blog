import React from "react";
import { Link, useCurrentRoute } from "react-navi";

export const SiteNav = () => {
  const route = useCurrentRoute();
  const isHome = route.url.pathname === "/";
  return (
    <div>
      {!isHome && <><Link href="/">Home</Link> &bull;{" "} </>}
      <Link href="/about">About</Link> &bull;{" "}
      <Link href="/tags/react-native-weekly">React Native Weekly</Link> &bull;{" "}
      <Link href="/tags/til">TIL</Link> &bull;{" "}
      <Link href="/daily">Dailies</Link> &bull;{" "}
      <Link href="/tags">Tags</Link>{" "}
      &bull;{" "}
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
        href="www.linkedin.com/in/andrei-calazans"
        target="_blank"
        rel="noopener noreferrer"
      >
        Linkedin
      </a>{" "}
      &bull;{" "}
      <a href="/rss.xml" target="_blank">
        RSS
      </a>
    </div>
  );
};
