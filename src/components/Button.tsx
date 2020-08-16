import * as React from 'react';
import styles from './Button.module.css'

export const Button = ({ onClick, title }) => {
  return (
    <button className={styles.button} onClick={onClick}>
      <p>{title}</p>
    </button>
  )
}

