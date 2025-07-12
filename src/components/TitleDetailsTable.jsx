import React from "react";
import clsx from "clsx";
import styles from "./TitleDetailsTable.module.css";

function TitleDetailsRow({ name, value }) {
  return (
    <tr>
      <td className={styles.nameCell}>{name}</td>
      <td className={styles.valueCell}>{value}</td>
    </tr>
  );
}

function TitleDetailsTable({ className, children }) {
  return (
    <table className={clsx(className, styles.table)}>
      <tbody>{children}</tbody>
    </table>
  );
}

export { TitleDetailsTable, TitleDetailsRow };
