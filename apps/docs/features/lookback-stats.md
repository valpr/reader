# Reading Statistics & Lookback Dashboard

Valpr Reader features a comprehensive telemetry and analytics engine designed specifically for Japanese language acquisition and reading habits.

---

## Core Reading Metrics

Whenever you read with the reading tracker enabled, the reader measures:

- **Reading Time:** Active time spent reading (excluding pauses, idle time, or blurred windows).
- **Characters Read:** Character delta measured accurately across page flips and continuous scrolling.
- **Reading Speed:** Characters read per minute (`cpm`) calculated smoothly across session windows.
- **Dictionary Lookups:** Number of unique Yomitan and JPDB dictionary searches made while reading.
- **Lookup Density:** The ratio of lookups per 1,000 characters read (`lookups / characters * 1000`). A density above 12 indicates dense, challenging literature requiring active vocabulary acquisition.
- **Hourly Telemetry:** 24-hour distribution showing which hours of the day you read most actively.
- **Longest Session:** Automatically tracks the longest continuous reading block without interruption.

---

## The Lookback Dashboard

The **Lookback Dashboard** (accessible via the Statistics tab or `/statistics`) delivers a rich, visual recap of your reading journey:

### 1. Date Range Filtering

Explore your statistics across configurable time windows:

- **Past 7 Days** / **Past 30 Days**
- **Year to Date** (Annual Recap)
- **All Time**
- **Custom Date Range**

### 2. Reader Archetypes

Based on your reading velocity and lookup density, the Lookback engine assigns your reading profile archetype:

- **Vocab Hunter:** Awarded for high lookup density (≥ 12 lookups per 1k characters) or high lookup volume. Celebrates tackling complex texts, light novels with unfamiliar vocabulary, or classic literature.
- **Immersion Marathoner:** Awarded for high character volume and long continuous reading blocks.

### 3. Top Books Carousel

An interactive carousel showcasing your most-read books within the selected time window:

- Ranked by character volume and reading time.
- Displays book covers, completion status, and read dates.
- Clicking any book opens the **Book Details Dialog**, revealing exact characters read, reading time, dictionary lookups, and overall progress.

### 4. Progress Deltas

Compares your current performance directly against the prior period (e.g., this month vs. last month) with percentage change badges for characters read, reading hours, and vocabulary lookups.

---

## Reading Goals

Under **Settings > Statistics > Reading Goals**, you can set daily immersion targets:

- **Daily Time Goal:** e.g., 30 minutes or 1 hour per day.
- **Daily Character Goal:** e.g., 5,000 or 10,000 characters per day.
- Goals update live in the reader header and statistics window as you read.
