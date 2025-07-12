import React from "react";
import clsx from "clsx";
import styles from "./Breadcrumbs.module.css";

function buildLink(crumb, crumbs) {
  const targetCrumbIndex = crumbs.indexOf(crumb);
  const gathered = crumbs.reduce((building, curCrumb, index) => {
    if (index > targetCrumbIndex) {
      return building;
    }
    return building.concat(curCrumb.pathSegment);
  }, []);

  const path = `${gathered.join("/")}`;
  return path || "/";
}

const ROOT_CRUMB = { display: "Mixes", pathSegment: "" };

function Breadcrumbs({ className, crumbs }) {
  const entries = [ROOT_CRUMB].concat(crumbs).map((crumb, index, array) => {
    if (index === array.length - 1) {
      return (
        <li key={crumb.pathSegment} className={styles.breadcrumbEntry}>
          {crumb.display}
        </li>
      );
    }

    return (
      <li key={crumb.pathSegment} className={styles.breadcrumbEntry}>
        <a
          className={styles.link}
          href={buildLink(crumb, array)}
        >
          {crumb.display}
        </a>
      </li>
    );
  });

  return (
    <nav>
      <ul className={clsx(className, styles.list)}>{entries}</ul>
    </nav>
  );
}

export { Breadcrumbs };
