# Deutsch_banh_sim
# Deutsche Bahn Domino Lab

> **Interactive German rail network simulator with live DB train feeds, delay propagation, and tactical dispatch scenarios.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-cyan.svg)](https://react.dev/)
[![TanStack Start](https://img.shields.io/badge/TanStack_Start-v1-orange.svg)](https://tanstack.com/start)

**Live Demo:** [deutsche-bahn-domino-lab.lovable.app](https://deutsche-bahn-domino-lab.lovable.app)

---

## Overview

**Deutsche Bahn Domino Lab** is a high-volume operational simulation tool that models train traffic, delays, and domino ripple effects across the entire German railway network.

Starting from an initial live snapshot of real-world Deutsche Bahn trains (retrieved via server-side HAFAS query with real stop sequences), the simulator advances time deterministically to let dispatchers and enthusiasts test tactical interventions and observe network-wide consequences.

---

## Key Features

### 1. Dual Operational Views
- **Geographic Rail Map:** High-contrast Leaflet map rendering all active high-speed, main, regional, and freight corridors with moving train markers color-coded by real-time delay (on-time, ≤10 min, >10 min).
- **Corridor Line Diagram (*Streckenband*):** Operator-grade linear view organizing services into stable corridor chains with virtualization for smooth rendering of 700+ active trains.

### 2. Physics & Delay Propagation
- **Realistic Delay Dominoes:** Train delays propagate backward through shared track segments and bottleneck nodes.
- **Headway & Block Safety Margins:** Trains respect dynamic safety blocks depending on track category (5 km high-speed, 2 km main, 1.5 km secondary, 1 km branch).
- **Speed Recovery:** Trains on free, unobstructed track recover up to ~8% of lost travel time.
- **Turnaround Delay Inheritance (*Folgeverspätung*):** Compositions that reach terminal stations with high delays carry residual delay over to their next scheduled rotation.

### 3. Tactical Dispatch & Scenario Testing
- **Stop & Substitute:** Hold an affected train at its next scheduled stop and dispatch a reserve train from the nearest depot (with new operational unit number suffix `...S`).
- **Transfer to Next Regular:** Cancel a heavily delayed service and transfer passengers to the next scheduled regular headway slot.
- **Depot Fleet Management:** Track reserve stocks partitioned by category (long-distance ICE/IC vs. regional DB Regio).
- **Deadhead Return Movements:** Substituted trains return empty (*Leerfahrt*) to maintenance depots and undergo overhaul before re-entering the reserve pool.
- **Recovery Reset:** Swap incoming delayed compositions at turnaround terminals with fresh depot reserves so outbound departures leave exactly on time.
- **Synthetic Network Disruptions:** Inject localized mechanical failures or temporary speed restriction zones (*Langsamfahrstelle*) to test network resilience.

### 4. Passenger Impact Balance
- Quantitative net passenger-hours calculation (+ hours saved vs. - hours lost) comparing current interventions against the unmanaged baseline world.

---

## Tech Stack

- **Framework:** [TanStack Start v1](https://tanstack.com/start) with Vite 7
- **Language:** TypeScript 5.8
- **UI & Components:** React 19, Tailwind CSS v4, Radix UI, Lucide Icons
- **Mapping:** Leaflet with custom SVG train markers and viewport virtualization
- **Live Data:** Server-side HAFAS parser (`createServerFn`)
- **Testing:** Vitest with unit and timeline step test suites

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (version 20 or higher) or [Bun](https://bun.sh/)
- Git

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/deutsche-bahn-domino-lab.git
   cd deutsche-bahn-domino-lab

