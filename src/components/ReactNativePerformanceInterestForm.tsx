import React, { useState } from "react";
import styles from "./ReactNativePerformanceInterestForm.module.css";

function isValidEmail(email: string) {
  return /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email);
}

// Yo hacker, this is a secured endpoint.
const api =
  "https://firestore.googleapis.com/v1/projects/personal-site-dae64/databases/(default)/documents/emails";

export function ReactNativePerformanceInterestForm() {
  const [email, setEmail] = useState("");
  const [didSubscribe, setDidSubscribe] = useState(false);
  function onSubmit() {
    fetch(api, {
      method: "post",
      body: JSON.stringify({
        fields: {
          email: { stringValue: email },
        },
      }),
    }).then(() => {
      setDidSubscribe(true);
    });
  }

  function handleText(e) {
    setEmail(e.target.value);
  }

  if (didSubscribe) {
    return (
      <div className={styles.subscribeContainer}>
        <p>Looking forward to sharing it with you! = )</p>
      </div>
    );
  }

  return (
    <div className={styles.subscribeContainer}>
      <h5>
        Add your email to be notified when this course and book becomes
        available
      </h5>
      <div>
        <input
          type="email"
          placeholder="Type your email..."
          onChange={handleText}
        />
        <button disabled={!isValidEmail(email)} onClick={onSubmit}>
          <label>Notify me!</label>
        </button>
      </div>
    </div>
  );
}
