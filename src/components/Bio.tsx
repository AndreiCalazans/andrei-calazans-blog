import React from "react";
import styles from "./Bio.module.css";
import { SiteNav } from './SiteNav';

interface BioProps {
  className?: string;
}

const photoURL = "https://avatars1.githubusercontent.com/u/20777666?s=460&v=4";

function Bio(props: BioProps) {
  return (
    <>
      <div
        className={`
        ${styles.Bio}
        ${props.className || ""}
      `}
      >
        <img src={photoURL} alt="Me" />
        <p>
          I am a Software Engineer, these are my notes and thoughts
          <br />
          about Software Development.
        </p>
      </div>
      <SiteNav />
    </>
  );
}

export default Bio;
