DDR A3 Dan Course Visualizer & BPM Tool
=======================================

![screenshot](screenshot.png)

A clean, fast, and mobile-friendly web application designed to help DanceDanceRevolution players visualize the A3 Dan (Class) mode courses and calculate their ideal scroll speed.

[➡️ Live Demo Link Here](https://ddr-dan-tool.rtfoy.co.uk/ "null")

Features
--------

-   Complete Course Listing: Displays all Single Play and Double Play Dan courses from 1st Dan to Kaiden, based on the DDR A3 version.

-   Dynamic BPM Calculator: Enter your personal target scroll speed (e.g., 300, 450) and instantly see the recommended `x` multiplier and resulting scroll speed for every song.

-   Variable BPM Support: For songs with a BPM range (e.g., 100-200), the tool calculates the resulting scroll speed range (e.g., `~200-400`) based on the multiplier.

-   Intuitive Filtering: Quickly switch between Single and Double play styles, or filter the view to a specific Dan level.

-   At-a-Glance Difficulty: Each song features a color-coded difficulty badge (e.g., ESP, CDP) to match the in-game representation.

-   Responsive Design: Built to be perfectly usable on any device, from a mobile phone to a desktop monitor.

-   Zero Dependencies: Runs with a simple, clean React setup using Vite. No complex libraries or frameworks needed.

Tech Stack
----------

-   Framework: [React](https://reactjs.org/ "null")

-   Build Tool: [Vite](https://vitejs.dev/ "null")

-   Styling: Plain CSS 

-   Deployment: [Cloudflare Pages](https://pages.cloudflare.com/ "null")

How to Run Locally
------------------

To get a local copy up and running, follow these simple steps.

### Prerequisites

You will need [Node.js](https://nodejs.org/en/ "null") installed on your machine.

### Installation

1.  Clone the repository:

    ```
    git clone https://github.com/blackalice/ddr-dan-tool.git

    ```

2.  Navigate into the project directory:

    ```
    cd your_repo_name

    ```

3.  Install NPM packages:

    ```
    npm install

    ```

4.  Run the development server:

    ```
    npm run dev

    ```

    The application will now be running locally, typically at `http://localhost:5173`.

Deployment
----------

This project is configured for easy, zero-cost deployment via Cloudflare Pages.

1.  Push your code to a GitHub repository.

2.  In the Cloudflare dashboard, create a new Pages project and connect it to your repository.

3.  Use the following build settings:

    -   Framework Preset: `Vite`

    -   Build command: `npm run build`

    -   Build output directory: `dist`

Cloudflare will automatically build and deploy your site. Any subsequent pushes to your main branch will trigger a new deployment.

Acknowledgements
----------------

-   Data for the Dan courses was sourced from community resources.

-   Built by [stu :)](https://stua.rtfoy.co.uk/ "null")