# Responsibility Matrix

## Product / Delivery

| Area | Primary owner | Support | Deliverables |
| --- | --- | --- | --- |
| Product scope | Product lead | Founder, design, engineering lead | Launch scope, priorities, tradeoffs |
| Launch readiness | Engineering lead | QA, product lead | Checklist, go/no-go decision |
| Content quality | Operations / content | Product, legal/domain advisors | Info Center accuracy, wording, freshness |

## Backend

| Area | Primary owner | Support | Deliverables |
| --- | --- | --- | --- |
| Auth / users / roles | Backend | Product | Roles, entitlements, geography, trust fields |
| Farm plots / crops / analytics | Backend | Data/product | Plot schema, crop module contracts, analytics rules |
| Marketplace | Backend | Product, operations | Listing schema, recommendation logic, trust fields |
| Services | Backend | Operations | Provider profile, CRUD, availability, stats |
| Chat | Backend | Product, moderation | Direct chat, regional channels, moderation hooks |
| Platform / ops | Backend | DevOps | Migrations, health, logging, monitoring |

## Frontend

| Area | Primary owner | Support | Deliverables |
| --- | --- | --- | --- |
| Dashboard | Frontend | Product, backend | Empty states, cards, insight UX |
| Market | Frontend | Backend, product | Listing cards, recommendation states, chat entry |
| Services | Frontend | Backend | Filters, provider pages, chat entry |
| Chat | Frontend | Backend, moderation | Direct and regional polling UX |
| Info Center | Frontend | Content, backend | Feed, detail pages, source handling |
| Mobile shell | Frontend | QA | Responsive web, Capacitor validation |

## QA / Operations

| Area | Primary owner | Support | Deliverables |
| --- | --- | --- | --- |
| Regression matrix | QA | Frontend, backend | Release pass on dashboard, market, services, chat |
| Content operations | Ops/content | Product | News, subsidies, source freshness |
| Moderation | Ops/moderation | Backend | Community chat and reviews policy |
| Launch support | Ops | Engineering | Incident routing, user feedback intake |
